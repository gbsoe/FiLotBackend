import { Router, Request, Response } from 'express';
import { verifyToken, refreshAccessToken } from '../auth/stackAuth';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { TokenRefreshRequest } from '../types/User';

const router = Router();

router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      res.status(400).json({ error: 'Access token is required' });
      return;
    }

    const payload = await verifyToken(accessToken);

    const email = payload.email;
    const providerId = payload.sub;

    if (!email || email.trim() === '') {
      logger.error('JWT payload missing email claim');
      res.status(400).json({ 
        error: 'Invalid token: email claim is required but missing from JWT payload' 
      });
      return;
    }

    if (!providerId) {
      logger.error('JWT payload missing sub (provider ID) claim');
      res.status(400).json({ 
        error: 'Invalid token: sub claim is required but missing from JWT payload' 
      });
      return;
    }

    let user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      logger.info(`Creating new user for email: ${email}`);
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          providerId,
          providerType: 'stack-auth',
          displayName: payload.displayName || email.split('@')[0],
        })
        .returning();
      user = newUser;
    } else if (!user.providerId) {
      logger.info(`Updating existing user with provider ID: ${email}`);
      const [updatedUser] = await db
        .update(users)
        .set({
          providerId,
          providerType: 'stack-auth',
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updatedUser;
    }

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        mobile: user.mobile,
        ktpUrl: user.ktpUrl,
        npwpUrl: user.npwpUrl,
      },
    });
  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body as TokenRefreshRequest;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokenData = await refreshAccessToken(refreshToken);

    res.status(200).json(tokenData);
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

export default router;
