import { Router, Request, Response } from 'express';
import { authRequired } from '../auth/middleware';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', authRequired, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user.id),
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      mobile: user.mobile,
      ktpUrl: user.ktpUrl,
      npwpUrl: user.npwpUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/', authRequired, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { displayName, mobile, ktpUrl, npwpUrl } = req.body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }
    if (mobile !== undefined) {
      updateData.mobile = mobile;
    }
    if (ktpUrl !== undefined) {
      updateData.ktpUrl = ktpUrl;
    }
    if (npwpUrl !== undefined) {
      updateData.npwpUrl = npwpUrl;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.user.id))
      .returning();

    if (!updatedUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info(`Profile updated for user: ${req.user.id}`);

    res.status(200).json({
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      mobile: updatedUser.mobile,
      ktpUrl: updatedUser.ktpUrl,
      npwpUrl: updatedUser.npwpUrl,
      role: updatedUser.role,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
