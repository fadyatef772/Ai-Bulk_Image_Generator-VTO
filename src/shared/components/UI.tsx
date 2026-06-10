import { JOB_STATUS_BG, JOB_STATUS_LABELS } from '../constants';
import { JobStatus } from '../types';

// ── Progress Bar ──────────────────────────────────────────────
interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  variant?: 'brand' | 'emerald' | 'amber' | 'rose';
  indeterminate?: boolean;
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className = '',
  variant = 'brand',
  indeterminate = false,
  showLabel = false,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const colors = {
    brand: 'bg-gradient-to-r from-brand-600 to-brand-400',
    emerald: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
    amber: 'bg-gradient-to-r from-amber-600 to-amber-400',
    rose: 'bg-gradient-to-r from-rose-600 to-rose-400',
  };

  return (
    <div className={`relative ${className}`}>
      <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
        {indeterminate ? (
          <div className={`h-full w-1/3 ${colors[variant]} rounded-full progress-indeterminate`} />
        ) : (
          <div
            className={`h-full ${colors[variant]} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {showLabel && !indeterminate && (
        <span className="absolute right-0 -top-5 text-xs text-surface-400">{Math.round(pct)}%</span>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' };
  return (
    <div className={`${sizes[size]} ${className} relative`}>
      <div className={`${sizes[size]} border-2 border-surface-700 border-t-brand-500 rounded-full animate-spin`} />
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────
export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`badge ${JOB_STATUS_BG[status]}`}>
      {status === 'processing' && (
        <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
      )}
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'default';
  trend?: 'up' | 'down' | 'flat';
}

export function StatCard({ label, value, sub, icon, color = 'default' }: StatCardProps) {
  const colorClasses = {
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    violet: 'text-accent-violet bg-accent-violet/10 border-accent-violet/20',
    default: 'text-surface-400 bg-surface-800/50 border-surface-700/30',
  };

  return (
    <div className="glass-card p-5 flex items-start gap-4">
      {icon && (
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${colorClasses[color]}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-surface-500 font-medium uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-display font-bold text-surface-50">{value}</p>
        {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-surface-800/60 border border-surface-700/50 flex items-center justify-center text-surface-500 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-surface-300 mb-2">{title}</h3>
      {description && <p className="text-sm text-surface-500 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer ${className}`} />;
}
