import { create } from 'zustand';
import { QueueStats } from '../../shared/types';

interface QueueStore {
  stats: QueueStats;
  isConnected: boolean;
  lastUpdated: number;

  // Actions
  updateStats: (stats: QueueStats) => void;
  setConnected: (connected: boolean) => void;
}

const DEFAULT_STATS: QueueStats = {
  total: 0,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  isRunning: false,
  isPaused: false,
  progressPercent: 0,
};

export const useQueueStore = create<QueueStore>((set) => ({
  stats: DEFAULT_STATS,
  isConnected: false,
  lastUpdated: 0,

  updateStats: (stats) =>
    set({ stats, lastUpdated: Date.now() }),

  setConnected: (connected) =>
    set({ isConnected: connected }),
}));
