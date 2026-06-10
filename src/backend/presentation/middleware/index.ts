import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError, ValidationError } from '../../application/errors/AppErrors';
import { getLogger } from '../../infrastructure/logger/WinstonLogger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const logger = getLogger();

  if (err instanceof AppError) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  // Unexpected error
  logger.error('Unexpected error', err, {
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const logger = getLogger();
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    contentType: req.headers['content-type'],
  });
  next();
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.');
        if (!fields[key]) fields[key] = [];
        fields[key].push(issue.message);
      }
      next(new ValidationError('Validation failed', fields));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError('Invalid query parameters'));
      return;
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
