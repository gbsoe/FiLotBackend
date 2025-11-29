import { Request, Response } from 'express';
import { getActiveQueueEngine, isTemporalConfigured } from '../queue';
import { getSystemMetrics, recordQueueMetrics, recordBuli2RetryMetrics } from '../utils/metrics';
import { getCircuitBreakerStats } from '../services/forwardToBuli2';
import { getGPUWorkerStatus } from '../workers/ocr-gpu-worker';

export const getHealth = (_req: Request, res: Response): void => {
  const uptime = process.uptime();
  const timestamp = new Date().toISOString();
  const ocrEngine = getActiveQueueEngine();
  const temporalConfigured = isTemporalConfigured();

  res.status(200).json({
    ok: true,
    status: 'ok',
    uptime: Math.floor(uptime),
    timestamp,
    environment: process.env.NODE_ENV || 'development',
    ocrEngine,
    temporalConfigured,
  });
};

export const getMetrics = async (_req: Request, res: Response): Promise<void> => {
  try {
    await recordQueueMetrics();
    await recordBuli2RetryMetrics();

    const systemMetrics = await getSystemMetrics();
    const gpuWorkerStatus = await getGPUWorkerStatus();
    const circuitBreakerStats = getCircuitBreakerStats();

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      queues: {
        gpuQueueLength: systemMetrics.gpuQueueLength,
        cpuQueueLength: systemMetrics.cpuQueueLength,
        gpuActiveJobs: systemMetrics.gpuActiveJobs,
        buli2RetryQueueLength: systemMetrics.buli2RetryQueueLength,
      },
      gpuWorker: {
        isRunning: gpuWorkerStatus.isRunning,
        isGPUAvailable: gpuWorkerStatus.isGPUAvailable,
        isGPUEnabled: gpuWorkerStatus.isGPUEnabled,
        activeJobsCount: gpuWorkerStatus.activeJobsCount,
        autoFallbackEnabled: gpuWorkerStatus.autoFallbackEnabled,
      },
      circuitBreaker: {
        buli2: circuitBreakerStats,
      },
      metricsBuffer: {
        size: systemMetrics.metricsBufferSize,
      },
    };

    res.status(200).json({
      ok: true,
      metrics,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to collect metrics',
    });
  }
};
