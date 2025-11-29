import { logger } from '../utils/logger';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'STACK_PROJECT_ID',
  'STACK_SECRET_SERVER_KEY',
  'CF_R2_ENDPOINT',
  'CF_R2_ACCESS_KEY_ID',
  'CF_R2_SECRET_ACCESS_KEY',
  'CF_R2_BUCKET_NAME',
  'SERVICE_INTERNAL_KEY',
] as const;

const PRODUCTION_REQUIRED_SECRETS = [
  'JWT_SECRET',
  'SESSION_SECRET',
  'BULI2_API_KEY',
] as const;

const INSECURE_DEFAULTS: Record<string, string[]> = {
  JWT_SECRET: ['dev-secret-change-in-production', 'your-secret-key-here', 'secret'],
  SESSION_SECRET: ['dev-session-secret', 'secret'],
};

export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const secret of REQUIRED_SECRETS) {
    const value = process.env[secret];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${secret}`);
    }
  }

  if (isProduction) {
    for (const secret of PRODUCTION_REQUIRED_SECRETS) {
      const value = process.env[secret];
      if (!value || value.trim() === '') {
        errors.push(`Missing production-required environment variable: ${secret}`);
      }
    }
  }

  for (const [key, insecureValues] of Object.entries(INSECURE_DEFAULTS)) {
    const value = process.env[key];
    if (value && insecureValues.includes(value)) {
      if (isProduction) {
        errors.push(`Insecure default value detected for ${key} in production`);
      } else {
        warnings.push(`Insecure default value detected for ${key} (acceptable in development)`);
      }
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
      errors.push(`Invalid DATABASE_URL format: must start with postgresql:// or postgres://`);
    }
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      errors.push(`Invalid REDIS_URL format: must start with redis:// or rediss://`);
    }
  }

  const r2Endpoint = process.env.CF_R2_ENDPOINT;
  if (r2Endpoint && !r2Endpoint.startsWith('https://')) {
    warnings.push(`CF_R2_ENDPOINT should use HTTPS for production`);
  }

  if (process.env.BULI2_API_URL && !process.env.BULI2_API_KEY) {
    warnings.push(`BULI2_API_URL is set but BULI2_API_KEY is missing - BULI2 integration may fail`);
  }

  if (process.env.TEMPORAL_DISABLED !== 'true') {
    if (!process.env.TEMPORAL_ENDPOINT && !process.env.TEMPORAL_ADDRESS) {
      warnings.push(`Temporal not disabled but TEMPORAL_ENDPOINT is not set`);
    }
    if (!process.env.TEMPORAL_NAMESPACE) {
      warnings.push(`Temporal not disabled but TEMPORAL_NAMESPACE is not set`);
    }
  }

  if (process.env.OCR_GPU_ENABLED === 'true') {
    if (!process.env.REDIS_URL) {
      errors.push(`GPU OCR enabled but REDIS_URL is not set`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateAndLogEnvironment(): boolean {
  const result = validateEnvironment();

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      logger.warn(`Environment Warning: ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      logger.error(`Environment Error: ${error}`);
    }
    
    if (process.env.NODE_ENV === 'production') {
      logger.error('Production environment validation failed. Server will not start.');
      return false;
    } else {
      logger.warn('Development environment has configuration issues. Some features may not work.');
    }
  }

  if (result.valid) {
    logger.info('Environment validation passed');
  }

  return true;
}

export function getSecretStatus(): Record<string, boolean> {
  const allSecrets = [...REQUIRED_SECRETS, ...PRODUCTION_REQUIRED_SECRETS];
  const status: Record<string, boolean> = {};

  for (const secret of allSecrets) {
    const value = process.env[secret];
    status[secret] = !!(value && value.trim() !== '');
  }

  return status;
}
