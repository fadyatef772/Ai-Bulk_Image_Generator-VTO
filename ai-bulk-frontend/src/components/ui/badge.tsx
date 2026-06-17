import { cn } from '@/lib/utils';

/** Status pill — Idle / Running / Completed / Failed families. */
export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
