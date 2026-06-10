import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  IImageGenerationService,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ILoggerService,
} from '../../domain/interfaces/index';
import { GeminiError } from '../../application/errors/AppErrors';

export class GeminiService implements IImageGenerationService {
  private clients: Map<string, GoogleGenerativeAI> = new Map();

  constructor(private readonly logger: ILoggerService) {}

  private getClient(apiKey: string): GoogleGenerativeAI {
    if (!this.clients.has(apiKey)) {
      this.clients.set(apiKey, new GoogleGenerativeAI(apiKey));
    }
    return this.clients.get(apiKey)!;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const { imageBuffer, mimeType, prompt, model, quality } = request;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GeminiError('Gemini API key not configured. Please set it in Settings.');
    }

    this.logger.info('Starting Gemini image generation', {
      model,
      mimeType,
      bufferSize: imageBuffer.length,
      promptLength: prompt.length,
    });

    try {
      const client = this.getClient(apiKey);
      const genModel = client.getGenerativeModel({
        model: model || 'gemini-2.0-flash-exp',
        generationConfig: {
          // @ts-expect-error - responseModalities is new
          responseModalities: ['Text', 'Image'],
        },
      });

      const base64Image = imageBuffer.toString('base64');
      const imagePart: Part = {
        inlineData: {
          data: base64Image,
          mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        },
      };

      const textPart: Part = { text: prompt };

      this.logger.debug('Sending request to Gemini API', { model, quality });

      const result = await genModel.generateContent([textPart, imagePart]);
      const response = result.response;

      let resultImageBuffer: Buffer | null = null;
      let resultMimeType = 'image/png';

      for (const candidate of response.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            resultImageBuffer = Buffer.from(part.inlineData.data, 'base64');
            resultMimeType = part.inlineData.mimeType;
            break;
          }
        }
        if (resultImageBuffer) break;
      }

      if (!resultImageBuffer) {
        const textResponse = response.text();
        this.logger.warn('No image in Gemini response', { textResponse });
        throw new GeminiError(
          `Gemini did not return an image. Response: ${textResponse?.slice(0, 200) || 'empty'}`
        );
      }

      const tokensUsed = response.usageMetadata?.totalTokenCount;

      this.logger.info('Gemini image generation successful', {
        outputSize: resultImageBuffer.length,
        outputMimeType: resultMimeType,
        tokensUsed,
      });

      return { imageBuffer: resultImageBuffer, mimeType: resultMimeType, tokensUsed };
    } catch (error) {
      if (error instanceof GeminiError) throw error;
      const err = error as Error;
      this.logger.error('Gemini API error', err);

      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('400')) {
        throw new GeminiError('Invalid Gemini API key. Please check your settings.');
      }
      if (err.message?.includes('RATE_LIMIT') || err.message?.includes('429')) {
        throw new GeminiError('Gemini rate limit exceeded. Please wait and retry.');
      }
      if (err.message?.includes('SAFETY') || err.message?.includes('blocked')) {
        throw new GeminiError('Image was blocked by Gemini safety filters.');
      }
      if (err.message?.includes('quota') || err.message?.includes('QUOTA')) {
        throw new GeminiError('Gemini API quota exceeded for today.');
      }

      throw new GeminiError(`Gemini API error: ${err.message}`);
    }
  }

  async validateCredentials(): Promise<boolean> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return false;
    return this.validateApiKey(apiKey);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const client = this.getClient(apiKey);
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent('Say "ok" in one word.');
      const text = result.response.text();
      return text.length > 0;
    } catch {
      return false;
    }
  }

  updateApiKey(newApiKey: string): void {
    process.env.GEMINI_API_KEY = newApiKey;
    this.clients.delete(newApiKey);
  }
}
