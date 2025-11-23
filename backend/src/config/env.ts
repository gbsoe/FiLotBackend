import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  DATABASE_URL: string;
  UPLOAD_DIR: string;
}

const getEnvVariable = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;
  if (!value) {
    console.warn(`Warning: Environment variable ${key} is not set`);
    return '';
  }
  return value;
};

export const config: EnvConfig = {
  PORT: parseInt(getEnvVariable('PORT', '8080'), 10),
  NODE_ENV: getEnvVariable('NODE_ENV', 'development'),
  JWT_SECRET: getEnvVariable('JWT_SECRET', 'dev-secret-change-in-production'),
  DATABASE_URL: getEnvVariable('DATABASE_URL', ''),
  UPLOAD_DIR: getEnvVariable('UPLOAD_DIR', path.join(__dirname, '../../uploads')),
};
