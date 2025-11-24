import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/authRoutes';
import profileRoutes from './routes/profileRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { logger } from './utils/logger';

const createApp = (): Application => {
  const app = express();

  app.use(helmet());
  app.use(cors());
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app initialized with middleware');

  return app;
};

export default createApp;
