import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StreakOverlay } from './streak-overlay';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  streaks?: boolean;
  hover?: boolean;
  children?: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, streaks = true, hover = false, children, ...props }, ref) => (
    <motion.div
      ref={ref}
      whileHover={hover ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn('glass-card', hover && 'hover:shadow-glow', className)}
      {...props}
    >
      {streaks && <StreakOverlay />}
      <div className="relative">{children}</div>
    </motion.div>
  ),
);
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4 p-6 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-section text-text-primary', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[13px] text-text-secondary', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}
