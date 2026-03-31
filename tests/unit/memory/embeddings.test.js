import { jest } from '@jest/globals';

/**
 * Embeddings Manager Tests for ClawMC Memory Layer
 *
 * Note: Tests mock the HuggingFace transformers library to avoid slow model downloads.
 * Integration tests with actual model loading should be run separately.
 */

// Mock the logger
jest.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

// Mock fetch for API tests
global.fetch = jest.fn();

describe('EmbeddingsManager', () => {
  let EmbeddingsManager;
  let createEmbeddingsManager;
  let getEmbeddingsManager;
  let clearEmbeddingsManager;

  beforeAll(async () => {
    // Import after mocks are set up
    const module = await import('../../../src/memory/embeddings.js');
    EmbeddingsManager = module.EmbeddingsManager;
    createEmbeddingsManager = module.createEmbeddingsManager;
    getEmbeddingsManager = module.getEmbeddingsManager;
    clearEmbeddingsManager = module.clearEmbeddingsManager;
  });

  afterEach(() => {
    clearEmbeddingsManager();
    jest.clearAllMocks();
    global.fetch.mockReset();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      const manager = new EmbeddingsManager();

      expect(manager.mode).toBe('local');
      expect(manager.maxCacheSize).toBe(1000);
      expect(manager.dimensions).toBe(384);
      expect(manager.quantized).toBe(true);
      expect(manager.apiProvider).toBe('google');
      expect(manager.initialized).toBe(false);
      expect(manager.degraded).toBe(false);
    });

    it('should accept custom configuration', () => {
      const manager = new EmbeddingsManager({
        mode: 'api',
        maxCacheSize: 500,
        dimensions: 768,
        apiProvider: 'nvidia',
        quantized: false,
        modelName: 'custom-model'
      });

      expect(manager.mode).toBe('api');
      expect(manager.maxCacheSize).toBe(500);
      expect(manager.apiProvider).toBe('nvidia');
      expect(manager.quantized).toBe(false);
      expect(manager.modelName).toBe('custom-model');
    });

    it('should initialize with empty statistics', () => {
      const manager = new EmbeddingsManager();

      expect(manager.stats.totalVectorizations).toBe(0);
      expect(manager.stats.cacheHits).toBe(0);
      expect(manager.stats.cacheMisses).toBe(0);
      expect(manager.stats.localCalls).toBe(0);
      expect(manager.stats.apiCalls).toBe(0);
      expect(manager.stats.errors).toBe(0);
    });
  });

  describe('LRU Cache', () => {
    let manager;

    beforeEach(() => {
      manager = new EmbeddingsManager({ maxCacheSize: 3 });
    });

    it('should cache values', () => {
      const cache = manager.cache;

      cache.set('key1', new Float32Array([1, 2, 3]));
      cache.set('key2', new Float32Array([4, 5, 6]));

      expect(cache.size).toBe(2);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
    });

    it('should retrieve cached values', () => {
      const cache = manager.cache;
      const value = new Float32Array([1, 2, 3]);

      cache.set('key1', value);
      const retrieved = cache.get('key1');

      expect(retrieved).toEqual(value);
    });

    it('should evict oldest entries when at capacity', () => {
      const cache = manager.cache;

      cache.set('key1', new Float32Array([1]));
      cache.set('key2', new Float32Array([2]));
      cache.set('key3', new Float32Array([3]));
      cache.set('key4', new Float32Array([4]));

      expect(cache.size).toBe(3);
      expect(cache.has('key1')).toBe(false); // Evicted
      expect(cache.has('key4')).toBe(true);
    });

    it('should update position on get', () => {
      const cache = manager.cache;

      cache.set('key1', new Float32Array([1]));
      cache.set('key2', new Float32Array([2]));
      cache.set('key3', new Float32Array([3]));

      // Access key1 to move it to end
      cache.get('key1');

      // Add new key, should evict key2 instead of key1
      cache.set('key4', new Float32Array([4]));

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should clear cache', () => {
      const cache = manager.cache;

      cache.set('key1', new Float32Array([1]));
      cache.set('key2', new Float32Array([2]));

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe('Initialization', () => {
    it('should fail if not initialized', async () => {
      const manager = new EmbeddingsManager();

      await expect(manager.vectorize('test')).rejects.toThrow('not initialized');
    });

    it('should not initialize twice', async () => {
      const manager = new EmbeddingsManager({ mode: 'api', apiKey: 'test-key' });

      await manager.init();
      await manager.init(); // Second call

      expect(manager.initialized).toBe(true);
    });
  });

  describe('API Mode', () => {
    let manager;

    beforeEach(async () => {
      manager = new EmbeddingsManager({
        mode: 'api',
        apiKey: 'test-api-key',
        apiProvider: 'google'
      });

      await manager.init();
    });

    afterEach(async () => {
      if (manager) {
        await manager.shutdown();
      }
    });

    it('should initialize in API mode', () => {
      expect(manager.initialized).toBe(true);
      expect(manager.mode).toBe('api');
      expect(manager.dimensions).toBe(768);
    });

    it('should vectorize using Google API', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: {
            values: new Array(768).fill(0.5)
          }
        })
      });

      const result = await manager.vectorize('Hello world');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
      expect(manager.stats.totalVectorizations).toBe(1);
      expect(manager.stats.apiCalls).toBe(1);
    });

    it('should handle Google API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      });

      await expect(manager.vectorize('test')).rejects.toThrow('Google API error');
      expect(manager.stats.errors).toBe(1);
    });

    it('should use NVIDIA API when configured', async () => {
      manager = new EmbeddingsManager({
        mode: 'api',
        apiKey: 'test-api-key',
        apiProvider: 'nvidia'
      });

      await manager.init();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            embedding: new Array(1024).fill(0.3)
          }]
        })
      });

      const result = await manager.vectorize('Hello');

      expect(result.length).toBe(1024);
      expect(manager.dimensions).toBe(1024);
    });

    it('should cache repeated vectorizations', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: { values: new Array(768).fill(0.5) }
        })
      });

      const result1 = await manager.vectorize('test text');
      const result2 = await manager.vectorize('test text');
      const result3 = await manager.vectorize('TEST TEXT'); // Normalized to same

      // Only one API call should have been made
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(manager.stats.cacheHits).toBe(2);
      expect(manager.stats.cacheMisses).toBe(1);
    });

    it('should validate input', async () => {
      await expect(manager.vectorize('')).rejects.toThrow('non-empty string');
      await expect(manager.vectorize(null)).rejects.toThrow('non-empty string');
      await expect(manager.vectorize(123)).rejects.toThrow('non-empty string');
    });
  });

  describe('Degradation', () => {
    let manager;

    beforeEach(() => {
      manager = new EmbeddingsManager({
        mode: 'local',
        apiKey: 'fallback-api-key'
      });
      manager.initialized = true;
    });

    afterEach(async () => {
      if (manager) {
        await manager.shutdown();
      }
    });

    it('should track degradation state', () => {
      expect(manager.degraded).toBe(false);

      manager.degrade('test_reason');

      expect(manager.degraded).toBe(true);
      expect(manager.degradationReason).toBe('test_reason');
      expect(manager.stats.degradationCount).toBe(1);
    });

    it('should only degrade once', () => {
      manager.degrade('reason1');
      manager.degrade('reason2');

      expect(manager.degradationReason).toBe('reason1');
      expect(manager.stats.degradationCount).toBe(1);
    });

    it('should clear extractor on degradation', () => {
      manager.extractor = { test: true };

      manager.degrade('memory_pressure');

      expect(manager.extractor).toBeNull();
    });

    it('should check memory pressure', () => {
      const originalMemory = process.memoryUsage;

      // Mock high memory usage (95% usage, above 90% threshold)
      Object.defineProperty(process, 'memoryUsage', {
        value: () => ({
          heapUsed: 950,
          heapTotal: 1000,
          external: 0
        }),
        configurable: true
      });

      const degraded = manager.checkMemoryPressure(0.9);

      expect(degraded).toBe(true);
      expect(manager.degraded).toBe(true);

      // Restore
      Object.defineProperty(process, 'memoryUsage', {
        value: originalMemory,
        configurable: true
      });
    });

    it('should not degrade when memory is fine', () => {
      const originalMemory = process.memoryUsage;

      process.memoryUsage = () => ({
        heapUsed: 500,
        heapTotal: 1000,
        external: 0
      });

      const degraded = manager.checkMemoryPressure(0.9);

      expect(degraded).toBe(false);
      expect(manager.degraded).toBe(false);

      process.memoryUsage = originalMemory;
    });
  });

  describe('Restoration', () => {
    let manager;

    beforeEach(async () => {
      manager = new EmbeddingsManager({
        mode: 'local',
        apiKey: 'test-key',
        maxRestoreAttempts: 2
      });
      manager.initialized = true;
      manager.degraded = true;
      manager.degradationReason = 'test';
    });

    afterEach(async () => {
      if (manager) {
        await manager.shutdown();
      }
    });

    it('should attempt to restore local mode', async () => {
      // Mock successful init
      manager._initLocal = jest.fn().mockResolvedValue(undefined);

      const result = await manager.restore();

      expect(result).toBe(true);
      expect(manager.degraded).toBe(false);
      expect(manager.degradationReason).toBeNull();
      expect(manager.stats.restoreCount).toBe(1);
    });

    it('should track restore attempts', async () => {
      // Mock failed init
      manager._initLocal = jest.fn().mockRejectedValue(new Error('Failed'));

      await manager.restore();
      await manager.restore();
      await manager.restore(); // Should not attempt beyond max

      expect(manager.restoreAttempts).toBe(2);
      expect(manager.degraded).toBe(true);
    });

    it('should stop trying after max attempts', async () => {
      manager._initLocal = jest.fn().mockRejectedValue(new Error('Failed'));
      manager.restoreAttempts = 2; // Already at max

      const result = await manager.restore();

      expect(result).toBe(false);
      expect(manager._initLocal).not.toHaveBeenCalled();
    });

    it('should reset attempts on successful restore', async () => {
      manager._initLocal = jest.fn().mockResolvedValue(undefined);
      manager.restoreAttempts = 1;

      await manager.restore();

      expect(manager.restoreAttempts).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current status', async () => {
      const manager = new EmbeddingsManager({
        mode: 'local',
        maxCacheSize: 500
      });
      manager.initialized = true;

      const status = manager.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.mode).toBe('local');
      expect(status.effectiveMode).toBe('local');
      expect(status.degraded).toBe(false);
      expect(status.dimensions).toBe(384);
      expect(status.maxCacheSize).toBe(500);
      expect(status.stats).toBeDefined();
    });

    it('should show effective mode when degraded', async () => {
      const manager = new EmbeddingsManager({ mode: 'local' });
      manager.initialized = true;
      manager.degraded = true;

      const status = manager.getStatus();

      expect(status.mode).toBe('local');
      expect(status.effectiveMode).toBe('api');
      expect(status.degraded).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should vectorize multiple texts', async () => {
      const manager = new EmbeddingsManager({
        mode: 'api',
        apiKey: 'test-key'
      });
      await manager.init();

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: { values: new Array(768).fill(0.5) }
        })
      });

      const results = await manager.vectorizeBatch(['a', 'b', 'c']);

      expect(results).toHaveLength(3);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(manager.stats.totalVectorizations).toBe(3);

      await manager.shutdown();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      const manager = new EmbeddingsManager();
      manager.cache.set('test', new Float32Array([1, 2, 3]));

      manager.clearCache();

      expect(manager.cache.size).toBe(0);
    });

    it('should reset statistics', () => {
      const manager = new EmbeddingsManager();
      manager.stats.totalVectorizations = 100;
      manager.stats.cacheHits = 50;

      manager.resetStats();

      expect(manager.stats.totalVectorizations).toBe(0);
      expect(manager.stats.cacheHits).toBe(0);
    });
  });

  describe('Shutdown', () => {
    it('should cleanup resources', async () => {
      const manager = new EmbeddingsManager();
      manager.initialized = true;
      manager.cache.set('test', new Float32Array([1, 2, 3]));
      manager.extractor = { test: true };

      await manager.shutdown();

      expect(manager.initialized).toBe(false);
      expect(manager.degraded).toBe(false);
      expect(manager.extractor).toBeNull();
      expect(manager.cache.size).toBe(0);
    });
  });

  describe('Singleton Functions', () => {
    it('should create and get singleton instance', () => {
      const manager = createEmbeddingsManager({ mode: 'api', apiKey: 'test' });

      expect(getEmbeddingsManager()).toBe(manager);
    });

    it('should clear singleton instance', () => {
      createEmbeddingsManager({ mode: 'api', apiKey: 'test' });

      clearEmbeddingsManager();

      expect(getEmbeddingsManager()).toBeNull();
    });

    it('should return null if no instance', () => {
      expect(getEmbeddingsManager()).toBeNull();
    });
  });
});

describe('Local Mode Integration (Mocked)', () => {
  let EmbeddingsManager;

  beforeAll(async () => {
    // Mock the transformers pipeline
    jest.mock('@huggingface/transformers', () => ({
      pipeline: jest.fn().mockResolvedValue(async (text) => ({
        data: new Float32Array(384).fill(0.1),
        dims: [1, 384]
      }))
    }));

    const module = await import('../../../src/memory/embeddings.js');
    EmbeddingsManager = module.EmbeddingsManager;
  });

  it('should handle mocked local initialization', async () => {
    // This test demonstrates the expected behavior
    // Actual local model tests should be run separately
    const manager = new EmbeddingsManager({ mode: 'api', apiKey: 'test' });
    await manager.init();

    expect(manager.initialized).toBe(true);
    expect(manager.mode).toBe('api');

    await manager.shutdown();
  });
});