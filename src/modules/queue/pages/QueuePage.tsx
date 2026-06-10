import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueueStore } from '../../../app/store/queueStore';
import { useAppStore } from '../../../app/store/appStore';
import { api, formatDuration, formatETA, formatRelativeTime } from '../../../shared/utils/api';
import { ProgressBar, StatusBadge, EmptyState, Spinner } from '../../../shared/components/UI';
import { GalleryResponse, ImageJob } from '../../../shared/types';

async function fetchJobs() {
  const res = await api.get<GalleryResponse>('/images?limit=500&sortBy=createdAt&sortOrder=desc');
  return res.data;
}

export function QueuePage() {
  const { stats } = useQueueStore();
  const { addNotification } = useAppStore();
  const queryClient = useQueryClient();
  const [actionLoading, setActionLoading] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['queue-jobs'],
    queryFn: fetchJobs,
    refetchInterval: 2000,
  });

  const jobs = data?.jobs ?? [];

  const handleAction = async (action: string, label: string) => {
    setActionLoading(action);
    try {
      await api.post(`/queue/${action}`);
      addNotification('info', `Queue ${label}`);
      queryClient.invalidateQueries({ queryKey: ['queue-jobs'] });
    } catch {
      addNotification('error', `Failed to ${label} queue`);
    } finally {
      setActionLoading('');
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await api.post(`/images/${jobId}/retry`);
      addNotification('info', 'Job queued for retry');
      refetch();
    } catch {
      addNotification('error', 'Failed to retry job');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await api.post(`/images/${jobId}/cancel`);
      refetch();
    } catch {}
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await api.delete(`/images/${jobId}`);
      queryClient.invalidateQueries({ queryKey: ['queue-jobs'] });
    } catch {
      addNotification('error', 'Failed to delete job');
    }
  };

  const processingJobs = jobs.filter(j => j.status === 'processing');
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const doneJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled');

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Processing Queue</h1>
          <p className="page-subtitle">Monitor and control your image generation pipeline</p>
        </div>

        {/* Queue Controls */}
        <div className="flex items-center gap-2">
          {!stats.isRunning && (
            <button
              className="btn-primary"
              onClick={() => handleAction('start', 'started')}
              disabled={!!actionLoading || stats.pending === 0}
            >
              {actionLoading === 'start' ? <Spinner size="sm" /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
              Start
            </button>
          )}
          {stats.isRunning && !stats.isPaused && (
            <button className="btn-secondary" onClick={() => handleAction('pause', 'paused')} disabled={!!actionLoading}>
              {actionLoading === 'pause' ? <Spinner size="sm" /> : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              )}
              Pause
            </button>
          )}
          {stats.isPaused && (
            <button className="btn-primary" onClick={() => handleAction('resume', 'resumed')} disabled={!!actionLoading}>
              Resume
            </button>
          )}
          {stats.isRunning && (
            <button className="btn-secondary" onClick={() => handleAction('stop', 'stopped')} disabled={!!actionLoading}>
              Stop
            </button>
          )}
          {jobs.length > 0 && (
            <button className="btn-danger" onClick={() => handleAction('cancel', 'cancelled')} disabled={!!actionLoading}>
              Cancel All
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            {stats.isRunning && !stats.isPaused && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-emerald-400 font-medium">Running</span>
              </div>
            )}
            {stats.isPaused && <span className="text-sm text-amber-400 font-medium">⏸ Paused</span>}
            {!stats.isRunning && <span className="text-sm text-surface-500">Stopped</span>}
            <span className="text-sm text-surface-500">
              {stats.completed}/{stats.total} completed
            </span>
            {stats.eta && stats.isRunning && (
              <span className="text-sm text-surface-500">
                ETA: <span className="text-surface-200">{formatETA(stats.eta)}</span>
              </span>
            )}
          </div>
          <span className="text-sm font-medium text-surface-200">{stats.progressPercent}%</span>
        </div>
        <ProgressBar
          value={stats.progressPercent}
          indeterminate={stats.isRunning && stats.total === 0}
          variant={stats.failed > 0 ? 'amber' : 'brand'}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          description="Upload images to start processing"
          action={
            <button className="btn-primary" onClick={() => window.location.hash = 'upload'}>
              Upload Images
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Currently Processing */}
          {processingJobs.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wide mb-3">
                Processing now ({processingJobs.length})
              </h2>
              <div className="space-y-2">
                {processingJobs.map(job => (
                  <JobRow key={job.id} job={job} onRetry={handleRetryJob} onCancel={handleCancelJob} onDelete={handleDeleteJob} />
                ))}
              </div>
            </section>
          )}

          {/* Pending */}
          {pendingJobs.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wide mb-3">
                Pending ({pendingJobs.length})
              </h2>
              <div className="space-y-2 max-h-80 overflow-y-auto virtual-scroll">
                {pendingJobs.map(job => (
                  <JobRow key={job.id} job={job} onRetry={handleRetryJob} onCancel={handleCancelJob} onDelete={handleDeleteJob} />
                ))}
              </div>
            </section>
          )}

          {/* Completed / Failed */}
          {doneJobs.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wide mb-3">
                Finished ({doneJobs.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto virtual-scroll">
                {doneJobs.map(job => (
                  <JobRow key={job.id} job={job} onRetry={handleRetryJob} onCancel={handleCancelJob} onDelete={handleDeleteJob} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onRetry, onCancel, onDelete }: {
  job: ImageJob;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-900/60 border border-surface-800/60 hover:border-surface-700/60 transition-all group">
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {job.status === 'processing' && <Spinner size="sm" />}
        {job.status === 'completed' && <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">✓</span>}
        {job.status === 'failed' && <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs">✕</span>}
        {job.status === 'pending' && <span className="w-6 h-6 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-xs text-surface-500">·</span>}
        {job.status === 'cancelled' && <span className="w-6 h-6 rounded-full bg-surface-800 text-surface-500 flex items-center justify-center text-xs">–</span>}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-200 truncate">{job.originalName}</p>
        {job.errorMessage && (
          <p className="text-xs text-rose-400 truncate mt-0.5">{job.errorMessage}</p>
        )}
        {job.processingDurationMs && (
          <p className="text-xs text-surface-500 mt-0.5">Done in {formatDuration(job.processingDurationMs)}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex-shrink-0 text-right hidden sm:block">
        <StatusBadge status={job.status} />
        <p className="text-xs text-surface-600 mt-1">{formatRelativeTime(job.createdAt)}</p>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <button className="btn-ghost text-xs py-1 px-2" onClick={() => onRetry(job.id)}>Retry</button>
        )}
        {job.status === 'pending' && (
          <button className="btn-ghost text-xs py-1 px-2 hover:text-amber-400" onClick={() => onCancel(job.id)}>Cancel</button>
        )}
        {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
          <button className="btn-ghost text-xs py-1 px-2 hover:text-rose-400" onClick={() => onDelete(job.id)}>Delete</button>
        )}
      </div>
    </div>
  );
}
