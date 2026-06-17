import { motion } from 'framer-motion';
import { Pause, Play, RotateCcw, Square, Trash2, X, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useGallery, useJobActions, useQueueControls, useQueueStats } from '@/hooks/useQueries';
import { JOB_STATUS_LABELS, JOB_STATUS_PILL } from '@/lib/constants';
import { formatDuration, formatRelativeTime } from '@/lib/api';
import type { ImageJob } from '@/lib/types';

export function QueuePage() {
  const { data: stats } = useQueueStats();
  const { data: gallery } = useGallery({ sortBy: 'updatedAt', sortOrder: 'desc', limit: 100 });
  const controls = useQueueControls();
  const actions = useJobActions();

  const s = stats;
  const jobs = gallery?.jobs ?? [];
  const isRunning = s?.isRunning ?? false;
  const isPaused = s?.isPaused ?? false;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-dashboard text-text-primary">Processing Queue</h1>
          <p className="mt-2 text-text-secondary">Manage and monitor your generation jobs</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {!isRunning ? (
            <Button variant="primary" onClick={() => controls.start.mutate()}>
              <Zap className="h-4 w-4" />
              Start
            </Button>
          ) : isPaused ? (
            <Button variant="success" onClick={() => controls.resume.mutate()}>
              <Play className="h-4 w-4" />
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => controls.pause.mutate()}>
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}
          <Button variant="danger" onClick={() => controls.stop.mutate()}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>

      {/* Live progress */}
      <Card hover={false}>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h3 className="text-section text-text-primary">Live Progress</h3>
              <Badge
                className={
                  isPaused
                    ? 'bg-warning/10 text-warning border-warning/25'
                    : isRunning
                      ? 'bg-primary/10 text-primary-400 border-primary/30'
                      : 'bg-white/5 text-text-secondary border-white/10'
                }
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {isPaused ? 'Paused' : isRunning ? 'Running' : 'Idle'}
              </Badge>
            </div>
            <p className="text-sm text-text-secondary">
              {(s?.completed ?? 0) + (s?.failed ?? 0)} / {s?.total ?? 0} processed
            </p>
          </div>
          <Progress value={s?.progressPercent ?? 0} className="mt-4" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total" value={s?.total ?? 0} />
            <Stat label="Pending" value={s?.pending ?? 0} tone="text-warning" />
            <Stat label="Processing" value={s?.processing ?? 0} tone="text-primary-400" />
            <Stat label="Completed" value={s?.completed ?? 0} tone="text-success" />
            <Stat label="Failed" value={s?.failed ?? 0} tone="text-danger" />
          </div>
        </CardContent>
      </Card>

      {/* Job list */}
      <Card hover={false}>
        <CardContent>
          <h3 className="text-section text-text-primary">Jobs</h3>
          {jobs.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-secondary">
              No jobs in the queue. Upload images to get started.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {jobs.map((job, i) => (
                <JobRow key={job.id} job={job} index={i} actions={actions} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-white/[0.02] p-3.5">
      <p className={`text-xl font-bold tabular-nums ${tone ?? 'text-text-primary'}`}>{value}</p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{label}</p>
    </div>
  );
}

function JobRow({
  job,
  index,
  actions,
}: {
  job: ImageJob;
  index: number;
  actions: ReturnType<typeof useJobActions>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="flex items-center gap-4 rounded-xl border bg-white/[0.02] p-3.5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-sm font-medium text-text-primary">{job.originalName}</p>
          <Badge className={JOB_STATUS_PILL[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
          {job.retryCount > 0 && (
            <span className="text-[11px] text-text-secondary">retry {job.retryCount}</span>
          )}
        </div>
        <p className="mt-1 truncate text-[12px] text-text-secondary">{job.prompt}</p>
        {job.errorMessage && (
          <p className="mt-1 truncate text-[12px] text-danger/80">{job.errorMessage}</p>
        )}
      </div>

      <div className="hidden text-right sm:block">
        <p className="text-[12px] text-text-secondary">{formatRelativeTime(job.updatedAt)}</p>
        {job.processingDurationMs != null && (
          <p className="text-[11px] text-text-secondary/70">
            {formatDuration(job.processingDurationMs)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {job.status === 'failed' && (
          <Button variant="ghost" size="icon" onClick={() => actions.retry.mutate(job.id)} title="Retry">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {(job.status === 'pending' || job.status === 'processing') && (
          <Button variant="ghost" size="icon" onClick={() => actions.cancel.mutate(job.id)} title="Cancel">
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => actions.remove.mutate(job.id)} title="Delete">
          <Trash2 className="h-4 w-4 text-danger/80" />
        </Button>
      </div>
    </motion.div>
  );
}
