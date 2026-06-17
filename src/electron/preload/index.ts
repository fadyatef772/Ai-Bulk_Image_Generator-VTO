import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Dialogs
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // Shell
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  showInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),

  // App
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getUserDataPath: () => ipcRenderer.invoke('app:getUserDataPath'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // File system
  readFileAsBase64: (filePath: string) => ipcRenderer.invoke('fs:readFileAsBase64', filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke('fs:fileExists', filePath),

  // Platform
  platform: process.platform,

  // Detect if running in Electron
  isElectron: true,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
