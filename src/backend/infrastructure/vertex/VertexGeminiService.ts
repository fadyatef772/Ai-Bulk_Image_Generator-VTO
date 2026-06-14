import { GoogleAuth } from 'google-auth-library';
import {
  IImageGenerationService,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ILoggerService,
} from '../../domain/interfaces/index';
import { GeminiError } from '../../application/errors/AppErrors';

/**
 * Image generation, editing, and analysis via Vertex AI (Google Cloud).
 *
 * ─── Authentication (ADC via google-auth-library) — DO NOT MODIFY ───────
 * Uses GoogleAuth with the cloud-platform scope. This relies on
 * Application Default Credentials configured via:
 * gcloud auth application-default login
 * ──────────────────────────────────────────────────────────────────────
 */

/**
 * Model used for VTO Step A (product analysis). Confirmed available on
 * Vertex AI for this project via :generateContent with image input +
 * text output (multimodal input -> text output is standard; do NOT
 * request responseModalities: ['IMAGE'] with this model, it will 400).
 */
const MODEL_GEMINI_ANALYSIS = 'gemini-2.5-flash';

const ANALYZE_PRODUCT_PROMPT = `You are a senior e-commerce product photographer and copywriter.
Look closely at the product in this image and produce a single, dense paragraph
describing it in highly visual, technical detail so it can be used verbatim as
part of an AI image-generation prompt. Include:
- Product category and exact shape/silhouette
- Materials and textures (e.g. matte leather, brushed metal, glossy plastic)
- Colors (be specific: "cream beige" not just "white")
- Notable design details (stitching, hardware, logos, patterns, straps, soles)
- Proportions and distinguishing features
Do not describe the background. Do not add commentary, headers, or markdown —
output only the descriptive paragraph.`;

export class VertexGeminiService implements IImageGenerationService {
  constructor(private readonly logger: ILoggerService) {}

  private get projectId(): string {
    return (process.env.VERTEX_PROJECT_ID || '').trim();
  }

  private get location(): string {
    return (process.env.VERTEX_LOCATION || 'us-central1').trim();
  }

  // ── Token resolution (google-auth-library) ───────────────────

  private auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  private async getAccessToken(): Promise<string> {
    try {
      const token = await this.auth.getAccessToken();
      if (token) return token;
    } catch (err) {
      this.logger.error('Vertex AI: Failed to retrieve access token via google-auth-library', err as Error);
    }

    throw new GeminiError(
      'Vertex AI: Could not resolve ADC credentials.\n' +
      'Run: gcloud auth application-default login'
    );
  }

  // ── Image generation & Editing (Imagen 3 Predict API) ────────

  // ── Image generation & Editing (Imagen 3 & Imagen 2) ────────

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { prompt, baseImageBase64, maskImageBase64 } = request;

    if (!this.projectId) {
      throw new GeminiError(
        'Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file.'
      );
    }

    // التوجيه الذكي: Imagen 2 للتعديل (لأنه الأكثر استقراراً للدمج)، و Imagen 3 للتوليد
    const MODEL_ID = baseImageBase64 ? 'imagegeneration@006' : 'imagen-3.0-generate-002';
    const operationType = baseImageBase64 ? 'Editing/Inpainting' : 'Generation';

    this.logger.info(`Starting Vertex AI (Imagen) image ${operationType}`, {
      model:     MODEL_ID,
      projectId: this.projectId,
      location:  this.location,
    });

