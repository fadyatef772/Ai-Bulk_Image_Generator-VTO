import { ImageJob, JobStatus } from '../../domain/entities/ImageJob';
import { IImageJobRepository, FindAllOptions } from '../../domain/repositories/IImageJobRepository';

export class InMemoryImageJobRepository implements IImageJobRepository {
  private jobs: Map<string, ImageJob> = new Map();

  async findById(id: string): Promise<ImageJob | null> {
    return this.jobs.get(id) || null;
  }

  async findAll(options: FindAllOptions = {}): Promise<ImageJob[]> {
    let jobs = Array.from(this.jobs.values());

    if (options.status) {
      jobs = jobs.filter(j => j.status === options.status);
    }

    if (options.search) {
      const search = options.search.toLowerCase();
      jobs = jobs.filter(j => j.originalName.toLowerCase().includes(search));
    }

    // Sort
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    jobs.sort((a, b) => {
      const aVal = a[sortBy] as Date | string;
      const bVal = b[sortBy] as Date | string;

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortOrder === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit;

    if (limit !== undefined) {
      return jobs.slice(offset, offset + limit);
    }

    return jobs.slice(offset);
  }

  async findByStatus(status: JobStatus): Promise<ImageJob[]> {
    return Array.from(this.jobs.values()).filter(j => j.status === status);
  }

  async save(job: ImageJob): Promise<ImageJob> {
    this.jobs.set(job.id, job);
    return job;
  }

  async update(id: string, updates: Partial<ImageJob>): Promise<ImageJob> {
    const existing = this.jobs.get(id);
    if (!existing) {
      throw new Error(`Job not found: ${id}`);
    }

    const updated = Object.assign(existing, updates, { updatedAt: new Date() });
    this.jobs.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.jobs.delete(id);
  }

  async deleteAll(): Promise<void> {
    this.jobs.clear();
  }

  async count(status?: JobStatus): Promise<number> {
    if (status) {
      return Array.from(this.jobs.values()).filter(j => j.status === status).length;
    }
    return this.jobs.size;
  }

  // Helper to get stats
  async getStats(): Promise<Record<JobStatus | 'total', number>> {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
    };
  }
}
