import createApp from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { startProcessingLoop } from './ocr/processor';

const startServer = (): void => {
  const app = createApp();
  const port = config.PORT;

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`FiLot Backend Server started`);
    logger.info(`Environment: ${config.NODE_ENV}`);
    logger.info(`Port: ${port}`);
    logger.info(`Health check: http://0.0.0.0:${port}/health`);
    
    startProcessingLoop();
  });

  const gracefulShutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Rejection', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', error);
    process.exit(1);
  });
};

startServer();
