import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { SettingsEntity, DEFAULT_SETTINGS } from '../../domain/entities/Settings';
import { ISettingsRepository } from '../../domain/interfaces/index';

export class JsonSettingsRepository implements ISettingsRepository {
  private settingsPath: string;
  private cache: SettingsEntity | null = null;

  constructor(dataDir: string = process.cwd()) {
    this.settingsPath = path.join(dataDir, 'settings.json');
  }

  async get(): Promise<SettingsEntity> {
    if (this.cache) return this.cache;

    try {
      if (fsSync.existsSync(this.settingsPath)) {
        const data = await fs.readFile(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(data);
        this.cache = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        this.cache = { ...DEFAULT_SETTINGS };
      }
      return this.cache!;
    } catch {
      this.cache = { ...DEFAULT_SETTINGS };
      return this.cache;
    }
  }

  async save(settings: SettingsEntity): Promise<void> {
    try {
      const dir = path.dirname(this.settingsPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      this.cache = settings;

      // Sync all provider credentials into process.env
      const provider = settings.apiProvider || 'gemini';

      if (settings.geminiApiKey) {
        process.env.GEMINI_API_KEY = settings.geminiApiKey;
      }
      if (settings.vertexProjectId) {
        process.env.VERTEX_PROJECT_ID = settings.vertexProjectId;
      }
      if (settings.vertexLocation) {
        process.env.VERTEX_LOCATION = settings.vertexLocation;
      }
      if (settings.dustApiKey) {
        process.env.DUST_API_KEY = settings.dustApiKey;
      }
      if (settings.dustWorkspaceId) {
        process.env.DUST_WORKSPACE_ID = settings.dustWorkspaceId;
      }
      if (settings.dustAgentId) {
        process.env.DUST_AGENT_ID = settings.dustAgentId;
      }

      process.env.API_PROVIDER = provider;
    } catch (error) {
      throw new Error(`Failed to save settings: ${(error as Error).message}`);
    }
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
