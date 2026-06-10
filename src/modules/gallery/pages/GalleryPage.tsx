import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatFileSize, formatDuration, formatRelativeTime } from '../../../shared/utils/api';
import { useAppStore } from '../../../app/store/appStore';
import { EmptyState, StatusBadge, Spinner } from '../../../shared/components/UI';
import { GalleryResponse, ImageJob, JobStatus } from '../../../shared/types';

const STATUS_FILTERS: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Pending', value: 'pending' },
];

async function fetchGallery(status: JobStatus | 'all', search: string, sortBy: string, sortOrder: string) {
  const params = new URLSearchParams({ limit: '500', sortBy, sortOrder });
  if (status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  const res = await api.get<GalleryResponse>(`/images?${params}`);
  return res.data;
}

function ImageCard({ job, onDelete, onOpen }: {
  job: ImageJob;
  onDelete: (id: string) => void;
  onOpen: (job: ImageJob) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const getImageUrl = () => {
    if (!job.outputPath) return null;
    // Use the static server to serve the image
    const filename = job.outputPath.replace(/\\/g, '/').split('/').pop();
    return `http://localhost:3001/output/Generated/${filename}`;
  };

  const imgUrl = getImageUrl();

  return (
    <div className="group relative glass-card overflow-hidden hover:border-surface-600/70 transition-all duration-200 hover:shadow-card-hover">
      {/* Image */}
      <div
        className="aspect-square bg-surface-800 cursor-pointer overflow-hidden relative"
        onClick={() => onOpen(job)}
      >
        {job.status === 'completed' && imgUrl && !imgError ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 shimmer" />}
            <img
              src={imgUrl}
              alt={job.originalName}
              className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            {job.status === 'processing' ? (
              <Spinner size="md" />
            ) : job.status === 'pending' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-600">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-600">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            )}
            <span className="text-xs text-surface-600">{job.status}</span>
          </div>
        )}

        {/* Hover overlay */}
        {job.status === 'completed' && (
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
            <div className="flex gap-1.5 w-full">
              <button
                className="flex-1 text-xs py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-colors"
                onClick={e => { e.stopPropagation(); onOpen(job); }}
              >
                View
              </button>
              <button
                className="flex-1 text-xs py-1.5 rounded-lg bg-rose-500/30 backdrop-blur-sm text-rose-300 hover:bg-rose-500/50 transition-colors"
                onClick={e => { e.stopPropagation(); onDelete(job.id); }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-surface-300 truncate mb-1">{job.originalName}</p>
        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} />
          <span className="text-xs text-surface-600">{formatRelativeTime(job.createdAt)}</span>
        </div>
        {job.processingDurationMs && (
          <p className="text-xs text-surface-600 mt-1">{formatDuration(job.processingDurationMs)}</p>
        )}
        {job.errorMessage && (
          <p className="text-xs text-rose-400 mt-1 truncate">{job.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function ImageModal({ job, onClose }: { job: ImageJob; onClose: () => void }) {
  const { addNotification } = useAppStore();
  const filename = job.outputPath?.replace(/\\/g, '/').split('/').pop();
  const imgUrl = filename ? `http://localhost:3001/output/Generated/${filename}` : null;

  const handleOpenFolder = async () => {
    try {
      await api.post('/settings/open-folder');
    } catch {
      addNotification('error', 'Could not open folder');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full glass-card overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
          <div>
            <h3 className="text-sm font-medium text-surface-200 truncate">{job.originalName}</h3>
            <p className="text-xs text-surface-500">{formatFileSize(job.fileSize)} · {formatRelativeTime(job.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {job.outputPath && (
              <button className="btn-secondary text-xs py-1.5" onClick={handleOpenFolder}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Open Folder
              </button>
            )}
            <button className="btn-ghost w-8 h-8 p-0" onClick={onClose}>✕</button>
          </div>
        </div>

        {imgUrl && (
          <div className="bg-surface-950 flex items-center justify-center max-h-[65vh] overflow-hidden">
            <img src={imgUrl} alt={job.originalName} className="max-w-full max-h-[65vh] object-contain" />
          </div>
        )}

        <div className="px-5 py-4 bg-surface-900/50">
          <p className="text-xs font-medium text-surface-500 mb-2">Prompt used</p>
          <p className="text-sm text-surface-300 leading-relaxed line-clamp-3">{job.prompt}</p>
        </div>
      </div>
    </div>
  );
}

export function GalleryPage() {
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('completed');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedJob, setSelectedJob] = useState<ImageJob | null>(null);
  const { addNotification } = useAppStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['gallery', statusFilter, search, sortBy, sortOrder],
    queryFn: () => fetchGallery(statusFilter, search, sortBy, sortOrder),
    refetchInterval: statusFilter === 'completed' ? false : 3000,
  });

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.delete(`/images/${id}`);
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      if (selectedJob?.id === id) setSelectedJob(null);
    } catch {
      addNotification('error', 'Failed to delete image');
    }
  }, [addNotification, queryClient, selectedJob]);

  const handleOpenFolder = async () => {
    try {
      await api.post('/settings/open-folder');
    } catch {}
  };

  return (
    <div className="p-8 animate-fade-in">
      <div className="page-header flex items-start justify-between max-w-7xl mx-auto">
        <div>
          <h1 className="page-title">Generated Gallery</h1>
          <p className="page-subtitle">{total} image{total !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-secondary" onClick={handleOpenFolder}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Open Output Folder
        </button>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto mb-6 flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-1 p-1 bg-surface-900 rounded-xl border border-surface-800">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === f.value
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search by filename..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-8 py-2 text-xs"
          />
        </div>

        {/* Sort */}
        <select
          className="input-field w-auto py-2 text-xs"
          value={`${sortBy}:${sortOrder}`}
          onChange={e => {
            const [by, order] = e.target.value.split(':');
            setSortBy(by);
            setSortOrder(order);
          }}
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="originalName:asc">Name A→Z</option>
          <option value="originalName:desc">Name Z→A</option>
        </select>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No images found"
            description={statusFilter === 'completed' ? 'Generated images will appear here once processing completes' : 'No images match your current filter'}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {jobs.map(job => (
              <ImageCard
                key={job.id}
                job={job}
                onDelete={handleDelete}
                onOpen={setSelectedJob}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedJob && (
        <ImageModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
