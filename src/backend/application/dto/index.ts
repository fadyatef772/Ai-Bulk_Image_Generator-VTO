import { JobStatus } from '../../domain/entities/ImageJob';

export interface CreateJobsDTO {
  files: Array<{
    originalName: string;
    mimeType: string;
    buffer: Buffer;
    size: number;
  }>;
  prompt: string;
  outputDir: string;
}

export interface JobResponseDTO {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  prompt: string;
  status: JobStatus;
  outputPath?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  processingDurationMs?: number;
}

export interface QueueStatsDTO {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  isRunning: boolean;
  isPaused: boolean;
  currentJobId?: string;
  eta?: number; // milliseconds
  progressPercent: number;
}

export interface ProcessImageDTO {
  jobId: string;
  imageBuffer: Buffer;
  mimeType: string;
  prompt: string;
  outputDir: string;
  model: string;
  quality: number;
  maxRetries: number;
}

export interface UpdateSettingsDTO {
  geminiApiKey?: string;
  outputFolder?: string;
  concurrentWorkers?: number;
  retryCount?: number;
  timeoutMs?: number;
  imageQuality?: number;
  model?: string;
}

export interface GalleryQueryDTO {
  status?: JobStatus;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'originalName';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface UploadResultDTO {
  accepted: JobResponseDTO[];
  rejected: Array<{
    filename: string;
    reason: string;
  }>;
  totalAccepted: number;
  totalRejected: number;
}
