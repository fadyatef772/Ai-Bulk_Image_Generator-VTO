import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { IFileSystemService } from '../../domain/interfaces/index';
import { ILoggerService } from '../../domain/interfaces/index';
import { FileSystemError } from '../../application/errors/AppErrors';

const execAsync = promisify(exec);

export class FileSystemService implements IFileSystemService {
  constructor(private readonly logger: ILoggerService) {}

  async ensureDirectoryStructure(baseDir: string): Promise<void> {
    const dirs = [
      baseDir,
      path.join(baseDir, 'Generated'),
      path.join(baseDir, 'Failed'),
      path.join(baseDir, 'Logs'),
      path.join(baseDir, 'Temp'),
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        throw new FileSystemError(`Failed to create directory ${dir}: ${(error as Error).message}`);
      }
    }

    this.logger.info('Directory structure ensured', { baseDir });
  }

  async saveGeneratedImage(
    imageBuffer: Buffer,
    originalName: string,
    mimeType: string,
    outputDir: string,
    subfolder: string = 'Generated'
  ): Promise<string> {
    try {
      await this.ensureDirectoryStructure(outputDir);

      const ext = this.mimeTypeToExtension(mimeType);
      const baseName = path.basename(originalName, path.extname(originalName));
      const sanitizedBaseName = this.sanitizeFilename(baseName);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const uniqueId = uuidv4().slice(0, 8);
      const filename = `${sanitizedBaseName}_${timestamp}_${uniqueId}${ext}`;

      const outputPath = path.join(outputDir, subfolder, filename);

      // Stream-based write for large files
      await fs.writeFile(outputPath, imageBuffer);

      this.logger.info('Generated image saved', {
        filename,
        outputPath,
        sizeBytes: imageBuffer.length,
      });

      return outputPath;
    } catch (error) {
      if (error instanceof FileSystemError) throw error;
      throw new FileSystemError(`Failed to save image: ${(error as Error).message}`);
    }
  }

  async saveFailedRecord(jobId: string, errorMessage: string, outputDir: string): Promise<void> {
    try {
      const failedDir = path.join(outputDir, 'Failed');
      await fs.mkdir(failedDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const record = {
        jobId,
        errorMessage,
        timestamp,
      };

      const filename = `failed_${jobId}_${timestamp.replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(failedDir, filename);

      await fs.writeFile(filePath, JSON.stringify(record, null, 2));
    } catch (error) {
      this.logger.error('Failed to save error record', error);
    }
  }

  async readImageAsBuffer(filePath: string): Promise<Buffer> {
    try {
      if (!fsSync.existsSync(filePath)) {
        throw new FileSystemError(`File not found: ${filePath}`);
      }
      return await fs.readFile(filePath);
    } catch (error) {
      if (error instanceof FileSystemError) throw error;
      throw new FileSystemError(`Failed to read file: ${(error as Error).message}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug('File deleted', { filePath });
    } catch (error) {
      throw new FileSystemError(`Failed to delete file: ${(error as Error).message}`);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      throw new FileSystemError(`Failed to get file size: ${(error as Error).message}`);
    }
  }

  async listFiles(directory: string, extensions?: string[]): Promise<string[]> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(directory, entry.name);
          if (!extensions || extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
            files.push(filePath);
          }
        }
      }

      return files;
    } catch (error) {
      throw new FileSystemError(`Failed to list files: ${(error as Error).message}`);
    }
  }

  async openInExplorer(targetPath: string): Promise<void> {
    try {
      const platform = process.platform;
      if (platform === 'win32') {
        await execAsync(`explorer "${targetPath}"`);
      } else if (platform === 'darwin') {
        await execAsync(`open "${targetPath}"`);
      } else {
        await execAsync(`xdg-open "${targetPath}"`);
      }
    } catch (error) {
      this.logger.error('Failed to open in explorer', error);
    }
  }

  async copyTempFile(sourcePath: string, destDir: string): Promise<string> {
    const filename = path.basename(sourcePath);
    const destPath = path.join(destDir, filename);
    await fs.copyFile(sourcePath, destPath);
    return destPath;
  }

  async cleanTempFiles(tempDir: string, olderThanMs: number = 3600000): Promise<void> {
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (now - stats.mtime.getTime() > olderThanMs) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to clean temp files', { error });
    }
  }

  private mimeTypeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return map[mimeType.toLowerCase()] || '.png';
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\-_]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
  }
}
