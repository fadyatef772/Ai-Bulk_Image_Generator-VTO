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
import { ImageController, SettingsController } from './presentation/controllers/index';
import { createRoutes } from './presentation/routes/index';
import { errorHandler, requestLogger, notFound } from './presentation/middleware/index';

// ── Bootstrap ──────────────────────────────────────────────────────────────

const config = getConfig();
const logger = new WinstonLogger(config.LOG_DIR, config.LOG_LEVEL);

// ── Infrastructure Layer ──────────────────────────────────────────────────

const settingsRepository = new JsonSettingsRepository(process.cwd());
const jobRepository = new InMemoryImageJobRepository();
const serviceFactory = new ImageGenerationServiceFactory(logger);
const fileSystemService = new FileSystemService(logger);

// ── Application Layer ─────────────────────────────────────────────────────

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

const uploadUseCase = new UploadImagesUseCase(queueService, fileSystemService, logger);
const getGalleryUseCase = new GetGalleryUseCase(jobRepository);
const deleteJobUseCase = new DeleteJobUseCase(jobRepository, fileSystemService, logger);
const retryJobUseCase = new RetryJobUseCase(jobRepository, logger);

// ── Presentation Layer ────────────────────────────────────────────────────

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

// ── Express App ───────────────────────────────────────────────────────────

const app = express();

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Serve generated output images statically
app.use('/output', express.static(config.OUTPUT_DIR));

// API Routes
app.use('/api', createRoutes(imageController, settingsController));

// ── SSE: Real-time queue events ───────────────────────────────────────────

const sseClients = new Set<express.Response>();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseClients.add(res);
  logger.debug('SSE client connected', { total: sseClients.size });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial stats immediately on connect
  queueService
    .getStats()
    .then(stats => sendEvent('stats', stats))
    .catch(() => {});

  req.on('close', () => {
    sseClients.delete(res);
    logger.debug('SSE client disconnected', { total: sseClients.size });
  });
});

function broadcast(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Wire queue events to SSE broadcast
queueService.on('job:started', d => broadcast('job:started', d));
queueService.on('job:completed', d => broadcast('job:completed', d));
queueService.on('job:failed', d => broadcast('job:failed', d));
queueService.on('job:cancelled', d => broadcast('job:cancelled', d));
queueService.on('job:retrying', d => broadcast('job:retrying', d));
queueService.on('stats:updated', d => broadcast('stats', d));
queueService.on('queue:complete', () => broadcast('queue:complete', {}));
queueService.on('started', () => broadcast('queue:started', {}));
queueService.on('paused', () => broadcast('queue:paused', {}));
queueService.on('resumed', () => broadcast('queue:resumed', {}));
queueService.on('stopped', () => broadcast('queue:stopped', {}));

// Heartbeat: push stats every 2 s to connected SSE clients
setInterval(async () => {
  if (sseClients.size > 0) {
    const stats = await queueService.getStats().catch(() => null);
    if (stats) broadcast('stats', stats);
  }
}, 2000);

// ── Error Handlers ────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  try {
    // Load persisted settings and sync env vars for all providers
    const settings = await settingsRepository.get();
    // Sync provider credentials to process.env on startup
    if (settings.geminiApiKey)    process.env.GEMINI_API_KEY    = settings.geminiApiKey;
    if (settings.vertexProjectId) process.env.VERTEX_PROJECT_ID = settings.vertexProjectId;
    if (settings.vertexLocation)  process.env.VERTEX_LOCATION   = settings.vertexLocation;
    // Note: Vertex AI auth is ADC-only — no credential env-vars synced here
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
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

bootstrap();

export { app, queueService };
