import { useEffect, useRef } from 'react';
import { SSE_URL } from '../../shared/constants';
import { QueueStats } from '../../shared/types';
import { useQueueStore } from '../store/queueStore';
import { useAppStore } from '../store/appStore';

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { updateStats, setConnected } = useQueueStore();
  const { addNotification } = useAppStore();

  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(SSE_URL);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };

    es.addEventListener('stats', (e: MessageEvent) => {
      try {
        const stats: QueueStats = JSON.parse(e.data);
        updateStats(stats);
      } catch {}
    });

    es.addEventListener('job:completed', () => {
      // Refresh gallery on completion
    });

    es.addEventListener('job:failed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        addNotification('error', `Job failed: ${data.error || 'Unknown error'}`);
      } catch {}
    });

    es.addEventListener('queue:complete', () => {
      addNotification('success', '✓ All images processed successfully!');
    });

    es.addEventListener('queue:started', () => {
      addNotification('info', 'Queue processing started');
    });

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  return <>{children}</>;
}
