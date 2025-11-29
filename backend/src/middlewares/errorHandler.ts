import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

const PRODUCTION_SAFE_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function sanitizeErrorMessage(
  message: string,
  statusCode: number,
  isOperational: boolean = false
): string {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return message;
  }

  if (isOperational && statusCode < 500) {
    return message;
  }

  return PRODUCTION_SAFE_MESSAGES[statusCode] || 'An error occurred';
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;
  const rawMessage = err.message || 'Internal Server Error';
  const sanitizedMessage = sanitizeErrorMessage(rawMessage, statusCode, isOperational);

  logger.error(`Error: ${rawMessage}`, {
    correlationId,
    statusCode,
    path: req.path,
    method: req.method,
    isOperational,
    stack: err.stack,
  });

  const errorResponse: Record<string, unknown> = {
    success: false,
    error: {
      message: sanitizedMessage,
      correlationId,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.error = {
      ...(errorResponse.error as object),
      stack: err.stack,
      rawMessage: rawMessage !== sanitizedMessage ? rawMessage : undefined,
    };
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();

  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      correlationId,
    },
  });
};
