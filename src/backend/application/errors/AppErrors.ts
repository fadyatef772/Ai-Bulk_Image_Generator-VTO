export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class GeminiError extends AppError {
  constructor(message: string) {
    super(message, 'GEMINI_ERROR', 502);
  }
}

export class QueueError extends AppError {
  constructor(message: string) {
    super(message, 'QUEUE_ERROR', 500);
  }
}

export class FileSystemError extends AppError {
  constructor(message: string) {
    super(message, 'FILESYSTEM_ERROR', 500);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', 500);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterMs?: number) {
    super(
      `Rate limit exceeded${retryAfterMs ? `. Retry after ${retryAfterMs}ms` : ''}`,
      'RATE_LIMIT',
      429
    );
  }
}
