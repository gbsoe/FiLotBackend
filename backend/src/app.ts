import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import documentsRoutes from './routes/documentsRoutes';
import documentProcessRoutes from './routes/documentProcessRoutes';
import verificationRoutes from './routes/verificationRoutes';
import internalRoutes from './routes/internalRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { globalRateLimiter } from './middlewares/rateLimiter';
import { logger } from './utils/logger';

const FILOT_FRONTEND_ORIGIN = process.env.FILOT_FRONTEND_ORIGIN || '';

const ALLOWED_ORIGINS = [
  FILOT_FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://localhost:19000',
].filter(Boolean);

const createApp = (): Application => {
  const app = express();

  app.use(helmet());

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      logger.warn('CORS request blocked', { origin, allowedOrigins: ALLOWED_ORIGINS });
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-service-key'],
  }));

  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  app.use('/', healthRoutes);
  app.use('/auth', authRoutes);

  app.use(globalRateLimiter);
  app.use('/profile', profileRoutes);
  app.use('/documents', documentsRoutes);
  app.use('/documents', documentProcessRoutes);
  app.use('/verification', verificationRoutes);
  app.use('/internal', internalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app initialized with security middleware', {
    corsOrigins: ALLOWED_ORIGINS,
    rateLimitingEnabled: true,
  });

  return app;
};

export default createApp;
