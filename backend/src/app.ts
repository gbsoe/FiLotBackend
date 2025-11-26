import express, { Application } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import documentsRoutes from './routes/documentsRoutes';
import documentProcessRoutes from './routes/documentProcessRoutes';
import verificationRoutes from './routes/verificationRoutes';
import internalRoutes from './routes/internalRoutes';
import downloadRoutes from './routes/downloadRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { globalRateLimiter } from './middlewares/rateLimiter';
import { corsConfig, getConfiguredOrigins } from './middlewares/corsConfig';
import { logger } from './utils/logger';

const createApp = (): Application => {
  const app = express();

  app.use(helmet());

  app.use(corsConfig);

  app.set('trust proxy', 1);

  app.use(globalRateLimiter);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  app.use('/', healthRoutes);
  app.use('/auth', authRoutes);

  app.use('/profile', profileRoutes);
  app.use('/documents', documentsRoutes);
  app.use('/documents', documentProcessRoutes);
  app.use('/documents/secure-download', downloadRoutes);
  app.use('/verification', verificationRoutes);
  app.use('/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app initialized with security middleware', {
    corsOrigins: getConfiguredOrigins(),
    rateLimitingEnabled: true,
    environment: process.env.NODE_ENV || 'production',
  });

  return app;
};

export default createApp;
