import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV !== 'production';
const BACKEND_PORT = 3001;
const FRONTEND_URL = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../../renderer/index.html')}`;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#080d1a',
    titleBarStyle: 'hiddenInset',
    frame: process.platform !== 'win32',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow local file access for output images
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.loadURL(FRONTEND_URL);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend(): void {
  if (isDev) {
    // In dev, backend is started separately via concurrently
    return;
  }

  const backendPath = path.join(__dirname, '../../backend/server.js');

  if (!fs.existsSync(backendPath)) {
    console.error('Backend not found at:', backendPath);
    return;
  }

  backendProcess = spawn('node', [backendPath], {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

// IPC Handlers
function registerIpcHandlers(): void {
  // Open folder dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Output Folder',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false, path: null };
  });

  // Open file in system
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Show file in folder
  ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  // Get app version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  // Get user data path
  ipcMain.handle('app:getUserDataPath', () => {
    return app.getPath('userData');
  });

  // Minimize/maximize/close window
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  // Read local file as base64 (for previewing output images)
  ipcMain.handle('fs:readFileAsBase64', async (_event, filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return { success: true, data: `data:${mimeType};base64,${buffer.toString('base64')}` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Check if file exists
  ipcMain.handle('fs:fileExists', (_event, filePath: string) => {
    return fs.existsSync(filePath);
  });
}

// App lifecycle
app.whenReady().then(() => {
  startBackend();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

// Security: prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
