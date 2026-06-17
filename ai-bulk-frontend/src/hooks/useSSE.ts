import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SSE_URL } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import type { QueueStats } from '@/lib/types';

/**
 * Connects to the backend SSE stream (GET /api/events) and keeps the UI live.
 * The backend emits: stats, job:completed, job:failed, queue:complete, queue:started.
 */
export function useSSE() {
  const queryClient = useQueryClient();
  const setConnected = useAppStore((s) => s.setConnected);
  const notify = useAppStore((s) => s.notify);

  useEffect(() => {
    const es = new EventSource(SSE_URL);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const refreshQueue = (stats?: QueueStats) => {
      if (stats) {
        queryClient.setQueryData(['queue-stats'], stats);
      } else {
        queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      }
    };

    const refreshGallery = () => {
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
    };

    const refreshAll = (stats?: QueueStats) => {
      refreshQueue(stats);
      refreshGallery();
    };

    const onStats = (e: MessageEvent) => {
      try {
        const stats = JSON.parse(e.data) as QueueStats;
        refreshQueue(stats);
      } catch {
        /* ignore malformed frame */
      }
    };

    const onMaybeStats = (e: MessageEvent) => {
      try {
        const stats = JSON.parse(e.data) as QueueStats;
        refreshQueue(stats);
      } catch {
        refreshQueue();
      }
    };

    const onJobLifecycle = () => {
      refreshAll();
    };

    es.addEventListener('stats', onStats);
    es.addEventListener('stats:updated', onMaybeStats);
    es.addEventListener('jobs:added', onJobLifecycle);
    es.addEventListener('job:created', onJobLifecycle);
    es.addEventListener('job:started', onJobLifecycle);
    es.addEventListener('job:progress', onJobLifecycle);
    es.addEventListener('job:retrying', onJobLifecycle);
    es.addEventListener('job:cancelled', onJobLifecycle);
    es.addEventListener('job:completed', onJobLifecycle);
    es.addEventListener('job:failed', (e) => {
      refreshAll();
      try {
        const d = JSON.parse((e as MessageEvent).data);
        if (d?.error) notify('error', `Job failed: ${d.error}`);
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('queue:started', onMaybeStats);
    es.addEventListener('queue:paused', onMaybeStats);
    es.addEventListener('queue:resumed', onMaybeStats);
    es.addEventListener('queue:stopped', onMaybeStats);
    es.addEventListener('queue:complete', () => {
      refreshAll();
      notify('success', 'Queue complete — all jobs processed');
    });

    return () => es.close();
  }, [queryClient, setConnected, notify]);
}
