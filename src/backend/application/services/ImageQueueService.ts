import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { ImageJob } from '../../domain/entities/ImageJob';
import { IImageJobRepository } from '../../domain/repositories/IImageJobRepository';
import { IImageGenerationService, IFileSystemService, ILoggerService } from '../../domain/interfaces/index';
import { ImageGenerationServiceFactory } from '../../infrastructure/ImageGenerationServiceFactory';
import { QueueStatsDTO } from '../dto/index';

export interface QueueWorkerConfig {
  concurrentWorkers: number;
  retryCount: number;
  retryDelayMs: number;
  timeoutMs: number;
  model: string;
  quality: number;
  outputDir: string;
}

// Extended repository interface with stats helper
interface IImageJobRepositoryWithStats extends IImageJobRepository {
  getStats(): Promise<Record<string, number>>;
}

export class ImageQueueService extends EventEmitter {
  private isRunning = false;
  private isPaused = false;
  private activeWorkers = 0;
  private processingJobIds = new Set<string>();
  private workerInterval: NodeJS.Timeout | null = null;
  private config: QueueWorkerConfig;
  private startTime?: Date;
  private completedCount = 0;

  constructor(
    private readonly jobRepository: IImageJobRepository,
    private readonly serviceFactory: ImageGenerationServiceFactory,
    private readonly fileSystemService: IFileSystemService,
    private readonly logger: ILoggerService,
    config?: Partial<QueueWorkerConfig>
  ) {
    super();
    this.config = {
      concurrentWorkers: 3,
      retryCount: 3,
      retryDelayMs: 5000,
      timeoutMs: 120000,
      model: 'gemini-2.0-flash-exp',
      quality: 90,
      outputDir: './output',
      ...config,
    };
  }

  updateConfig(config: Partial<QueueWorkerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Queue config updated', this.config as unknown as Record<string, unknown>);
  }

  async start(): Promise<void> {
    if (this.isRunning && !this.isPaused) return;
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = new Date();
    this.logger.info('Queue started');
    this.emit('started');
    this.scheduleWorkerLoop();
  }

  async pause(): Promise<void> {
    this.isPaused = true;
    this.logger.info('Queue paused');
    this.emit('paused');
  }

  async resume(): Promise<void> {
    if (!this.isRunning) { await this.start(); return; }
    this.isPaused = false;
    this.logger.info('Queue resumed');
    this.emit('resumed');
    this.scheduleWorkerLoop();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.isPaused = false;
    if (this.workerInterval) { clearInterval(this.workerInterval); this.workerInterval = null; }
    this.logger.info('Queue stopped');
    this.emit('stopped');
  }

