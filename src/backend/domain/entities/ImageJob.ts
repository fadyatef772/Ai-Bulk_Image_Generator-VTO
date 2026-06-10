export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ImageJobEntity {
  id: string;
  originalPath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  prompt: string;
  status: JobStatus;
  outputPath?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  processingDurationMs?: number;
}

export class ImageJob implements ImageJobEntity {
  id: string;
  originalPath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  prompt: string;
  status: JobStatus;
  outputPath?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  processingDurationMs?: number;

  constructor(data: ImageJobEntity) {
    this.id = data.id;
    this.originalPath = data.originalPath;
    this.originalName = data.originalName;
    this.mimeType = data.mimeType;
    this.fileSize = data.fileSize;
    this.prompt = data.prompt;
    this.status = data.status;
    this.outputPath = data.outputPath;
    this.errorMessage = data.errorMessage;
    this.retryCount = data.retryCount;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.processingStartedAt = data.processingStartedAt;
    this.processingCompletedAt = data.processingCompletedAt;
    this.processingDurationMs = data.processingDurationMs;
  }

  markAsProcessing(): void {
    this.status = 'processing';
    this.processingStartedAt = new Date();
    this.updatedAt = new Date();
  }

  markAsCompleted(outputPath: string): void {
    this.status = 'completed';
    this.outputPath = outputPath;
    this.processingCompletedAt = new Date();
    if (this.processingStartedAt) {
      this.processingDurationMs = this.processingCompletedAt.getTime() - this.processingStartedAt.getTime();
    }
    this.updatedAt = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    this.updatedAt = new Date();
  }

  markAsCancelled(): void {
    this.status = 'cancelled';
    this.updatedAt = new Date();
  }

  incrementRetry(): void {
    this.retryCount++;
    this.updatedAt = new Date();
  }

  canRetry(maxRetries: number): boolean {
    return this.retryCount < maxRetries;
  }
}
