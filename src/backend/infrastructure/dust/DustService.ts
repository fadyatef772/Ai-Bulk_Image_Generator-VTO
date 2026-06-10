import {
  IImageGenerationService,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ILoggerService,
} from '../../domain/interfaces/index';
import { GeminiError } from '../../application/errors/AppErrors';

/**
 * Image generation via Dust.tt agent API.
 *
 * Dust agents can wrap any underlying model (Gemini, Claude, GPT-4o, etc.)
 * and are invoked via the Dust Conversation API. The agent must be configured
 * on Dust.tt to accept base64 image attachments and return an edited image.
 *
 * Docs: https://docs.dust.tt/reference/post_v1-w-wid-assistant-conversations
 */
export class DustService implements IImageGenerationService {
  private static readonly API_BASE = 'https://dust.tt/api/v1';

  constructor(private readonly logger: ILoggerService) {}

  private get apiKey(): string {
    return process.env.DUST_API_KEY || '';
  }

  private get workspaceId(): string {
    return process.env.DUST_WORKSPACE_ID || '';
  }

  private get agentId(): string {
    return process.env.DUST_AGENT_ID || '';
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { imageBuffer, mimeType, prompt } = request;

    if (!this.apiKey || !this.workspaceId || !this.agentId) {
      throw new GeminiError(
        'Dust.tt credentials not fully configured. Please set API Key, Workspace ID, and Agent ID in Settings.'
      );
    }

    this.logger.info('Starting Dust.tt image generation', {
      agentId: this.agentId,
      workspaceId: this.workspaceId,
      mimeType,
    });

    try {
      // Step 1 — create a new conversation
      const convoResp = await fetch(
        `${DustService.API_BASE}/w/${this.workspaceId}/assistant/conversations`,
        {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            title: null,
            visibility: 'unlisted',
            message: {
              content: prompt,
              mentions: [{ configurationId: this.agentId }],
              context: {
                timezone: 'UTC',
                username: 'bulk-image-generator',
                fullName: 'AI Bulk Image Generator',
                email: null,
                profilePictureUrl: null,
              },
              // Attach image as base64 content block
              attachments: [
                {
                  title: 'input_image',
                  content: `data:${mimeType};base64,${imageBuffer.toString('base64')}`,
                  contentType: mimeType,
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!convoResp.ok) {
        const errText = await convoResp.text();
        this.logger.error('Dust.tt conversation creation failed', undefined, {
          status: convoResp.status,
          body: errText,
        });
        if (convoResp.status === 401) {
          throw new GeminiError('Dust.tt API key is invalid or expired.');
        }
        if (convoResp.status === 404) {
          throw new GeminiError(
            'Dust.tt workspace or agent not found. Check Workspace ID and Agent ID.'
          );
        }
        throw new GeminiError(`Dust.tt error ${convoResp.status}: ${errText.slice(0, 300)}`);
      }

      const convoData = (await convoResp.json()) as {
        conversation?: { sId: string };
        error?: { message: string };
      };

      if (!convoData.conversation?.sId) {
        throw new GeminiError(
          `Dust.tt did not return a conversation ID. ${convoData.error?.message || ''}`
        );
      }

      const conversationId = convoData.conversation.sId;
      this.logger.debug('Dust.tt conversation created', { conversationId });

      // Step 2 — poll for the agent's message
      const agentMessage = await this.pollForAgentMessage(conversationId);

      // Step 3 — extract image from response
      const imageResult = this.extractImageFromMessage(agentMessage);
      if (!imageResult) {
        throw new GeminiError(
          'Dust.tt agent did not return an image. Ensure the agent is configured to output images.'
        );
      }

      this.logger.info('Dust.tt image generation successful', {
        outputSize: imageResult.buffer.length,
        outputMimeType: imageResult.mimeType,
      });

      return {
        imageBuffer: imageResult.buffer,
        mimeType: imageResult.mimeType,
      };
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      const err = error as Error;
      this.logger.error('Dust.tt error', err);
      throw new GeminiError(`Dust.tt error: ${err.message}`);
    }
  }

  /**
   * Poll the conversation until the agent finishes (status = 'succeeded' or 'failed').
   * Dust.tt uses Server-Sent Events but we fall back to polling for simplicity.
   */
  private async pollForAgentMessage(
    conversationId: string,
    maxWaitMs = 180_000,
    intervalMs = 2_000
  ): Promise<DustAgentMessage> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, intervalMs));

      const resp = await fetch(
        `${DustService.API_BASE}/w/${this.workspaceId}/assistant/conversations/${conversationId}`,
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (!resp.ok) {
        throw new GeminiError(`Dust.tt polling error ${resp.status}`);
      }

      const data = (await resp.json()) as { conversation?: DustConversation };
      const conversation = data.conversation;
      if (!conversation) continue;

      // Find the latest agent message
      const agentMessages: DustAgentMessage[] = conversation.content
        .flat()
        .filter(
          (m): m is DustAgentMessage => m.type === 'agent_message'
        );

      const latest = agentMessages.at(-1);
      if (!latest) continue;

      if (latest.status === 'succeeded') return latest;

      if (latest.status === 'failed' || latest.status === 'cancelled') {
        throw new GeminiError(
          `Dust.tt agent ${latest.status}: ${latest.error?.message || 'Unknown error'}`
        );
      }

      this.logger.debug('Dust.tt agent still running…', { status: latest.status });
    }

    throw new GeminiError('Dust.tt agent timed out after 3 minutes.');
  }

  private extractImageFromMessage(
    message: DustAgentMessage
  ): { buffer: Buffer; mimeType: string } | null {
    const content = message.content || '';

    // Pattern: data URL embedded in markdown or raw response
    const dataUrlMatch = content.match(/data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/);
    if (dataUrlMatch) {
      return {
        mimeType: dataUrlMatch[1],
        buffer: Buffer.from(dataUrlMatch[2], 'base64'),
      };
    }

    // Pattern: Dust file attachment blocks
    if (message.files && message.files.length > 0) {
      const imgFile = message.files.find(f => f.contentType?.startsWith('image/'));
      if (imgFile?.content) {
        return {
          mimeType: imgFile.contentType || 'image/png',
          buffer: Buffer.from(imgFile.content, 'base64'),
        };
      }
    }

    return null;
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.apiKey || !this.workspaceId) return false;
    try {
      const resp = await fetch(
        `${DustService.API_BASE}/w/${this.workspaceId}/assistant/agent_configurations`,
        { headers: this.headers, signal: AbortSignal.timeout(5000) }
      );
      return resp.ok;
    } catch {
      return false;
    }
  }
}

// ── Dust API response types ────────────────────────────────────────────────

interface DustAgentMessage {
  type: 'agent_message';
  sId: string;
  status: 'created' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  content?: string;
  error?: { message: string };
  files?: Array<{ contentType: string; content: string }>;
}

interface DustConversation {
  sId: string;
  content: Array<Array<DustAgentMessage | { type: string }>>;
}
