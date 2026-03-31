/**
 * Embeddings Manager for ClawMC
 *
 * Supports two modes:
 * - local: Uses @huggingface/transformers with Xenova/multilingual-e5-small (384 dimensions)
 * - api: Uses external APIs (Google Gemini or NVIDIA NV-Embed)
 *
 * Features:
 * - LRU cache for repeated embeddings
 * - Graceful degradation on memory pressure
 * - Automatic mode switching
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Embeddings');

/**
 * LRU Cache implementation for embeddings
 */
class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * Embeddings Manager class
 */
export class EmbeddingsManager {
  constructor(config = {}) {
    this.mode = config.mode || 'local';
    this.maxCacheSize = config.maxCacheSize || 1000;
    this.dimensions = config.dimensions || 384;

    // API configuration
    this.apiProvider = config.apiProvider || 'google'; // 'google' or 'nvidia'
    this.apiKey = config.apiKey || process.env.EMBEDDING_API_KEY || '';

    // Model configuration for local mode
    this.modelName = config.modelName || 'Xenova/multilingual-e5-small';
    this.quantized = config.quantized !== false; // Default to true

    // State
    this.initialized = false;
    this.extractor = null;
    this.cache = new LRUCache(this.maxCacheSize);

    // Degradation state
    this.degraded = false;
    this.degradationReason = null;
    this.restoreAttempts = 0;
    this.maxRestoreAttempts = config.maxRestoreAttempts || 3;

    // Statistics
    this.stats = {
      totalVectorizations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      localCalls: 0,
      apiCalls: 0,
      errors: 0,
      degradationCount: 0,
      restoreCount: 0
    };
  }

  /**
   * Initialize the embeddings manager
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      logger.warn('EmbeddingsManager already initialized');
      return;
    }

    try {
      if (this.mode === 'local') {
        await this._initLocal();
      } else {
        await this._initApi();
      }

      this.initialized = true;
      logger.info(`EmbeddingsManager initialized in ${this.mode} mode`, {
        dimensions: this.dimensions,
        cacheSize: this.maxCacheSize
      });
    } catch (error) {
      logger.error('Failed to initialize EmbeddingsManager:', error);
      throw error;
    }
  }

  /**
   * Initialize local model using HuggingFace transformers
   * @private
   */
  async _initLocal() {
    try {
      const { pipeline } = await import('@huggingface/transformers');

      logger.info(`Loading embedding model: ${this.modelName}`, {
        quantized: this.quantized
      });

      this.extractor = await pipeline('feature-extraction', this.modelName, {
        quantized: this.quantized,
        progress_callback: (progress) => {
          if (progress.status === 'downloading') {
            logger.debug(`Model download progress: ${Math.round(progress.progress || 0)}%`);
          }
        }
      });

      // Test the model to get actual dimensions
      const testOutput = await this.extractor('test', { pooling: 'mean', normalize: true });
      this.dimensions = testOutput.dims[testOutput.dims.length - 1];

      logger.info(`Local embedding model loaded (${this.dimensions} dimensions)`);
    } catch (error) {
      logger.error('Failed to load local embedding model:', error);
      throw new Error(`Failed to load local embedding model: ${error.message}`);
    }
  }

  /**
   * Initialize API-based embedding
   * @private
   */
  async _initApi() {
    if (!this.apiKey) {
      throw new Error('API key required for api mode. Set EMBEDDING_API_KEY env var or pass apiKey in config.');
    }

    // API dimensions differ by provider
    if (this.apiProvider === 'google') {
      this.dimensions = 768; // Gemini embedding dimensions
    } else if (this.apiProvider === 'nvidia') {
      this.dimensions = 1024; // NV-Embed dimensions
    }

    logger.info(`API embedding initialized (${this.apiProvider}, ${this.dimensions} dimensions)`);
  }

  /**
   * Generate embedding vector for text
   * @param {string} text - Text to embed
   * @returns {Promise<Float32Array>} Embedding vector
   */
  async vectorize(text) {
    if (!this.initialized) {
      throw new Error('EmbeddingsManager not initialized. Call init() first.');
    }

    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }

    // Normalize text for caching
    const normalizedText = text.trim().toLowerCase();

    // Check cache
    const cached = this.cache.get(normalizedText);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;
    this.stats.totalVectorizations++;

