export const API_BASE_URL = 'http://localhost:3001/api';
export const SSE_URL = 'http://localhost:3001/api/events';
export const OUTPUT_STATIC_URL = 'http://localhost:3001/output';

export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const JOB_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  pending: 'text-amber-400',
  processing: 'text-brand-400',
  completed: 'text-emerald-400',
  failed: 'text-rose-400',
  cancelled: 'text-surface-400',
};

export const JOB_STATUS_BG: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  processing: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  cancelled: 'bg-surface-700/50 text-surface-400 border-surface-600/30',
};

export const GEMINI_MODELS = [
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image' },
  { value: 'gemini-3.1-pro-image', label: 'Gemini 3.1 Pro Image' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
];

/** Models supported on Vertex AI */
export const VERTEX_MODELS = [
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image' },
  { value: 'gemini-3.1-pro-image', label: 'Gemini 3.1 Pro Image' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
];

export const VERTEX_LOCATIONS = [
  { value: 'us-central1', label: 'us-central1 (Iowa)' },
  { value: 'us-east4', label: 'us-east4 (N. Virginia)' },
  { value: 'europe-west4', label: 'europe-west4 (Netherlands)' },
  { value: 'asia-northeast1', label: 'asia-northeast1 (Tokyo)' },
  { value: 'asia-southeast1', label: 'asia-southeast1 (Singapore)' },
];

export const API_PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini API (direct)',
  vertex: 'Vertex AI (GCP project)',
  dust: 'Dust.tt',
};

export const PROMPT_EXAMPLES = [
  'Turn image into a luxury advertising photograph with dramatic lighting',
  'Create a cinematic product photography shot with a dark moody background',
  'Generate a professional e-commerce product image on pure white background',
  'Transform into a high-fashion editorial style photograph',
  'Make this look like a professional studio photograph with soft lighting',
  'Create a minimalist product photo with clean background',
  'Turn this into a vibrant social media-ready image with enhanced colors',
  'Generate an artistic still-life composition with natural lighting',
];
