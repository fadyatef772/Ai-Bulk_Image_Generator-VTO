import { useQuery } from '@tanstack/react-query';
import { useQueueStore } from '../../../app/store/queueStore';
import { useAppStore } from '../../../app/store/appStore';
import { StatCard, ProgressBar, EmptyState } from '../../../shared/components/UI';
import { api, formatDuration, formatETA } from '../../../shared/utils/api';
import { QueueStats } from '../../../shared/types';

function ImagesIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
}
function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polyline points="20 6 9 17 4 12"/></svg>;
}
function ClockIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function AlertIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
function PlayIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
}
function UploadIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}

async function fetchStats() {
  const res = await api.get<QueueStats>('/queue/stats');
  return res.data;
}

export function DashboardPage() {
  const { stats } = useQueueStore();
  const { navigate } = useAppStore();

  const { data: liveStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: fetchStats,
    refetchInterval: 3000,
  });

  const s = liveStats ?? stats;
  const avgTime = s.completed > 0 ? '~45s' : '--';

  const handleStartQueue = async () => {
    await api.post('/queue/start');
  };

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your image generation pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary" onClick={() => navigate('upload')}>
            <UploadIcon /> Upload Images
          </button>
          {s.total > 0 && s.pending > 0 && !s.isRunning && (
            <button className="btn-primary" onClick={handleStartQueue}>
              <PlayIcon /> Start Processing
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Jobs"
          value={s.total}
          sub="All time"
          icon={<ImagesIcon />}
          color="default"
        />
        <StatCard
          label="Completed"
          value={s.completed}
          sub={`${s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0}% success rate`}
          icon={<CheckIcon />}
          color="emerald"
        />
        <StatCard
          label="Pending"
          value={s.pending}
          sub={s.eta ? `ETA: ${formatETA(s.eta)}` : 'Ready to process'}
          icon={<ClockIcon />}
          color="amber"
        />
        <StatCard
          label="Failed"
          value={s.failed}
          sub={s.failed > 0 ? 'Click to retry' : 'All good!'}
          icon={<AlertIcon />}
          color={s.failed > 0 ? 'rose' : 'default'}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Progress Panel */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-display font-semibold text-surface-100">Processing Progress</h2>
            <div className="flex items-center gap-2">
              {s.isRunning && !s.isPaused && (
                <span className="badge bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Running
                </span>
              )}
              {s.isPaused && (
                <span className="badge bg-amber-500/10 text-amber-400 border-amber-500/20">Paused</span>
              )}
              {!s.isRunning && s.total === 0 && (
                <span className="badge bg-surface-700/50 text-surface-400 border-surface-600/30">Idle</span>
              )}
            </div>
          </div>

          {s.total === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Upload images to get started with AI generation"
              action={
                <button className="btn-primary" onClick={() => navigate('upload')}>
                  <UploadIcon /> Upload Images
                </button>
              }
            />
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-surface-400">Overall progress</span>
                  <span className="text-surface-200 font-medium">{s.progressPercent}%</span>
                </div>
                <ProgressBar value={s.progressPercent} variant={s.failed > 0 ? 'amber' : 'brand'} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Pending', value: s.pending, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  { label: 'Processing', value: s.processing, color: 'text-brand-400', bg: 'bg-brand-500/10' },
                  { label: 'Done', value: s.completed, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: 'Failed', value: s.failed, color: 'text-rose-400', bg: 'bg-rose-500/10' },
                ].map(item => (
                  <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-display font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-xs text-surface-500 mt-1">{item.label}</p>
                  </div>
                ))}
              </div>

              {s.eta && s.isRunning && (
                <div className="flex items-center gap-2 text-sm text-surface-400 pt-2 border-t border-surface-800">
                  <ClockIcon />
                  <span>Estimated time remaining: <span className="text-surface-200 font-medium">{formatETA(s.eta)}</span></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-6">
          <h2 className="text-base font-display font-semibold text-surface-100 mb-5">Quick Actions</h2>
          <div className="space-y-3">
            <button
              className="w-full text-left p-4 rounded-xl bg-surface-800/60 hover:bg-surface-800 border border-surface-700/50 hover:border-surface-600 transition-all duration-200 group"
              onClick={() => navigate('upload')}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center group-hover:bg-brand-500/30 transition-colors">
                  <UploadIcon />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-200">Upload Images</p>
                  <p className="text-xs text-surface-500">Add files to queue</p>
                </div>
              </div>
            </button>

            <button
              className="w-full text-left p-4 rounded-xl bg-surface-800/60 hover:bg-surface-800 border border-surface-700/50 hover:border-surface-600 transition-all duration-200 group"
              onClick={() => navigate('queue')}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                  <ClockIcon />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-200">View Queue</p>
                  <p className="text-xs text-surface-500">Manage processing jobs</p>
                </div>
              </div>
            </button>

            <button
              className="w-full text-left p-4 rounded-xl bg-surface-800/60 hover:bg-surface-800 border border-surface-700/50 hover:border-surface-600 transition-all duration-200 group"
              onClick={() => navigate('gallery')}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                  <ImagesIcon />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-200">View Gallery</p>
                  <p className="text-xs text-surface-500">{s.completed} generated images</p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-surface-800">
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-3">Performance</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-surface-500">Avg. generation time</span>
                <span className="text-surface-300 font-medium">{avgTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Processing now</span>
                <span className="text-surface-300 font-medium">{s.processing} images</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Success rate</span>
                <span className="text-emerald-400 font-medium">
                  {s.total > 0 ? Math.round(((s.total - s.failed) / s.total) * 100) : 100}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
