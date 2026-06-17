// Types mirror the FastAPI backend contract (camelCase DTOs).

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type ApiProvider = 'gemini' | 'vertex' | 'dust';
export type NavPage = 'dashboard' | 'upload' | 'vto' | 'queue' | 'gallery' | 'settings';

export interface ImageJob {
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

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  isRunning: boolean;
  isPaused: boolean;
  currentJobId?: string | null;
  eta?: number | null;
  progressPercent: number;
}

export interface AppSettings {
  apiProvider: ApiProvider;
  geminiApiKey: string;
  vertexProjectId: string;
  vertexLocation: string;
  dustApiKey: string;
  dustWorkspaceId: string;
  dustAgentId: string;
  outputFolder: string;
  concurrentWorkers: number;
  retryCount: number;
  timeoutMs: number;
  imageQuality: number;
  model: string;
}

export interface UploadResult {
  accepted: ImageJob[];
  rejected: Array<{ filename: string; reason: string }>;
  totalAccepted: number;
  totalRejected: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; fields?: Record<string, string[]> };
  message?: string;
}

export interface GalleryQuery {
  status?: JobStatus;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'originalName';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface GalleryResponse {
  jobs: ImageJob[];
  total: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: number;
}
