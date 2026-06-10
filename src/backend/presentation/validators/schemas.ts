import { z } from 'zod';

export const uploadImagesSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(2000, 'Prompt too long'),
  outputDir: z.string().min(1, 'Output directory is required'),
});

export const galleryQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'originalName']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(500)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export const updateSettingsSchema = z.object({
  geminiApiKey: z.string().optional(),
  outputFolder: z.string().optional(),
  concurrentWorkers: z.number().min(1).max(20).optional(),
  retryCount: z.number().min(0).max(10).optional(),
  timeoutMs: z.number().min(10000).max(600000).optional(),
  imageQuality: z.number().min(10).max(100).optional(),
  model: z.string().optional(),
});

export type UploadImagesInput = z.infer<typeof uploadImagesSchema>;
export type GalleryQueryInput = z.infer<typeof galleryQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
