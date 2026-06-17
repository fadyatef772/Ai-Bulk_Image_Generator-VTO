import { motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Layers,
  List,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StreakOverlay } from '@/components/ui/streak-overlay';
import { useQueueStats, useGallery, useQueueControls } from '@/hooks/useQueries';
import { useAppStore } from '@/store/appStore';
import { formatDuration } from '@/lib/api';

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone,
  delay,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Layers;
  tone: 'primary' | 'success' | 'warning' | 'muted';
  delay: number;
}) {
  const toneMap = {
    primary: 'bg-primary/12 text-primary-400',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    muted: 'bg-white/[0.06] text-text-secondary',
  } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 24 }}
      whileHover={{ y: -4 }}
      className="glass-card hover:shadow-glow"
    >
      <StreakOverlay />
      <div className="relative p-6">
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${toneMap[tone]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <p className="mt-5 text-stat tabular-nums text-text-primary">{value}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {label}
        </p>
        <p className="mt-2 text-[12px] text-text-secondary/80">{description}</p>
      </div>
    </motion.div>
  );
}

export function DashboardPage() {
  const setPage = useAppStore((s) => s.setPage);
  const { data: stats } = useQueueStats();
  const { data: gallery } = useGallery({ status: 'completed', limit: 1 });
  const controls = useQueueControls();

  const s = stats ?? {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    isRunning: false,
    isPaused: false,
    progressPercent: 0,
  };

  const hasJobs = s.total > 0;
  const statusLabel = s.isPaused ? 'Paused' : s.isRunning ? 'Running' : 'Idle';
  const statusPill = s.isPaused
    ? 'bg-warning/10 text-warning border-warning/25'
    : s.isRunning
      ? 'bg-primary/10 text-primary-400 border-primary/30'
      : 'bg-white/5 text-text-secondary border-white/10';
  const successRate =
    s.completed + s.failed > 0
      ? Math.round((s.completed / (s.completed + s.failed)) * 100)
      : 100;
  const generatedCount = gallery?.total ?? s.completed;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-dashboard text-text-primary">Dashboard</h1>
          <p className="mt-2 text-text-secondary">Overview of your image generation pipeline</p>
        </div>
        <Button variant="secondary" size="lg" onClick={() => setPage('upload')}>
          <Upload className="h-[18px] w-[18px]" />
          Upload Images
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Jobs" value={s.total} description="All jobs in pipeline" icon={Layers} tone="primary" delay={0} />
        <StatCard label="Completed" value={s.completed} description="Successfully generated" icon={CheckCircle2} tone="success" delay={0.06} />
        <StatCard label="Pending" value={s.pending + s.processing} description="Waiting & processing" icon={Clock} tone="warning" delay={0.12} />
        <StatCard label="Failed" value={s.failed} description="Errors encountered" icon={XCircle} tone="muted" delay={0.18} />
      </div>

      {/* Progress + Quick Actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Processing Progress */}
        <Card className="lg:col-span-2" hover={false}>
          <CardContent className="flex min-h-[360px] flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-section text-text-primary">Processing Progress</h3>
              <Badge className={statusPill}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {statusLabel}
              </Badge>
            </div>

            {hasJobs ? (
              <div className="mt-8 flex flex-1 flex-col">
                <div className="flex items-end justify-between">
                  <p className="text-stat tabular-nums text-text-primary">{s.progressPercent}%</p>
                  <p className="text-sm text-text-secondary">
                    {s.completed + s.failed} / {s.total} processed
                  </p>
                </div>
                <Progress value={s.progressPercent} className="mt-4" />

                <div className="mt-8 grid grid-cols-3 gap-4">
                  {[
                    { k: 'Processing', v: s.processing, c: 'text-primary-400' },
                    { k: 'Pending', v: s.pending, c: 'text-warning' },
                    { k: 'Completed', v: s.completed, c: 'text-success' },
                  ].map((x) => (
                    <div key={x.k} className="rounded-xl border bg-white/[0.02] p-4">
                      <p className={`text-2xl font-bold tabular-nums ${x.c}`}>{x.v}</p>
                      <p className="mt-1 text-[12px] text-text-secondary">{x.k}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-auto flex gap-3 pt-6">
                  {s.isRunning ? (
                    <Button variant="secondary" onClick={() => controls.stop.mutate()}>
                      Stop Queue
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => controls.start.mutate()}>
                      <Zap className="h-4 w-4" />
                      Start Queue
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setPage('queue')}>
                    View Queue
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.03]">
                  <Activity className="h-7 w-7 text-text-secondary" />
                </div>
                <p className="mt-5 text-xl font-semibold text-text-primary">No jobs yet</p>
                <p className="mt-2 max-w-xs text-sm text-text-secondary">
                  Upload images to get started with AI generation
                </p>
                <Button variant="primary" className="mt-6" onClick={() => setPage('upload')}>
                  <Upload className="h-4 w-4" />
                  Upload Images
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card hover={false}>
          <CardContent className="flex h-full flex-col">
            <h3 className="text-section text-text-primary">Quick Actions</h3>

            <div className="mt-5 space-y-3">
              <ActionRow icon={Upload} title="Upload Images" desc="Add files to queue" onClick={() => setPage('upload')} />
              <ActionRow icon={List} title="View Queue" desc="Manage processing jobs" onClick={() => setPage('queue')} />
              <ActionRow icon={ImageIcon} title="View Gallery" desc={`${generatedCount} generated images`} onClick={() => setPage('gallery')} />
            </div>

            <div className="mt-7 border-t pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                Performance
              </p>
              <div className="mt-4 space-y-3.5">
                <PerfRow label="Avg generation time" value={formatDuration(undefined)} />
                <PerfRow label="Processing now" value={String(s.processing)} />
                <PerfRow label="Success rate" value={`${successRate}%`} valueClass="text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: typeof Upload;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ x: 3 }}
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-xl border bg-white/[0.02] p-3.5 text-left transition hover:bg-white/[0.05] hover:shadow-glow"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/12 text-primary-400 transition group-hover:bg-primary/20">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-[12px] text-text-secondary">{desc}</p>
      </div>
    </motion.button>
  );
}

function PerfRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold text-text-primary ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}
