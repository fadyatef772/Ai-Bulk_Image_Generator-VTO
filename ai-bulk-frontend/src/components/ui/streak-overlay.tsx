import { cn } from '@/lib/utils';

/**
 * Futuristic diagonal light-streak overlay used on cards, sidebar active item,
 * and stat cards. Purely decorative; sits behind content with low opacity.
 */
export function StreakOverlay({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {/* soft top corner glow */}
      <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      {/* diagonal streaks */}
      <div className="absolute -inset-y-10 left-[18%] w-px rotate-[18deg] bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
      <div className="absolute -inset-y-10 left-[26%] w-px rotate-[18deg] bg-gradient-to-b from-transparent via-secondary/20 to-transparent" />
      <div className="absolute -inset-y-10 right-[24%] w-px rotate-[18deg] bg-gradient-to-b from-transparent via-primary/15 to-transparent" />
    </div>
  );
}
