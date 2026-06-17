import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import type { Notification } from '@/lib/types';

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const COLOR: Record<Notification['type'], string> = {
  success: 'text-success border-success/25',
  error: 'text-danger border-danger/25',
  warning: 'text-warning border-warning/25',
  info: 'text-primary-400 border-primary/25',
};

export function Toaster() {
  const notifications = useAppStore((s) => s.notifications);
  const dismiss = useAppStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      <AnimatePresence>
        {notifications.map((n) => {
          const Icon = ICON[n.type];
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className={`glass-card pointer-events-auto flex items-start gap-3 border p-4 ${COLOR[n.type]}`}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm text-text-primary">{n.message}</p>
              <button onClick={() => dismiss(n.id)} className="text-text-secondary hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
