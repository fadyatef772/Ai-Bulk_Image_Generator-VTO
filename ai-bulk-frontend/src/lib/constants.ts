export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  'https://ai-bulk-python-831941147023.us-central1.run.app/api';

export const SSE_URL =
  import.meta.env.VITE_SSE_URL ??
  'https://ai-bulk-python-831941147023.us-central1.run.app/api/events';

export const OUTPUT_STATIC_URL =
  import.meta.env.VITE_OUTPUT_STATIC_URL ??
  'https://ai-bulk-python-831941147023.us-central1.run.app/output';

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

// Status pill styles (Idle / Running / Completed / Failed families)
export const JOB_STATUS_PILL: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/25',
  processing: 'bg-primary/10 text-primary-400 border-primary/30',
  completed: 'bg-success/10 text-success border-success/25',
  failed: 'bg-danger/10 text-danger border-danger/25',
  cancelled: 'bg-white/5 text-text-secondary border-white/10',
};

export const IMAGE_GENERATION_MODELS = [
  { value: 'imagen-3.0-generate-002', label: 'Imagen 3.0 (Generate & Edit)' },
  { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Image)' },
];
export const VERTEX_MODELS = IMAGE_GENERATION_MODELS;
export const GEMINI_MODELS = IMAGE_GENERATION_MODELS;

export const VERTEX_LOCATIONS = [
  { value: 'us-central1', label: 'us-central1 (Iowa)' },
  { value: 'us-east4', label: 'us-east4 (N. Virginia)' },
  { value: 'europe-west4', label: 'europe-west4 (Netherlands)' },
  { value: 'asia-northeast1', label: 'asia-northeast1 (Tokyo)' },
  { value: 'asia-southeast1', label: 'asia-southeast1 (Singapore)' },
];

type ApiProviderKey = 'gemini' | 'vertex' | 'dust';

export const API_PROVIDER_LABELS: Record<ApiProviderKey, string> = {
  gemini: 'Gemini API',
  vertex: 'Vertex AI',
  dust: 'Dust.tt',
};

export const PROMPT_EXAMPLES = [
  'Turn image into a luxury advertising photograph with dramatic lighting',
  'Create a cinematic product photography shot with a dark moody background',
  'Generate a professional e-commerce product image on pure white background',
  'Transform into a high-fashion editorial style photograph',
  'Make this look like a professional studio photograph with soft lighting',
  'Create a minimalist product photo with clean background',
];
