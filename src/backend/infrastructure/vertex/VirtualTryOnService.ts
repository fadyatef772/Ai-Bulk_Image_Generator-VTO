import fs from 'fs/promises';
import path from 'path';
import { ILoggerService } from '../../domain/interfaces/index';
import { GeminiError } from '../../application/errors/AppErrors';
import { VertexGeminiService } from './VertexGeminiService';

/**
 * Virtual Try-On Service using Google's `virtual-try-on-001` model on Vertex AI.
 *
 * Inputs:
 *   - personImageBuffer:  photo of a person (full body or lower body visible)
 *   - clothingImageBuffer: product photo (shoe, bag, etc.) on white/neutral bg
 *
 * Output:
 *   - The person photo with the product placed on them realistically.
 *   - The product pixels are NOT regenerated — the model places the actual
 *     product onto the person using learned try-on diffusion.
 *
 * API endpoint (REST):
 *   POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/
 *        locations/{location}/publishers/google/models/virtual-try-on-001:predict
 *
 * Auth: same ADC token from VertexGeminiService (google-auth-library / gcloud ADC)
 */

const MODEL_ID = 'virtual-try-on-001';

export interface VTORequest {
  /** Raw bytes of the person/model photo */
  personImageBuffer: Buffer;
  personMimeType?: string;

  /** Raw bytes of the product/clothing photo */
  clothingImageBuffer: Buffer;
  clothingMimeType?: string;
}

export interface VTOResult {
  imageBuffer: Buffer;
  mimeType: string;
}

export class VirtualTryOnService {
  constructor(
    private readonly vertexService: VertexGeminiService,
    private readonly logger: ILoggerService,
  ) {}

  async tryOn(request: VTORequest): Promise<VTOResult> {
    const {
      personImageBuffer,
      personMimeType = 'image/jpeg',
      clothingImageBuffer,
      clothingMimeType = 'image/jpeg',
    } = request;

    this.logger.info('VTO: starting virtual try-on', {
      model: MODEL_ID,
      personImageBytes: personImageBuffer.length,
      clothingImageBytes: clothingImageBuffer.length,
    });

    const accessToken = await this.vertexService.getToken();
    const projectId   = this.vertexService.getProjectId();
    const location    = this.vertexService.getLocation();

    if (!projectId) {
      throw new GeminiError('VERTEX_PROJECT_ID not set in .env');
    }

    const endpoint =
      `https://${location}-aiplatform.googleapis.com/v1` +
      `/projects/${projectId}` +
      `/locations/${location}` +
      `/publishers/google/models/${MODEL_ID}:predict`;

    const body = {
      instances: [
        {
          person_image: {
            bytesBase64Encoded: personImageBuffer.toString('base64'),
            mimeType: personMimeType,
          },
          clothing_image: {
            bytesBase64Encoded: clothingImageBuffer.toString('base64'),
            mimeType: clothingMimeType,
          },
        },
      ],
      parameters: {
        sampleCount: 1,
      },
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      this.logger.error('VTO: API error', undefined, {
        status: resp.status,
        body: errText.slice(0, 500),
      });

      if (resp.status === 401 || resp.status === 403) {
        throw new GeminiError(
          `VTO authentication failed. Run: gcloud auth application-default login\n` +
          `Details: ${errText.slice(0, 300)}`
        );
      }
      if (resp.status === 404) {
        throw new GeminiError(
          `Model ${MODEL_ID} not found on project ${projectId}. ` +
          `Make sure virtual-try-on-001 is enabled in Vertex AI.\n` +
          `Details: ${errText.slice(0, 300)}`
        );
      }
      throw new GeminiError(`VTO API error (${resp.status}): ${errText.slice(0, 500)}`);
    }

    const data = (await resp.json()) as VTOResponse;
    const prediction = data.predictions?.[0];

    if (!prediction?.bytesBase64Encoded) {
      throw new GeminiError(
        `VTO: model did not return an image. Response: ${JSON.stringify(data).slice(0, 300)}`
      );
    }

    const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
    const mimeType    = prediction.mimeType ?? 'image/png';

    this.logger.info('VTO: try-on complete', {
      outputSize: imageBuffer.length,
      outputMimeType: mimeType,
    });

    return { imageBuffer, mimeType };
  }

  /**
   * Bulk try-on: run tryOn() for every clothing image against the SAME
   * person image, with controlled concurrency so you can process 200+
   * clothing images without hammering the API.
   *
   * @param personImageBuffer  The model/person photo (used for all items)
   * @param clothingImages     Array of {buffer, mimeType, name} for each product
   * @param outputDir          Directory to save results in
   * @param concurrency        How many parallel API calls at once (default 3)
   */
  async bulkTryOn(
    personImageBuffer: Buffer,
    personMimeType: string,
    clothingImages: Array<{ buffer: Buffer; mimeType: string; name: string }>,
    outputDir: string,
    concurrency = 3,
  ): Promise<Array<{ name: string; outputPath: string; error?: string }>> {
    this.logger.info('VTO bulk: starting', {
      total: clothingImages.length,
      concurrency,
      outputDir,
    });

    await fs.mkdir(outputDir, { recursive: true });

    const results: Array<{ name: string; outputPath: string; error?: string }> = [];
    const queue = [...clothingImages];
    let completed = 0;

    // Process in batches of `concurrency`
    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          const result = await this.tryOn({
            personImageBuffer,
            personMimeType,
            clothingImageBuffer: item.buffer,
            clothingMimeType: item.mimeType,
          });

          const ext      = result.mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const baseName = path.basename(item.name, path.extname(item.name));
          const filename = `vto_${baseName}_${Date.now()}.${ext}`;
          const filePath = path.join(outputDir, filename);

          await fs.writeFile(filePath, result.imageBuffer);

          completed++;
          this.logger.info(`VTO bulk: completed ${completed}/${clothingImages.length}`, {
            name: item.name,
            outputPath: filePath,
          });

          return { name: item.name, outputPath: filePath };
        })
      );

      for (let i = 0; i < batchResults.length; i++) {
        const settled = batchResults[i];
        const item    = batch[i];

        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          const errMsg = (settled.reason as Error)?.message ?? String(settled.reason);
          this.logger.error(`VTO bulk: failed for ${item.name}`, undefined, { error: errMsg });
          results.push({ name: item.name, outputPath: '', error: errMsg });
        }
      }
    }

    this.logger.info('VTO bulk: all done', {
      total: clothingImages.length,
      succeeded: results.filter(r => !r.error).length,
      failed: results.filter(r => !!r.error).length,
    });

    return results;
  }
}

// ── Response types ────────────────────────────────────────────────────────────

interface VTOResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
}