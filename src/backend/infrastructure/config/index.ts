import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const configSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Provider selection
  API_PROVIDER: z.enum(['gemini', 'vertex', 'dust']).default('gemini'),

  // Gemini (direct)
  GEMINI_API_KEY: z.string().optional().default(''),

  // Vertex AI — auth is ADC-only (read from ~/.config/gcloud/application_default_credentials.json)
  VERTEX_PROJECT_ID: z.string().optional().default(''),
  VERTEX_LOCATION: z.string().optional().default('us-central1'),

  // Dust.tt
  DUST_API_KEY: z.string().optional().default(''),
  DUST_WORKSPACE_ID: z.string().optional().default(''),
  DUST_AGENT_ID: z.string().optional().default(''),

  // Queue / processing
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional().default(''),
  QUEUE_CONCURRENCY: z.string().default('3').transform(Number),
  QUEUE_MAX_RETRIES: z.string().default('3').transform(Number),
  QUEUE_RETRY_DELAY: z.string().default('5000').transform(Number),
  OUTPUT_DIR: z.string().default('./output'),
  MAX_FILE_SIZE_MB: z.string().default('20').transform(Number),
  LOG_LEVEL: z.string().default('info'),
  LOG_DIR: z.string().default('./logs'),
  IMAGE_QUALITY: z.string().default('90').transform(Number),
  MAX_DIMENSION: z.string().default('4096').transform(Number),
});

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }

  _config = result.data;
  return _config;
}

export default getConfig;
