import { IImageJobRepository } from '../../domain/repositories/IImageJobRepository';
import { IFileSystemService, ILoggerService } from '../../domain/interfaces/index';
import { ImageQueueService } from '../services/ImageQueueService';
import { JobResponseDTO, UploadResultDTO, GalleryQueryDTO } from '../dto';
import { ImageJob } from '../../domain/entities/ImageJob';
import { ValidationError, NotFoundError } from '../errors/AppErrors';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class UploadImagesUseCase {
  constructor(
    private readonly queueService: ImageQueueService,
    private readonly fileSystemService: IFileSystemService,
    private readonly logger: ILoggerService
  ) {}

  async execute(files: Express.Multer.File[], prompt: string, outputDir: string): Promise<UploadResultDTO> {
    if (!prompt || prompt.trim().length === 0) {
      throw new ValidationError('Prompt is required');
    }

    if (!outputDir || outputDir.trim().length === 0) {
      throw new ValidationError('Output directory is required. Please configure it in Settings.');
    }

    if (!files || files.length === 0) {
      throw new ValidationError('No files provided');
    }

    // Ensure directory structure exists
    await this.fileSystemService.ensureDirectoryStructure(outputDir);

    const tempDir = path.join(outputDir, 'Temp');
    await fs.mkdir(tempDir, { recursive: true });

    const accepted: JobResponseDTO[] = [];
    const rejected: Array<{ filename: string; reason: string }> = [];

    for (const file of files) {
      try {
        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          rejected.push({
            filename: file.originalname,
            reason: `Unsupported file type: ${file.mimetype}. Allowed: JPG, PNG, WEBP`,
          });
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
          rejected.push({
            filename: file.originalname,
            reason: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 20MB`,
          });
          continue;
        }

        // Validate buffer not empty
        if (!file.buffer || file.buffer.length === 0) {
          rejected.push({
            filename: file.originalname,
            reason: 'File appears to be empty or corrupted',
          });
          continue;
        }

        // Save temp file for processing
        const tempFilename = `${uuidv4()}_${file.originalname}`;
        const tempPath = path.join(tempDir, tempFilename);
        await fs.writeFile(tempPath, file.buffer);

        // Create job
        const job = this.queueService.createJob({
          originalPath: tempPath,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          prompt: prompt.trim(),
        });

        await this.queueService.addJobs([job]);
        accepted.push(this.toDTO(job));

        this.logger.info('Job created', {
          jobId: job.id,
          filename: file.originalname,
          size: file.size,
        });
      } catch (error) {
        rejected.push({
          filename: file.originalname,
          reason: `Failed to process: ${(error as Error).message}`,
        });
      }
    }

    return {
      accepted,
      rejected,
      totalAccepted: accepted.length,
      totalRejected: rejected.length,
    };
  }

  private toDTO(job: ImageJob): JobResponseDTO {
    return {
      id: job.id,
      originalName: job.originalName,
      mimeType: job.mimeType,
      fileSize: job.fileSize,
      prompt: job.prompt,
      status: job.status,
      outputPath: job.outputPath,
      errorMessage: job.errorMessage,
      retryCount: job.retryCount,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      processingStartedAt: job.processingStartedAt?.toISOString(),
      processingCompletedAt: job.processingCompletedAt?.toISOString(),
      processingDurationMs: job.processingDurationMs,
    };
  }
}

export class GetGalleryUseCase {
  constructor(private readonly jobRepository: IImageJobRepository) {}

  async execute(query: GalleryQueryDTO): Promise<{ jobs: JobResponseDTO[]; total: number }> {
    const jobs = await this.jobRepository.findAll({
      status: query.status,
      search: query.search,
      sortBy: query.sortBy || 'createdAt',
      sortOrder: query.sortOrder || 'desc',
      limit: query.limit,
      offset: query.offset,
    });

    const total = await this.jobRepository.count(query.status);

    return {
      jobs: jobs.map(j => this.toDTO(j)),
      total,
    };
  }

  private toDTO(job: ImageJob): JobResponseDTO {
    return {
      id: job.id,
      originalName: job.originalName,
      mimeType: job.mimeType,
      fileSize: job.fileSize,
      prompt: job.prompt,
      status: job.status,
      outputPath: job.outputPath,
      errorMessage: job.errorMessage,
      retryCount: job.retryCount,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      processingStartedAt: job.processingStartedAt?.toISOString(),
      processingCompletedAt: job.processingCompletedAt?.toISOString(),
      processingDurationMs: job.processingDurationMs,
    };
  }
}

export class DeleteJobUseCase {
  constructor(
    private readonly jobRepository: IImageJobRepository,
    private readonly fileSystemService: IFileSystemService,
    private readonly logger: ILoggerService
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new NotFoundError('Job', jobId);

    // Delete output file if exists
    if (job.outputPath) {
      const exists = await this.fileSystemService.fileExists(job.outputPath);
      if (exists) {
        await this.fileSystemService.deleteFile(job.outputPath);
      }
    }

    await this.jobRepository.delete(jobId);
    this.logger.info('Job deleted', { jobId });
  }
}

export class RetryJobUseCase {
  constructor(
    private readonly jobRepository: IImageJobRepository,
    private readonly logger: ILoggerService
  ) {}

  async execute(jobId: string): Promise<JobResponseDTO> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new NotFoundError('Job', jobId);

    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new ValidationError('Only failed or cancelled jobs can be retried');
    }

    job.status = 'pending';
    job.errorMessage = undefined;
    job.retryCount = 0;
    job.updatedAt = new Date();

    await this.jobRepository.save(job);

    this.logger.info('Job queued for retry', { jobId });

    return {
      id: job.id,
      originalName: job.originalName,
      mimeType: job.mimeType,
      fileSize: job.fileSize,
      prompt: job.prompt,
      status: job.status,
      outputPath: job.outputPath,
      errorMessage: job.errorMessage,
      retryCount: job.retryCount,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
