import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import type { AppSettings, GalleryQuery } from '@/lib/types';

export function useQueueStats() {
  return useQuery({
    queryKey: ['queue-stats'],
    queryFn: async () => {
      const res = await api.getQueueStats();
      return res.data!;
    },
    // SSE pushes updates; poll slowly as a fallback.
    refetchInterval: 5000,
  });
}

export function useGallery(query: GalleryQuery = {}) {
  return useQuery({
    queryKey: ['gallery', query],
    queryFn: async () => {
      const res = await api.getGallery(query);
      return res.data ?? { jobs: [], total: 0 };
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.getSettings();
      return res.data!;
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  const notify = useAppStore((s) => s.notify);
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const res = await api.updateSettings(patch);
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to save settings');
      return res.data!;
    },
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
      notify('success', 'Settings saved');
    },
    onError: (e: Error) => notify('error', e.message),
  });
}

export function useQueueControls() {
  const qc = useQueryClient();
  const notify = useAppStore((s) => s.notify);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['queue-stats'] });

  return {
    start: useMutation({
      mutationFn: () => api.startQueue(),
      onSuccess: () => {
        invalidate();
        notify('info', 'Queue started');
      },
    }),
    pause: useMutation({ mutationFn: () => api.pauseQueue(), onSuccess: invalidate }),
    resume: useMutation({ mutationFn: () => api.resumeQueue(), onSuccess: invalidate }),
    stop: useMutation({
      mutationFn: () => api.stopQueue(),
      onSuccess: () => {
        invalidate();
        notify('info', 'Queue stopped');
      },
    }),
  };
}

export function useJobActions() {
  const qc = useQueryClient();
  const notify = useAppStore((s) => s.notify);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['gallery'] });
    qc.invalidateQueries({ queryKey: ['queue-stats'] });
  };
  return {
    retry: useMutation({
      mutationFn: (id: string) => api.retryJob(id),
      onSuccess: () => {
        refresh();
        notify('info', 'Job re-queued');
      },
    }),
    cancel: useMutation({ mutationFn: (id: string) => api.cancelJob(id), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id: string) => api.deleteJob(id),
      onSuccess: () => {
        refresh();
        notify('success', 'Job deleted');
      },
    }),
  };
}
