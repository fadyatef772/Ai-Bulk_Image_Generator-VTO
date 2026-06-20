import { API_BASE_URL, OUTPUT_STATIC_URL } from './constants';
import type {
  ApiResponse,
  AppSettings,
  GalleryQuery,
  GalleryResponse,
  ImageJob,
  QueueStats,
  UploadResult,
} from './types';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, options);
  return (await res.json()) as ApiResponse<T>;
}

const http = {
  get: <T>(e: string) => request<T>(e, { method: 'GET' }),
  post: <T>(e: string, body?: unknown) =>
    request<T>(e, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(e: string, body?: unknown) =>
    request<T>(e, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(e: string) => request<T>(e, { method: 'DELETE' }),
  upload: async <T>(e: string, form: FormData): Promise<ApiResponse<T>> => {
    const res = await fetch(`${API_BASE_URL}${e}`, { method: 'POST', body: form });
    return (await res.json()) as ApiResponse<T>;
  },
};

function buildGalleryQuery(q: GalleryQuery): string {
  const p = new URLSearchParams();
  if (q.status) p.set('status', q.status);
  if (q.search) p.set('search', q.search);
  if (q.sortBy) p.set('sortBy', q.sortBy);
  if (q.sortOrder) p.set('sortOrder', q.sortOrder);
  if (q.limit != null) p.set('limit', String(q.limit));
  if (q.offset != null) p.set('offset', String(q.offset));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Typed API surface — one method per backend endpoint. */
export const api = {
  // Images
  uploadImages: (files: File[], prompt: string) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('prompt', prompt);
    return http.upload<UploadResult>('/images/upload', form);
  },
  vto: (personImage: string, productImage: string, sampleCount = 1, baseSteps = 1) =>
    http.post<{ image: string; mimeType: string; dataUrl: string }>('/vto', {
      personImage,
      productImage,
      sampleCount,
      baseSteps,
    }),
  getGallery: (q: GalleryQuery = {}) =>
    http.get<GalleryResponse>(`/images${buildGalleryQuery(q)}`),
  deleteJob: (id: string) => http.delete<{ id: string }>(`/images/${id}`),
  retryJob: (id: string) => http.post<ImageJob>(`/images/${id}/retry`),
  cancelJob: (id: string) => http.post<ImageJob>(`/images/${id}/cancel`),

  // Queue
  getQueueStats: () => http.get<QueueStats>('/queue/stats'),
  startQueue: () => http.post<null>('/queue/start'),
  pauseQueue: () => http.post<null>('/queue/pause'),
  resumeQueue: () => http.post<null>('/queue/resume'),
  stopQueue: () => http.post<null>('/queue/stop'),
  cancelQueue: () => http.post<null>('/queue/cancel'),

  // Settings
  getSettings: () => http.get<AppSettings>('/settings'),
  updateSettings: (patch: Partial<AppSettings>) => http.put<AppSettings>('/settings', patch),
  validateKey: (provider: string, key: string) =>
    http.post<{ isValid: boolean }>('/settings/validate-key', { provider, apiKey: key }),
  selectFolder: (folder: string) =>
  http.post<{ folder: string }>('/settings/select-folder', {
    folder,
  }),
  // Health
  health: () => http.get<{ status: string }>('/health'),
};

// ── Formatters ─────────────────────────────────────────────────────────────
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDuration(ms?: number): string {
  if (ms == null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function getImagePreviewUrl(outputPath?: string): string {
  if (!outputPath) return '';
  if (/^(https?:|data:)/.test(outputPath)) return outputPath;
  const filename = outputPath.split(/[/\\]/).pop();
  if (!filename) return '';
  return `${OUTPUT_STATIC_URL}/Generated/${filename}`;
}
