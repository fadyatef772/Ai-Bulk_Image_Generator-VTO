import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  );
}
