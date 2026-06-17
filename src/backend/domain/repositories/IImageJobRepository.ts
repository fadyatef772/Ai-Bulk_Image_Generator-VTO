import { ImageJob, JobStatus } from '../entities/ImageJob';

export interface IImageJobRepository {
  findById(id: string): Promise<ImageJob | null>;
  findAll(options?: FindAllOptions): Promise<ImageJob[]>;
  findByStatus(status: JobStatus): Promise<ImageJob[]>;
  save(job: ImageJob): Promise<ImageJob>;
  update(id: string, updates: Partial<ImageJob>): Promise<ImageJob>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  count(status?: JobStatus): Promise<number>;
}

export interface FindAllOptions {
  status?: JobStatus;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'originalName';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}
