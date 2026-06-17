import { create } from 'zustand';
import type { NavPage, Notification } from '@/lib/types';

interface AppState {
  page: NavPage;
  setPage: (p: NavPage) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  connected: boolean;
  setConnected: (v: boolean) => void;

  notifications: Notification[];
  notify: (type: Notification['type'], message: string) => void;
  dismiss: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  page: 'dashboard',
  setPage: (page) => set({ page }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  connected: false,
  setConnected: (connected) => set({ connected }),

  notifications: [],
  notify: (type, message) => {
    const id = crypto.randomUUID();
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id, type, message, timestamp: Date.now() },
      ].slice(-4),
    }));
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    }, 4500);
  },
  dismiss: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));
