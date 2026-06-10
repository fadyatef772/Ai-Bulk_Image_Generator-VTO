import {
  IImageGenerationService,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ILoggerService,
} from '../../domain/interfaces/index';
import { GeminiError } from '../../application/errors/AppErrors';

export class VertexGeminiService implements IImageGenerationService {
  constructor(private readonly logger: ILoggerService) {}

  private get projectId(): string {
    return process.env.VERTEX_PROJECT_ID || '';
  }

  private get location(): string {
    return process.env.VERTEX_LOCATION || 'us-central1';
  }

  private async getAccessToken(): Promise<string> {
    try {
      const adcToken = await this.getTokenFromAdcFile();
      if (adcToken) return adcToken;
    } catch (err) {
      this.logger.debug('ADC file not found or unreadable — trying metadata server', {});
    }

    try {
      const metaToken = await this.getTokenFromMetadataServer();
      if (metaToken) return metaToken;
    } catch {
      // Not on GCP infra
    }

    throw new GeminiError(
      'Vertex AI: Could not resolve ADC credentials.\n' +
      'Run: gcloud auth application-default login'
    );
  }

  private async getTokenFromAdcFile(): Promise<string | null> {
    const { readFile } = await import('fs/promises');
    const { homedir } = await import('os');
    const { join } = await import('path');

    const adcPath = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json');

    let adcRaw: string;
    try {
      adcRaw = await readFile(adcPath, 'utf-8');
    } catch {
      return null;
    }

    const adc = JSON.parse(adcRaw) as AdcFile;

    if (adc.type === 'authorized_user') {
      return this.refreshUserToken(adc);
    }

    if (adc.type === 'impersonated_service_account') {
      const userToken = await this.refreshUserToken(adc.source_credentials);
      return this.impersonateServiceAccount(adc.service_account_impersonation_url, userToken);
    }

    return null;
  }

  private async refreshUserToken(creds: AuthorizedUserCreds): Promise<string> {
    const body = new URLSearchParams({
      client_id:     creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type:    'refresh_token',
    });

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new GeminiError(`OAuth2 token refresh failed (${resp.status}): ${err}`);
    }

    const json = (await resp.json()) as { access_token: string };
    return json.access_token;
  }

  private async impersonateServiceAccount(
    impersonationUrl: string,
    userAccessToken: string,
  ): Promise<string> {
    const resp = await fetch(impersonationUrl, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json',
      },
      body:   JSON.stringify({ scope: ['https://www.googleapis.com/auth/cloud-platform'] }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      if (resp.status === 401 || resp.status === 403) {
        throw new GeminiError(
          `SA impersonation failed (${resp.status}). ` +
          'Ensure your user account has roles/iam.serviceAccountTokenCreator on the SA.'
        );
      }
      throw new GeminiError(`SA impersonation error (${resp.status}): ${err}`);
    }

    const json = (await resp.json()) as { accessToken: string };
    return json.accessToken;
  }

  private async getTokenFromMetadataServer(): Promise<string | null> {
    const resp = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal:  AbortSignal.timeout(3_000),
      }
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token: string };
    return json.access_token;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { imageBuffer, mimeType, prompt, model } = request;

    if (!this.projectId) {
      throw new GeminiError(
        'Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file.'
      );
    }

    this.logger.info('Starting Vertex AI image generation', {
      model,
      projectId: this.projectId,
      location:  this.location,
    });

    try {
      const accessToken = await this.getAccessToken();

      const endpoint =
        `https://${this.location}-aiplatform.googleapis.com/v1` +
        `/projects/${this.projectId}` +
        `/locations/${this.location}` +
        `/publishers/google/models/${model || 'gemini-2.0-flash-exp'}:generateContent`;

      const body = {
        contents: [{
          role:  'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      };

      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error('Vertex AI HTTP error', undefined, {
          status: resp.status,
          body:   errText.slice(0, 400),
        });

        if (resp.status === 401 || resp.status === 403) {
          throw new GeminiError(
            'Vertex AI authentication failed. Run:\n' +
            '  gcloud auth application-default login'
          );
        }
        if (resp.status === 429) {
          throw new GeminiError('Vertex AI rate limit exceeded. Please wait and retry.');
        }
        throw new GeminiError(`Vertex AI error ${resp.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await resp.json()) as VertexResponse;

      let resultImageBuffer: Buffer | null = null;
      let resultMimeType = 'image/png';

      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            resultImageBuffer = Buffer.from(part.inlineData.data, 'base64');
            resultMimeType    = part.inlineData.mimeType;
            break;
          }
        }
        if (resultImageBuffer) break;
      }

      if (!resultImageBuffer) {
        const textParts = (data.candidates || [])
          .flatMap(c => c.content?.parts || [])
          .map(p => p.text)
          .filter(Boolean)
          .join(' ');
        throw new GeminiError(
          `Vertex AI did not return an image. Response: ${(textParts || 'empty').slice(0, 200)}`
        );
      }

      this.logger.info('Vertex AI image generation successful', {
        outputSize:     resultImageBuffer.length,
        outputMimeType: resultMimeType,
      });

      return {
        imageBuffer: resultImageBuffer,
        mimeType:    resultMimeType,
        tokensUsed:  data.usageMetadata?.totalTokenCount,
      };

    } catch (error) {
      if (error instanceof GeminiError) throw error;
      const err = error as Error;
      this.logger.error('Vertex AI error', err);
      throw new GeminiError(`Vertex AI error: ${err.message}`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.projectId) return false;
    try {
      const token = await this.getAccessToken();
      const resp = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`,
        { signal: AbortSignal.timeout(8_000) }
      );
      return resp.ok;
    } catch {
      return false;
    }
  }
}

interface AuthorizedUserCreds {
  client_id:     string;
  client_secret: string;
  refresh_token: string;
}

interface AdcFile {
  type: 'authorized_user' | 'impersonated_service_account';
  client_id?:     string;
  client_secret?: string;
  refresh_token?: string;
  service_account_impersonation_url?: string;
  source_credentials?: AuthorizedUserCreds;
}

interface VertexResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?:       string;
        inlineData?: { mimeType: string; data: string };
      }>;
    };
  }>;
  usageMetadata?: { totalTokenCount?: number };
}