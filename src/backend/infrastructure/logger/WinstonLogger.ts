import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { ILoggerService } from '../../domain/interfaces/index';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

export class WinstonLogger implements ILoggerService {
  private logger: winston.Logger;

  constructor(logDir: string = './logs', logLevel: string = 'info') {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    });

    this.logger = winston.createLogger({
      level: logLevel,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        errors({ stack: true }),
        json()
      ),
      transports: [
        // Console output (pretty)
        new winston.transports.Console({
          format: combine(
            colorize(),
            timestamp({ format: 'HH:mm:ss' }),
            consoleFormat
          ),
        }),
        // File: all logs
        new winston.transports.File({
          filename: path.join(logDir, 'app.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
        // File: errors only
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 5,
        }),
        // File: processing events
        new winston.transports.File({
          filename: path.join(logDir, 'processing.log'),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
        }),
      ],
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(logDir, 'exceptions.log'),
        }),
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(logDir, 'rejections.log'),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.logger.error(message, { ...meta, error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, { ...meta, error });
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  updateLogDir(newLogDir: string): void {
    if (!fs.existsSync(newLogDir)) {
      fs.mkdirSync(newLogDir, { recursive: true });
    }
    // Add new file transport
    this.logger.add(new winston.transports.File({
      filename: path.join(newLogDir, 'app.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }));
  }
}

// Singleton
let _logger: WinstonLogger | null = null;

export function getLogger(logDir?: string, logLevel?: string): WinstonLogger {
  if (!_logger) {
    _logger = new WinstonLogger(logDir, logLevel);
  }
  return _logger;
}
