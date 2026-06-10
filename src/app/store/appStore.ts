import { create } from 'zustand';
import { NavPage, Notification } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  currentPage: NavPage;
  notifications: Notification[];
  isSidebarCollapsed: boolean;
  isElectron: boolean;

  // Actions
  navigate: (page: NavPage) => void;
  addNotification: (type: Notification['type'], message: string) => void;
  removeNotification: (id: string) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentPage: 'dashboard',
  notifications: [],
  isSidebarCollapsed: false,
  isElectron: typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron,

  navigate: (page) => set({ currentPage: page }),

  addNotification: (type, message) => {
    const notification: Notification = {
      id: uuidv4(),
      type,
      message,
      timestamp: Date.now(),
    };

    set(state => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeNotification(notification.id);
    }, 5000);
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }));
  },

  toggleSidebar: () => {
    set(state => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
  },
}));
