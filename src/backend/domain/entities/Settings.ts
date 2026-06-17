export type ApiProvider = 'gemini' | 'vertex' | 'dust';

export interface SettingsEntity {
  // Provider selection
  apiProvider: ApiProvider;

  // Gemini API (direct)
  geminiApiKey: string;

  // Vertex AI (Gemini via Google Cloud project)
  vertexProjectId: string;
  vertexLocation: string;

  // Dust.tt
  dustApiKey: string;
  dustWorkspaceId: string;
  dustAgentId: string;

  // Common
  outputFolder: string;
  concurrentWorkers: number;
  retryCount: number;
  timeoutMs: number;
  imageQuality: number;
  model: string;
}

export const DEFAULT_SETTINGS: SettingsEntity = {
  apiProvider: 'gemini',

  geminiApiKey: '',

  vertexProjectId: '',
  vertexLocation: 'us-central1',

  dustApiKey: '',
  dustWorkspaceId: '',
  dustAgentId: '',

  outputFolder: '',
  concurrentWorkers: 3,
  retryCount: 3,
  timeoutMs: 120000,
  imageQuality: 90,
  model: 'gemini-2.0-flash-exp',
};

export class Settings implements SettingsEntity {
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

  constructor(data: Partial<SettingsEntity> = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...data };
    this.apiProvider = merged.apiProvider;
    this.geminiApiKey = merged.geminiApiKey;
    this.vertexProjectId = merged.vertexProjectId;
    this.vertexLocation = merged.vertexLocation;
    this.dustApiKey = merged.dustApiKey;
    this.dustWorkspaceId = merged.dustWorkspaceId;
    this.dustAgentId = merged.dustAgentId;
    this.outputFolder = merged.outputFolder;
    this.concurrentWorkers = merged.concurrentWorkers;
    this.retryCount = merged.retryCount;
    this.timeoutMs = merged.timeoutMs;
    this.imageQuality = merged.imageQuality;
    this.model = merged.model;
  }

  isValid(): boolean {
    const baseValid =
      this.outputFolder.length > 0 &&
      this.concurrentWorkers >= 1 &&
      this.concurrentWorkers <= 20 &&
      this.retryCount >= 0 &&
      this.retryCount <= 10 &&
      this.imageQuality >= 10 &&
      this.imageQuality <= 100;

    if (!baseValid) return false;

    switch (this.apiProvider) {
      case 'gemini':
        return this.geminiApiKey.length > 0;
      case 'vertex':
        return this.vertexProjectId.length > 0 && this.vertexLocation.length > 0;
      case 'dust':
        return (
          this.dustApiKey.length > 0 &&
          this.dustWorkspaceId.length > 0 &&
          this.dustAgentId.length > 0
        );
      default:
        return false;
    }
  }
}
