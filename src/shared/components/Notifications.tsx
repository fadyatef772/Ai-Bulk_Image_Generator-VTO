import { useAppStore } from '../../app/store/appStore';
import { Notification } from '../types';

function NotificationItem({ notification }: { notification: Notification }) {
  const { removeNotification } = useAppStore();

  const styles = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    info: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  };

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-sm max-w-sm animate-slide-up ${styles[notification.type]}`}
    >
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs font-bold">
        {icons[notification.type]}
      </span>
      <p className="flex-1 leading-relaxed">{notification.message}</p>
      <button
        onClick={() => removeNotification(notification.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

export function NotificationContainer() {
  const { notifications } = useAppStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map(n => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </div>
  );
}
