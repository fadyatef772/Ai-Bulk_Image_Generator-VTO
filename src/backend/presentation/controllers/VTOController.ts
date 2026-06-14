import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { ILoggerService } from '../../domain/interfaces/index';
import { ISettingsRepository } from '../../domain/interfaces/index';
import { ImageGenerationServiceFactory } from '../../infrastructure/ImageGenerationServiceFactory';
import { VirtualTryOnService } from '../../infrastructure/vertex/VirtualTryOnService';

/**
 * POST /api/vto/try-on
 *
 * Single try-on:
 *   multipart fields:
 *     - person   : the model/person photo
 *     - clothing : the product photo (shoe, bag, etc.)
 *
 * POST /api/vto/bulk
 *
 * Bulk try-on (up to 200+ clothing images against ONE person photo):
 *   multipart fields:
 *     - person     : the model/person photo (single file)
 *     - clothing[] : multiple product photos
 */
export class VTOController {
  constructor(
    private readonly serviceFactory: ImageGenerationServiceFactory,
    private readonly logger: ILoggerService,
    private readonly settingsRepository: ISettingsRepository,
    private readonly defaultOutputDir: string,
  ) {}

  // ── Single try-on ──────────────────────────────────────────────────────────

  tryOn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const personFile   = files?.['person']?.[0];
      const clothingFile = files?.['clothing']?.[0];

      if (!personFile || !clothingFile) {
        res.status(400).json({
          success: false,
          error: { message: 'Both "person" and "clothing" image files are required.' },
        });
        return;
      }

      const vtoService = new VirtualTryOnService(
        this.serviceFactory.getVertexService(),
        this.logger,
      );

      const result = await vtoService.tryOn({
        personImageBuffer:   personFile.buffer,
        personMimeType:      personFile.mimetype,
        clothingImageBuffer: clothingFile.buffer,
        clothingMimeType:    clothingFile.mimetype,
      });

      // Save to output folder from settings
      const settings   = await this.settingsRepository.get();
      const outputDir  = path.join(settings.outputFolder || this.defaultOutputDir, 'vto');
      await fs.mkdir(outputDir, { recursive: true });

      const ext      = result.mimeType === 'image/jpeg' ? 'jpg' : 'png';
      const filename = `vto_${Date.now()}.${ext}`;
      const filePath = path.join(outputDir, filename);
      await fs.writeFile(filePath, result.imageBuffer);

      this.logger.info('VTO single: saved', { filePath });

      res.json({
        success: true,
        data: {
          imagePath:   filePath,
          imageBase64: result.imageBuffer.toString('base64'),
          mimeType:    result.mimeType,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ── Bulk try-on ───────────────────────────────────────────────────────────

  bulk = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const personFile    = files?.['person']?.[0];
      const clothingFiles = files?.['clothing'] ?? [];

      if (!personFile) {
        res.status(400).json({
          success: false,
          error: { message: '"person" image file is required.' },
        });
        return;
      }

      if (clothingFiles.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'At least one "clothing" image file is required.' },
        });
        return;
      }

      const settings   = await this.settingsRepository.get();
      const outputDir  = path.join(settings.outputFolder || this.defaultOutputDir, 'vto');

      // Concurrency from settings (default 3, max capped at 5 for VTO API)
      const concurrency = Math.min(settings.concurrentWorkers ?? 3, 5);

      const vtoService = new VirtualTryOnService(
        this.serviceFactory.getVertexService(),
        this.logger,
      );

      const results = await vtoService.bulkTryOn(
        personFile.buffer,
        personFile.mimetype,
        clothingFiles.map(f => ({
          buffer:   f.buffer,
          mimeType: f.mimetype,
          name:     f.originalname,
        })),
        outputDir,
        concurrency,
      );

      res.json({
        success: true,
        data: {
          total:     results.length,
          succeeded: results.filter(r => !r.error).length,
          failed:    results.filter(r => !!r.error).length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}