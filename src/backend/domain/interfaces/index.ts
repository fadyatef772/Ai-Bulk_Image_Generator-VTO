export interface ImageGenerationRequest {
  imageBuffer: Buffer;
  mimeType: string;
  prompt: string;
  model: string;
  quality: number;
}

export interface ImageGenerationResponse {
  imageBuffer: Buffer;
  mimeType: string;
  tokensUsed?: number;
}

/** Generic image-generation service interface (provider-agnostic) */
export interface IImageGenerationService {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  validateCredentials(): Promise<boolean>;
}

/** @deprecated Use IImageGenerationService – kept for backward compat */
export type IGeminiService = IImageGenerationService & {
  /** @deprecated */
  validateApiKey(apiKey: string): Promise<boolean>;
};

// Legacy type aliases so existing imports keep compiling
export type GeminiGenerateRequest = ImageGenerationRequest;
export type GeminiGenerateResponse = ImageGenerationResponse;

export interface IFileSystemService {
  saveGeneratedImage(
    imageBuffer: Buffer,
    originalName: string,
    mimeType: string,
    outputDir: string,
    subfolder?: string
  ): Promise<string>;
  saveFailedRecord(jobId: string, errorMessage: string, outputDir: string): Promise<void>;
  ensureDirectoryStructure(baseDir: string): Promise<void>;
  readImageAsBuffer(filePath: string): Promise<Buffer>;
  deleteFile(filePath: string): Promise<void>;
  fileExists(filePath: string): Promise<boolean>;
  getFileSize(filePath: string): Promise<number>;
  listFiles(directory: string, extensions?: string[]): Promise<string[]>;
  openInExplorer(path: string): Promise<void>;
}

export interface ISettingsRepository {
  get(): Promise<import('../entities/Settings').SettingsEntity>;
  save(settings: import('../entities/Settings').SettingsEntity): Promise<void>;
}

export interface ILoggerService {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
