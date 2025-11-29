type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_FIELD_PATTERNS: Record<string, (value: string) => string> = {
  npwp: (value: string) => {
    if (typeof value !== 'string' || value.length < 6) return '***';
    return value.slice(0, -3).replace(/\d/g, '*').slice(0, -3) + value.slice(-3).replace(/\d/g, '*');
  },
  nik: (value: string) => {
    if (typeof value !== 'string' || value.length < 8) return '***';
    const first4 = value.slice(0, 4);
    const last4 = value.slice(-4);
    const middle = '*'.repeat(Math.max(0, value.length - 8));
    return first4 + middle + last4;
  },
  email: (value: string) => {
    if (typeof value !== 'string' || !value.includes('@')) return '***';
    const [localPart, domain] = value.split('@');
    if (localPart.length <= 2) return '**@' + domain;
    const visibleChars = Math.min(3, Math.floor(localPart.length / 2));
    return localPart.slice(0, visibleChars) + '***@' + domain;
  },
  mobile: (value: string) => {
    if (typeof value !== 'string' || value.length < 6) return '***';
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 6) return '***';
    return cleaned.slice(0, 4) + '*'.repeat(Math.max(0, cleaned.length - 8)) + cleaned.slice(-4);
  },
  phone: (value: string) => {
    if (typeof value !== 'string' || value.length < 6) return '***';
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length < 6) return '***';
    return cleaned.slice(0, 4) + '*'.repeat(Math.max(0, cleaned.length - 8)) + cleaned.slice(-4);
  },
  password: () => '***REDACTED***',
  token: () => '***TOKEN***',
  secret: () => '***SECRET***',
  apiKey: () => '***API_KEY***',
  api_key: () => '***API_KEY***',
  authorization: () => '***AUTH***',
};

const SENSITIVE_KEYS = Object.keys(SENSITIVE_FIELD_PATTERNS);

function shouldMaskField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some(
    (sensitiveKey) =>
      lowerKey === sensitiveKey.toLowerCase() ||
      lowerKey.includes(sensitiveKey.toLowerCase())
  );
}

function getMaskFunction(key: string): ((value: string) => string) | undefined {
  const lowerKey = key.toLowerCase();
  for (const [sensitiveKey, maskFn] of Object.entries(SENSITIVE_FIELD_PATTERNS)) {
    if (lowerKey === sensitiveKey.toLowerCase() || lowerKey.includes(sensitiveKey.toLowerCase())) {
      return maskFn;
    }
  }
  return undefined;
}

export function maskSensitiveFields(obj: unknown, depth: number = 0): unknown {
  if (depth > 10) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveFields(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (shouldMaskField(key) && typeof value === 'string') {
        const maskFn = getMaskFunction(key);
        masked[key] = maskFn ? maskFn(value) : '***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = maskSensitiveFields(value, depth + 1);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  return obj;
}

const getTimestamp = (): string => {
  return new Date().toISOString();
};

const log = (level: LogLevel, message: string, meta?: unknown): void => {
  const timestamp = getTimestamp();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  const maskedMeta = meta !== undefined ? maskSensitiveFields(meta) : undefined;

  switch (level) {
    case 'error':
      console.error(logMessage, maskedMeta || '');
      break;
    case 'warn':
      console.warn(logMessage, maskedMeta || '');
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.log(logMessage, maskedMeta || '');
      }
      break;
    case 'info':
    default:
      console.log(logMessage, maskedMeta || '');
      break;
  }
};

export const logger = {
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
};
