import * as jose from 'jose';
import { config } from '../config/env';
import { JWTPayload } from '../types/User';
import { logger } from '../utils/logger';

let jwksCache: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

const getJWKS = (): ReturnType<typeof jose.createRemoteJWKSet> => {
  if (!jwksCache) {
    const jwksUrl = `https://api.stack-auth.com/api/v1/projects/${config.STACK_PROJECT_ID}/.well-known/jwks.json`;
    logger.info(`Initializing JWKS from: ${jwksUrl}`);
    jwksCache = jose.createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksCache;
};

export const verifyToken = async (token: string): Promise<JWTPayload> => {
  try {
    const jwks = getJWKS();
    const { payload } = await jose.jwtVerify(token, jwks, {
      algorithms: ['RS256'],
    });

    logger.info(`Token verified successfully for user: ${payload.sub}`);
    return payload as JWTPayload;
  } catch (error) {
    logger.error('Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
};

export const refreshAccessToken = async (refreshToken: string): Promise<any> => {
  try {
    const response = await fetch('https://api.stack-auth.com/api/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-stack-project-id': config.STACK_PROJECT_ID,
        'x-stack-secret-server-key': config.STACK_SECRET_SERVER_KEY,
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('Token refresh failed:', errorData);
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    logger.info('Token refreshed successfully');
    return data;
  } catch (error) {
    logger.error('Token refresh error:', error);
    throw new Error('Failed to refresh token');
  }
};
