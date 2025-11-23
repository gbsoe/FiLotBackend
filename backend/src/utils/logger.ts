type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const getTimestamp = (): string => {
  return new Date().toISOString();
};

const log = (level: LogLevel, message: string, meta?: unknown): void => {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  switch (level) {
    case 'error':
      console.error(logMessage, meta || '');
      break;
    case 'warn':
      console.warn(logMessage, meta || '');
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.log(logMessage, meta || '');
      }
      break;
    case 'info':
    default:
      console.log(logMessage, meta || '');
      break;
  }
};

export const logger = {
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
};