    try {
      let embedding;

      if (this.mode === 'local' && !this.degraded) {
        embedding = await this._vectorizeLocal(text);
        this.stats.localCalls++;
      } else {
        embedding = await this._vectorizeApi(text);
        this.stats.apiCalls++;
      }

      // Cache the result
      this.cache.set(normalizedText, embedding);

      return embedding;
    } catch (error) {
      this.stats.errors++;
      logger.error('Vectorization failed:', error);

      // Attempt degradation if in local mode
      if (this.mode === 'local' && !this.degraded) {
        await this.degrade('vectorization_error');
        // Retry with API
        return this.vectorize(text);
      }

      throw error;
    }
  }

  /**
   * Generate embedding using local model
   * @private
   */
  async _vectorizeLocal(text) {
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  }

  /**
   * Generate embedding using API
   * @private
   */
  async _vectorizeApi(text) {
    if (this.apiProvider === 'google') {
      return this._vectorizeGoogle(text);
    } else if (this.apiProvider === 'nvidia') {
      return this._vectorizeNvidia(text);
    }

    throw new Error(`Unknown API provider: ${this.apiProvider}`);
  }

  /**
   * Generate embedding using Google Gemini API
   * @private
   */
  async _vectorizeGoogle(text) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text }] }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return new Float32Array(data.embedding.values);
  }

  /**
   * Generate embedding using NVIDIA NV-Embed API
   * @private
   */
  async _vectorizeNvidia(text) {
    const response = await fetch(
      'https://integrate.api.nvidia.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'nvidia/nv-embedqa-e5-v5',
          input: [text],
          input_type: 'query',
          truncation: 'NONE',
          encoding_format: 'float'
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NVIDIA API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return new Float32Array(data.data[0].embedding);
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<Float32Array[]>} Array of embedding vectors
   */
  async vectorizeBatch(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.vectorize(text));
    }
    return results;
  }

  /**
   * Switch to API mode due to memory pressure or errors
   * @param {string} reason - Reason for degradation
   */
  async degrade(reason) {
    if (this.degraded) return;

    logger.warn(`Degrading to API mode: ${reason}`);

    this.degraded = true;
    this.degradationReason = reason;
    this.stats.degradationCount++;

    // Clear local model to free memory
    this.extractor = null;

    // Try to initialize API mode if not already
    if (this.mode === 'local') {
      try {
        await this._initApi();
      } catch (error) {
        logger.error('Failed to initialize API mode during degradation:', error);
      }
    }

    // Run garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Attempt to restore local mode after degradation
   * @returns {Promise<boolean>} True if restoration successful
   */
  async restore() {
    if (!this.degraded || this.mode !== 'local') {
      return false;
    }

    if (this.restoreAttempts >= this.maxRestoreAttempts) {
      logger.warn('Max restore attempts reached, staying in degraded mode');
      return false;
    }

    this.restoreAttempts++;
    logger.info(`Attempting to restore local mode (attempt ${this.restoreAttempts}/${this.maxRestoreAttempts})`);

    try {
      await this._initLocal();
      this.degraded = false;
      this.degradationReason = null;
      this.restoreAttempts = 0;
      this.stats.restoreCount++;

      logger.info('Local mode restored successfully');
      return true;
    } catch (error) {
      logger.error('Failed to restore local mode:', error);
      return false;
    }
  }

  /**
   * Check memory pressure and trigger degradation if needed
   * @param {number} threshold - Memory usage threshold (0-1, default 0.91)
   * @returns {boolean} True if degraded
   */
  checkMemoryPressure(threshold = 0.91) {
    const memUsage = process.memoryUsage();
    const heapUsage = memUsage.heapUsed / memUsage.heapTotal;

    if (heapUsage > threshold && !this.degraded) {
      this.degrade(`memory_pressure: ${Math.round(heapUsage * 100)}%`);
      return true;
    }

    return false;
  }

  /**
   * Get current status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      initialized: this.initialized,
      mode: this.mode,
      effectiveMode: this.degraded ? 'api' : this.mode,
      degraded: this.degraded,
      degradationReason: this.degradationReason,
      dimensions: this.dimensions,
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      apiProvider: this.apiProvider,
      restoreAttempts: this.restoreAttempts,
      stats: { ...this.stats }
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Embedding cache cleared');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalVectorizations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      localCalls: 0,
      apiCalls: 0,
      errors: 0,
      degradationCount: 0,
      restoreCount: 0
    };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    this.clearCache();
    this.extractor = null;
    this.initialized = false;
    this.degraded = false;

    logger.info('EmbeddingsManager shutdown complete');
  }
}

// Singleton instance
let instance = null;

/**
 * Create or get singleton EmbeddingsManager instance
 * @param {Object} config - Configuration options
 * @returns {EmbeddingsManager} Manager instance
 */
export function createEmbeddingsManager(config) {
  instance = new EmbeddingsManager(config);
  return instance;
}

/**
 * Get singleton EmbeddingsManager instance
 * @returns {EmbeddingsManager|null} Manager instance or null
 */
export function getEmbeddingsManager() {
  return instance;
}

/**
 * Clear singleton instance (for testing)
 */
export function clearEmbeddingsManager() {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}

export default EmbeddingsManager;