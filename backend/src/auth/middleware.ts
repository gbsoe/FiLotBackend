import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './stackAuth';
import { getBearerToken, JWTError } from './jwt';
import { logger } from '../utils/logger';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export const authRequired = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getBearerToken(req);
    const payload = await verifyToken(token);

    const email = payload.email || '';
    const providerId = payload.sub;

    let user = null;

    if (providerId) {
      user = await db.query.users.findFirst({
        where: eq(users.providerId, providerId),
      });
    }

    if (!user && email) {
      user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
    }

    if (!user) {
      logger.warn(`User not found in database. Provider ID: ${providerId || 'none'}, Email: ${email || 'none'}`);
      res.status(401).json({ 
        error: 'User not found. Please verify your account first by calling POST /auth/verify with your access token.' 
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      mobile: user.mobile,
      ktpUrl: user.ktpUrl,
      npwpUrl: user.npwpUrl,
      role: user.role || 'user',
    };

    logger.info(`User authenticated: ${user.id} (${user.email})`);
    next();
  } catch (error) {
    if (error instanceof JWTError) {
      logger.warn(`Authentication failed: ${error.message}`);
      res.status(401).json({ error: error.message });
      return;
    }

    logger.error('Authentication error:', error);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};
