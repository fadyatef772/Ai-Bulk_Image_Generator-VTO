import { Request, Response, NextFunction } from 'express';
import {
  UploadImagesUseCase,
  GetGalleryUseCase,
  DeleteJobUseCase,
  RetryJobUseCase,
} from '../../application/use-cases/ImageUseCases';
import { ImageQueueService } from '../../application/services/ImageQueueService';
import { ISettingsRepository, IFileSystemService } from '../../domain/interfaces/index';
import { ImageGenerationServiceFactory } from '../../infrastructure/ImageGenerationServiceFactory';
import { ApiProvider } from '../../domain/entities/Settings';

export class ImageController {
  constructor(
    private readonly uploadUseCase: UploadImagesUseCase,
    private readonly getGalleryUseCase: GetGalleryUseCase,
    private readonly deleteJobUseCase: DeleteJobUseCase,
    private readonly retryJobUseCase: RetryJobUseCase,
    private readonly queueService: ImageQueueService,
    private readonly settingsRepository: ISettingsRepository
  ) {}

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      const { prompt } = req.body;

      const settings = await this.settingsRepository.get();
      const outputDir = settings.outputFolder || req.body.outputDir;

      const result = await this.uploadUseCase.execute(files, prompt, outputDir);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getGallery = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as Record<string, string>;
      const result = await this.getGalleryUseCase.execute({
        status: query.status as never,
        search: query.search,
        sortBy: query.sortBy as never,
        sortOrder: query.sortOrder as 'asc' | 'desc',
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  deleteJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deleteJobUseCase.execute(req.params.id);
      res.json({ success: true, message: 'Job deleted' });
    } catch (error) {
      next(error);
    }
  };

  retryJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await this.retryJobUseCase.execute(req.params.id);
      res.json({ success: true, data: job });
    } catch (error) {
      next(error);
    }
  };

  getQueueStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.queueService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  };

  startQueue = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.settingsRepository.get();
      this.queueService.updateConfig({
        model: settings.model,
        quality: settings.imageQuality,
        outputDir: settings.outputFolder,
        concurrentWorkers: settings.concurrentWorkers,
        retryCount: settings.retryCount,
        timeoutMs: settings.timeoutMs,
      });
      await this.queueService.start();
      res.json({ success: true, message: 'Queue started' });
    } catch (error) {
      next(error);
    }
  };

  pauseQueue = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.queueService.pause();
      res.json({ success: true, message: 'Queue paused' });
    } catch (error) {
      next(error);
    }
  };

  resumeQueue = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.queueService.resume();
      res.json({ success: true, message: 'Queue resumed' });
    } catch (error) {
      next(error);
    }
  };

  stopQueue = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.queueService.stop();
      res.json({ success: true, message: 'Queue stopped' });
    } catch (error) {
      next(error);
    }
  };

  cancelQueue = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.queueService.cancelAll();
      res.json({ success: true, message: 'Queue cancelled' });
    } catch (error) {
      next(error);
    }
  };

  cancelJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.queueService.cancelJob(req.params.id);
      res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
      next(error);
    }
  };
}

// ── Settings Controller ────────────────────────────────────────────────────

const MASKED = '••••••••';

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return MASKED;
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`;
}

function isMasked(value: string): boolean {
  return value.includes('*') || value === MASKED;
}

export class SettingsController {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly serviceFactory: ImageGenerationServiceFactory,
    private readonly fileSystemService: IFileSystemService
  ) {}

  getSettings = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.settingsRepository.get();
      res.json({
        success: true,
        data: {
          ...settings,
          // Mask all secrets
          geminiApiKey: maskSecret(settings.geminiApiKey),
          dustApiKey: maskSecret(settings.dustApiKey),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const current = await this.settingsRepository.get();
      const updates = req.body;

      // Never overwrite with masked placeholders
      const geminiApiKey =
        updates.geminiApiKey && !isMasked(updates.geminiApiKey)
          ? updates.geminiApiKey
          : current.geminiApiKey;

      const dustApiKey =
        updates.dustApiKey && !isMasked(updates.dustApiKey)
          ? updates.dustApiKey
          : current.dustApiKey;

      const updated = {
        ...current,
        ...updates,
        geminiApiKey,
        dustApiKey,
      };

      await this.settingsRepository.save(updated);

      // Ensure output directory exists
      if (updated.outputFolder) {
        await this.fileSystemService.ensureDirectoryStructure(updated.outputFolder);
      }

      res.json({ success: true, message: 'Settings saved' });
    } catch (error) {
      next(error);
    }
  };

  validateApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { apiKey, provider } = req.body as { apiKey?: string; provider?: ApiProvider };

      // For Gemini (legacy path): validate the supplied key directly
      if (!provider || provider === 'gemini') {
        if (!apiKey) {
          res.status(400).json({ success: false, error: { message: 'API key required' } });
          return;
        }
        const isValid = await this.serviceFactory.getGeminiService().validateApiKey(apiKey);
        res.json({ success: true, data: { isValid } });
        return;
      }

      // For vertex / dust: validate using current env (credentials already synced on save)
      const isValid = await this.serviceFactory.validateProvider(provider);
      res.json({ success: true, data: { isValid } });
    } catch (error) {
      next(error);
    }
  };

  selectOutputFolder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { folder } = req.body;
      if (!folder) {
        res.status(400).json({ success: false, error: { message: 'Folder path required' } });
        return;
      }

      await this.fileSystemService.ensureDirectoryStructure(folder);
      res.json({ success: true, data: { folder } });
    } catch (error) {
      next(error);
    }
  };

  openOutputFolder = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await this.settingsRepository.get();
      if (settings.outputFolder) {
        await this.fileSystemService.openInExplorer(settings.outputFolder);
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