    try {
      const accessToken = await this.getAccessToken();

      const endpoint =
        `https://${this.location}-aiplatform.googleapis.com/v1` +
        `/projects/${this.projectId}` +
        `/locations/${this.location}` +
        `/publishers/google/models/${MODEL_ID}:predict`;

      // بناء الـ Payload بالشكل القياسي الصارم المعتمد من جوجل
      const instance: any = { prompt };
      const parameters: any = { sampleCount: 1 };

      if (baseImageBase64) {
        instance.image = { bytesBase64Encoded: baseImageBase64 };
        
        // التعديل المصيري: الماسك مكانه الصحيح داخل الـ instance
        if (maskImageBase64) {
          instance.mask = {
            image: { bytesBase64Encoded: maskImageBase64 }
          };
          // تحديد نوع العملية داخل الـ parameters
          parameters.editConfig = {
            editMode: 'INPAINT_INSERTION'
          };
        }
      }

      const payload = { instances: [instance], parameters };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60_000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error('Vertex AI Imagen API error', undefined, {
          status: resp.status,
          body: errText,
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new GeminiError(`Vertex AI authentication failed. Details: ${errText}`);
        }
        throw new GeminiError(`Vertex AI API error (${resp.status}): ${errText.slice(0, 500)}`);
      }

      const json = (await resp.json()) as VertexPredictResponse;
      const prediction = json.predictions?.[0];

      if (!prediction?.bytesBase64Encoded) {
        throw new GeminiError('Vertex AI did not return an image in the response.');
      }

      const resultImageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
      const resultMimeType = prediction.mimeType || 'image/png';

      this.logger.info('Vertex AI image generation successful', {
        outputSize: resultImageBuffer.length,
        outputMimeType: resultMimeType,
      });

      return { imageBuffer: resultImageBuffer, mimeType: resultMimeType };
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      const err = error as Error;
      this.logger.error('Vertex AI error', err);
      throw new GeminiError(`Vertex AI error: ${err.message}`);
    }
  }

  // ── VTO Step A: Product analysis via Vertex AI (Gemini, ADC auth) ────────

  /**
   * Sends the product image to Gemini (on Vertex AI, via the SAME ADC
   * credentials used by generateImage) and returns a single dense
   * paragraph describing it in visual/technical detail.
   *
   * IMPORTANT: This intentionally does NOT use the direct Gemini API
   * (@google/generative-ai + GEMINI_API_KEY). That path is unreliable
   * here because GEMINI_API_KEY in .env is not a valid Generative
   * Language API key, causing every call to fail and silently fall back
   * to a generic "consumer good" description — which produces unrelated
   * output images (e.g. a shoe upload generating a jar/bottle photo).
   *
   * On failure this THROWS (no silent generic fallback), so a bad
   * description never silently corrupts the rest of the pipeline.
   */
  async analyzeProduct(imageBase64: string, mimeType: string = 'image/png'): Promise<string> {
    if (!this.projectId) {
      throw new GeminiError(
        'Vertex AI Project ID not configured. Set VERTEX_PROJECT_ID in your .env file.'
      );
    }

    this.logger.info('VTO Step A: analyzing product image via Vertex AI', {
      model: MODEL_GEMINI_ANALYSIS,
      projectId: this.projectId,
      location: this.location,
      mimeType,
    });

    try {
      const accessToken = await this.getAccessToken();

      const endpoint =
        `https://${this.location}-aiplatform.googleapis.com/v1` +
        `/projects/${this.projectId}` +
        `/locations/${this.location}` +
        `/publishers/google/models/${MODEL_GEMINI_ANALYSIS}:generateContent`;

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { text: ANALYZE_PRODUCT_PROMPT },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT'] },
      };

      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        this.logger.error('VTO Step A failed: Gemini analysis HTTP error', undefined, {
          status: resp.status,
          body: errText.slice(0, 400),
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new GeminiError(`Vertex AI authentication failed. Details: ${errText.slice(0, 300)}`);
        }
        if (resp.status === 404) {
          throw new GeminiError(
            `Vertex AI model ${MODEL_GEMINI_ANALYSIS} not found for analysis. ` +
            `Check your project ID and location. Details: ${errText.slice(0, 300)}`
          );
        }
        throw new GeminiError(`Gemini analysis error (${resp.status}): ${errText.slice(0, 500)}`);
      }

      const data = (await resp.json()) as GeminiGenerateContentResponse;

      const text = (data.candidates || [])
        .flatMap(c => c.content?.parts || [])
        .map(p => p.text)
        .filter(Boolean)
        .join(' ')
        .trim();

      if (!text) {
        throw new GeminiError('VTO Step A: Gemini returned no description text.');
      }

      this.logger.info('VTO Step A complete: product description generated', {
        descriptionLength: text.length,
        descriptionPreview: text.slice(0, 120),
      });

      return text;

    } catch (error) {
      if (error instanceof GeminiError) throw error;
      const err = error as Error;
      this.logger.error('VTO Step A error', err);
      throw new GeminiError(`Product analysis error: ${err.message}`);
    }
  }

  // ── Public helpers for VirtualTryOnService ───────────────────────────────

  /** Expose ADC token so VirtualTryOnService can reuse the same auth */
  async getToken(): Promise<string> {
    return this.getAccessToken();
  }

  getProjectId(): string {
    return (process.env.VERTEX_PROJECT_ID || '').trim();
  }

  getLocation(): string {
    return (process.env.VERTEX_LOCATION || 'us-central1').trim();
  }
}

// ── Vertex AI API response types ────────────────────────────────────────────

interface VertexPredictResponse {
  predictions?: Array<{
    bytesBase64Encoded: string;
    mimeType?: string;
  }>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType: string; data: string };
      }>;
    };
  }>;
}