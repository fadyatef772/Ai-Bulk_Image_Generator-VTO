import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { getConfig } from './infrastructure/config/index';
import { WinstonLogger } from './infrastructure/logger/WinstonLogger';
import { ImageGenerationServiceFactory } from './infrastructure/ImageGenerationServiceFactory';
import { FileSystemService } from './infrastructure/filesystem/FileSystemService';
import { InMemoryImageJobRepository } from './infrastructure/queue/InMemoryImageJobRepository';
import { JsonSettingsRepository } from './infrastructure/config/JsonSettingsRepository';
import { ImageQueueService } from './application/services/ImageQueueService';

import {
  UploadImagesUseCase,
  GetGalleryUseCase,
  DeleteJobUseCase,
  RetryJobUseCase,
} from './application/use-cases/ImageUseCases';

import {
  ImageController,
  SettingsController,
  VTOController,
} from './presentation/controllers/index';

import { createRoutes } from './presentation/routes/index';
import { errorHandler, requestLogger, notFound } from './presentation/middleware/index';

// ── Bootstrap ─────────────────────────────
const config = getConfig();
const logger = new WinstonLogger(config.LOG_DIR, config.LOG_LEVEL);

// ── Infrastructure ─────────────────────────
const settingsRepository = new JsonSettingsRepository(process.cwd());
const jobRepository = new InMemoryImageJobRepository();
const serviceFactory = new ImageGenerationServiceFactory(logger);
const fileSystemService = new FileSystemService(logger);

// ── Application ───────────────────────────
const queueService = new ImageQueueService(
  jobRepository,
  serviceFactory,
  fileSystemService,
  logger,
  {
    concurrentWorkers: config.QUEUE_CONCURRENCY,
    retryCount: config.QUEUE_MAX_RETRIES,
    retryDelayMs: config.QUEUE_RETRY_DELAY,
    outputDir: config.OUTPUT_DIR,
    quality: config.IMAGE_QUALITY,
  }
);

// ── Use Cases ─────────────────────────────
const uploadUseCase = new UploadImagesUseCase(queueService, fileSystemService, logger);
const getGalleryUseCase = new GetGalleryUseCase(jobRepository);
const deleteJobUseCase = new DeleteJobUseCase(jobRepository, fileSystemService, logger);
const retryJobUseCase = new RetryJobUseCase(jobRepository, logger);

// ── Controllers ───────────────────────────
const imageController = new ImageController(
  uploadUseCase,
  getGalleryUseCase,
  deleteJobUseCase,
  retryJobUseCase,
  queueService,
  settingsRepository
);

const settingsController = new SettingsController(
  settingsRepository,
  serviceFactory,
  fileSystemService
);

const vtoController = new VTOController(
  serviceFactory,
  logger,
  settingsRepository,
  config.OUTPUT_DIR
);

// ── App ───────────────────────────────────
const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

app.use('/output', express.static(config.OUTPUT_DIR));

// ✅ هنا المهم
app.use('/api', createRoutes(
  imageController,
  settingsController,
  vtoController
));

// ── Error handling ────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Bootstrap ─────────────────────────────
async function bootstrap() {
  try {
    const settings = await settingsRepository.get();

    if (settings.geminiApiKey) process.env.GEMINI_API_KEY = settings.geminiApiKey;
    if (settings.vertexProjectId) process.env.VERTEX_PROJECT_ID = settings.vertexProjectId;
    if (settings.vertexLocation) process.env.VERTEX_LOCATION = settings.vertexLocation;
    if (settings.dustApiKey) process.env.DUST_API_KEY = settings.dustApiKey;
    if (settings.dustWorkspaceId) process.env.DUST_WORKSPACE_ID = settings.dustWorkspaceId;
    if (settings.dustAgentId) process.env.DUST_AGENT_ID = settings.dustAgentId;
    if (settings.apiProvider) process.env.API_PROVIDER = settings.apiProvider;

    if (settings.outputFolder) {
      await fileSystemService.ensureDirectoryStructure(settings.outputFolder).catch(() => {});
    }

    app.listen(config.PORT, () => {
      logger.info(`Server running on http://localhost:${config.PORT}`, {
        env: config.NODE_ENV,
        port: config.PORT,
        provider: settings.apiProvider || 'gemini',
      });
    });

  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

bootstrap();

export { app, queueService };