  async cancelAll(): Promise<void> {
    const pendingJobs = await this.jobRepository.findByStatus('pending');
    for (const job of pendingJobs) {
      job.markAsCancelled();
      await this.jobRepository.save(job);
      this.emit('job:cancelled', { jobId: job.id });
    }
    await this.stop();
    this.logger.info('All jobs cancelled');
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) return;
    if (job.status === 'pending') {
      job.markAsCancelled();
      await this.jobRepository.save(job);
      this.emit('job:cancelled', { jobId });
    }
  }

  async getStats(): Promise<QueueStatsDTO> {
    const repo = this.jobRepository as IImageJobRepositoryWithStats;
    const counts = await repo.getStats();

    const total = counts['total'] ?? 0;
    const pending = counts['pending'] ?? 0;
    const completed = counts['completed'] ?? 0;
    const failed = counts['failed'] ?? 0;
    const cancelled = counts['cancelled'] ?? 0;
    const processing = counts['processing'] ?? 0;

    const done = completed + failed + cancelled;
    const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

    let eta: number | undefined;
    if (this.isRunning && pending > 0 && this.completedCount > 0 && this.startTime) {
      const elapsed = Date.now() - this.startTime.getTime();
      const msPerJob = elapsed / this.completedCount;
      eta = pending * msPerJob;
    }

    const currentJobId = Array.from(this.processingJobIds)[0];

    return {
      total, pending, processing, completed, failed, cancelled,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentJobId,
      eta,
      progressPercent,
    };
  }

  private scheduleWorkerLoop(): void {
    if (this.workerInterval) clearInterval(this.workerInterval);
    this.workerInterval = setInterval(() => { this.workerTick().catch(() => {}); }, 500);
  }

  private async workerTick(): Promise<void> {
    if (!this.isRunning || this.isPaused) return;
    if (this.activeWorkers >= this.config.concurrentWorkers) return;

    const slotsAvailable = this.config.concurrentWorkers - this.activeWorkers;

    for (let i = 0; i < slotsAvailable; i++) {
      const pendingJobs = await this.jobRepository.findByStatus('pending');
      const availableJobs = pendingJobs.filter(j => !this.processingJobIds.has(j.id));

      if (availableJobs.length === 0) {
        const processingJobs = await this.jobRepository.findByStatus('processing');
        if (processingJobs.length === 0 && this.activeWorkers === 0) {
          const stillPending = await this.jobRepository.findByStatus('pending');
          if (stillPending.length === 0) {
            this.emit('queue:complete');
            await this.stop();
          }
        }
        break;
      }

      // Fire and forget — each job runs independently
      this.processJob(availableJobs[0]).catch(() => {});
    }
  }

  private async processJob(job: ImageJob): Promise<void> {
    this.activeWorkers++;
    this.processingJobIds.add(job.id);

    try {
      job.markAsProcessing();
      await this.jobRepository.save(job);
      this.emit('job:started', { jobId: job.id });

      this.logger.info('Processing job', { jobId: job.id, filename: job.originalName });

      const imageBuffer = await this.fileSystemService.readImageAsBuffer(job.originalPath);

      const generationService: IImageGenerationService = this.serviceFactory.getService();

      const generationResult = await this.withTimeout(
        generationService.generateImage({
          imageBuffer,
          mimeType: job.mimeType,
          prompt: job.prompt,
          model: this.config.model,
          quality: this.config.quality,
        }),
        this.config.timeoutMs
      );

      const outputPath = await this.fileSystemService.saveGeneratedImage(
        generationResult.imageBuffer,
        job.originalName,
        generationResult.mimeType,
        this.config.outputDir,
        'Generated'
      );

      job.markAsCompleted(outputPath);
      await this.jobRepository.save(job);

      this.completedCount++;
      this.logger.info('Job completed', { jobId: job.id, outputPath, durationMs: job.processingDurationMs });
      this.emit('job:completed', { jobId: job.id, outputPath });

    } catch (error) {
      const err = error as Error;
      this.logger.error('Job failed', err, { jobId: job.id });

      job.incrementRetry();

      const safetyBlocked = err.message?.toLowerCase().includes('safety');
      if (job.canRetry(this.config.retryCount) && !safetyBlocked) {
        job.status = 'pending';
        job.updatedAt = new Date();
        await this.jobRepository.save(job);
        this.logger.info('Job queued for retry', { jobId: job.id, retryCount: job.retryCount });
        setTimeout(() => { this.emit('job:retrying', { jobId: job.id, retryCount: job.retryCount }); }, this.config.retryDelayMs);
      } else {
        job.markAsFailed(err.message);
        await this.jobRepository.save(job);
        await this.fileSystemService.saveFailedRecord(job.id, err.message, this.config.outputDir).catch(() => {});
        this.emit('job:failed', { jobId: job.id, error: err.message });
      }
    } finally {
      this.activeWorkers--;
      this.processingJobIds.delete(job.id);
      this.getStats().then(s => this.emit('stats:updated', s)).catch(() => {});
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      promise.then(r => { clearTimeout(timer); resolve(r); }, e => { clearTimeout(timer); reject(e); });
    });
  }

  async addJobs(jobs: ImageJob[]): Promise<void> {
    for (const job of jobs) await this.jobRepository.save(job);
    this.emit('jobs:added', { count: jobs.length });
  }

  createJob(data: {
    id?: string;
    originalPath: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    prompt: string;
  }): ImageJob {
    return new ImageJob({
      id: data.id || uuidv4(),
      originalPath: data.originalPath,
      originalName: data.originalName,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      prompt: data.prompt,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
