describe('Queue Abstraction', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.OCR_ENGINE;
    delete process.env.QUEUE_ENGINE;
    delete process.env.OCR_AUTOFALLBACK;
    delete process.env.TEMPORAL_ENDPOINT;
    delete process.env.TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_NAMESPACE;
    delete process.env.TEMPORAL_DISABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getConfiguredQueueEngine', () => {
    it('should return redis by default', async () => {
      const { getConfiguredQueueEngine } = await import('../src/queue');
      const engine = getConfiguredQueueEngine();
      expect(engine).toBe('redis');
    });

    it('should return redis when OCR_ENGINE=redis', async () => {
      process.env.OCR_ENGINE = 'redis';
      const { getConfiguredQueueEngine } = await import('../src/queue');
      const engine = getConfiguredQueueEngine();
      expect(engine).toBe('redis');
    });

    it('should return redis when QUEUE_ENGINE=redis (backward compatibility)', async () => {
      process.env.QUEUE_ENGINE = 'redis';
      const { getConfiguredQueueEngine } = await import('../src/queue');
      const engine = getConfiguredQueueEngine();
      expect(engine).toBe('redis');
    });
  });

  describe('isAutoFallbackEnabled', () => {
    it('should return true by default', async () => {
      const { isAutoFallbackEnabled } = await import('../src/queue');
      expect(isAutoFallbackEnabled()).toBe(true);
    });

    it('should return false when OCR_AUTOFALLBACK=false', async () => {
      process.env.OCR_AUTOFALLBACK = 'false';
      const { isAutoFallbackEnabled } = await import('../src/queue');
      expect(isAutoFallbackEnabled()).toBe(false);
    });
  });

  describe('isTemporalConfigured', () => {
    it('should return false when nothing is configured', async () => {
      const { isTemporalConfigured } = await import('../src/queue');
      expect(isTemporalConfigured()).toBe(false);
    });

    it('should return true when TEMPORAL_ENDPOINT and TEMPORAL_NAMESPACE are set', async () => {
      process.env.TEMPORAL_ENDPOINT = 'localhost:7233';
      process.env.TEMPORAL_NAMESPACE = 'default';
      const { isTemporalConfigured } = await import('../src/queue');
      expect(isTemporalConfigured()).toBe(true);
    });

    it('should return true when TEMPORAL_ADDRESS and TEMPORAL_NAMESPACE are set', async () => {
      process.env.TEMPORAL_ADDRESS = 'localhost:7233';
      process.env.TEMPORAL_NAMESPACE = 'default';
      const { isTemporalConfigured } = await import('../src/queue');
      expect(isTemporalConfigured()).toBe(true);
    });

    it('should return false when TEMPORAL_DISABLED=true', async () => {
      process.env.TEMPORAL_ENDPOINT = 'localhost:7233';
      process.env.TEMPORAL_NAMESPACE = 'default';
      process.env.TEMPORAL_DISABLED = 'true';
      const { isTemporalConfigured } = await import('../src/queue');
      expect(isTemporalConfigured()).toBe(false);
    });
  });
});

describe('Temporal Queue (Stub Mode)', () => {
  it('should create temporal queue in stub mode without throwing', async () => {
    const { createTemporalQueue } = await import('../src/queue/temporalQueue');
    
    const queue = createTemporalQueue();
    expect(queue).toBeDefined();
    expect(typeof queue.enqueueDocument).toBe('function');
    expect(typeof queue.start).toBe('function');
    expect(typeof queue.stop).toBe('function');
  });

  it('should return stub status from getStatus', async () => {
    const { createTemporalQueue } = await import('../src/queue/temporalQueue');
    
    const queue = createTemporalQueue();
    const status = await queue.getStatus();
    
    expect(status).toEqual({
      isRunning: false,
      queueLength: 0,
      processingCount: 0,
    });
  });
});
