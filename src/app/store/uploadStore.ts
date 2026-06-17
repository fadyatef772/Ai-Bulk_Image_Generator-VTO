import { create } from 'zustand';

export interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

interface UploadStore {
  pendingFiles: PendingFile[];
  prompt: string;
  isUploading: boolean;
  uploadProgress: number;

  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  setPrompt: (prompt: string) => void;
  setUploading: (uploading: boolean) => void;
  setProgress: (progress: number) => void;
  updateFileStatus: (id: string, status: PendingFile['status'], error?: string) => void;
}

export const useUploadStore = create<UploadStore>((set) => ({
  pendingFiles: [],
  prompt: '',
  isUploading: false,
  uploadProgress: 0,

  addFiles: (files) => {
    const newPending: PendingFile[] = files.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending' as const,
    }));

    set(state => ({
      pendingFiles: [...state.pendingFiles, ...newPending],
    }));
  },

  removeFile: (id) => {
    set(state => {
      const file = state.pendingFiles.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return {
        pendingFiles: state.pendingFiles.filter(f => f.id !== id),
      };
    });
  },

  clearFiles: () => {
    set(state => {
      state.pendingFiles.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      return { pendingFiles: [], uploadProgress: 0 };
    });
  },

  setPrompt: (prompt) => set({ prompt }),
  setUploading: (isUploading) => set({ isUploading }),
  setProgress: (uploadProgress) => set({ uploadProgress }),

  updateFileStatus: (id, status, error) => {
    set(state => ({
      pendingFiles: state.pendingFiles.map(f =>
        f.id === id ? { ...f, status, error } : f
      ),
    }));
  },
}));
