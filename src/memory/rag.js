/**
 * RAG (Retrieval-Augmented Generation) System for ClawMC Memory Layer
 *
 * Provides semantic search over skills and facts using vector embeddings.
 * Uses sqlite-vec for efficient similarity search.
 *
 * Features:
 * - Search skills by description/semantic similarity
 * - Search facts by content similarity
 * - Hybrid search combining semantic and keyword matching
 * - Configurable similarity thresholds
 */

import { getDatabase } from './database.js';
import { getLogger } from '../utils/logger.js';
import { HybridSearch, extractKeywords, normalizeQuery } from './hybridSearch.js';

const logger = getLogger().module('RAG');

/**
 * Default RAG configuration
 */
const DEFAULT_RAG_CONFIG = {
  // Minimum similarity threshold (0-1) for semantic matches
  minSimilarity: 0.5,
  // Default maximum results to return
  maxResults: 10,
  // Weight for semantic vs keyword search (0-1)
  semanticWeight: 0.7,
  // Enable hybrid search (semantic + keyword)
  hybridSearch: true,
  // Cache TTL for search results (ms)
  cacheTTL: 60000
};

/**
 * Search result with confidence score
 * @typedef {Object} SearchResult
 * @property {number} id - Record ID
 * @property {string} name - Skill name or fact key
 * @property {string} description - Skill description or fact value
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} searchType - 'semantic', 'keyword', or 'hybrid'
 */

/**
 * RAG System class
 * Handles retrieval-augmented generation for skills and facts
 */
export class RAGSystem {
  /**
   * Create a RAGSystem instance
   * @param {Object} options - Configuration options
   * @param {Object} options.db - Database instance (optional, uses singleton)
   * @param {Object} options.embeddingsManager - Embeddings manager instance
   * @param {Object} options.config - RAG configuration
   */
  constructor(options = {}) {
    this.db = options.db;
    this.embeddingsManager = options.embeddingsManager;
    this.config = { ...DEFAULT_RAG_CONFIG, ...options.config };
    this.hybridSearch = null;
    this.initialized = false;

    // Simple result cache
    this.cache = new Map();
    this.cacheExpiry = new Map();

    // Statistics
    this.stats = {
      skillSearches: 0,
      factSearches: 0,
      combinedSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0
    };
  }

  /**
   * Initialize the RAG system
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      logger.warn('RAGSystem already initialized');
      return;
    }

    try {
      // Get database if not provided
      if (!this.db) {
        this.db = getDatabase();
      }

      // Initialize hybrid search
      this.hybridSearch = new HybridSearch(this.db, {
        semanticWeight: this.config.semanticWeight,
        minSimilarity: this.config.minSimilarity,
        maxResults: this.config.maxResults
      });

      this.initialized = true;
      logger.info('RAGSystem initialized', {
        hybridSearch: this.config.hybridSearch,
        semanticWeight: this.config.semanticWeight,
        minSimilarity: this.config.minSimilarity
      });

    } catch (error) {
      logger.error('Failed to initialize RAGSystem:', error);
      throw error;
    }
  }

  /**
   * Get embedding for a query
   * @param {string} query - Query text
   * @returns {Promise<Float32Array|null>} Embedding vector or null
   * @private
   */
  async _getEmbedding(query) {
    if (!this.embeddingsManager) {
      logger.debug('No embeddings manager, skipping semantic search');
      return null;
    }

    try {
      return await this.embeddingsManager.vectorize(query);
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * Get from cache if valid
   * @param {string} cacheKey - Cache key
   * @returns {Array|null} Cached results or null
   * @private
   */
  _getFromCache(cacheKey) {
    const expiry = this.cacheExpiry.get(cacheKey);
    if (expiry && Date.now() < expiry) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey);
    }
    this.stats.cacheMisses++;
    return null;
  }

  /**
   * Set cache with TTL
   * @param {string} cacheKey - Cache key
   * @param {Array} results - Results to cache
   * @private
   */
  _setCache(cacheKey, results) {
    this.cache.set(cacheKey, results);
    this.cacheExpiry.set(cacheKey, Date.now() + this.config.cacheTTL);
  }

  /**
   * Clear expired cache entries
   * @private
   */
  _cleanCache() {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry) {
      if (expiry < now) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  /**
   * Search skills and facts
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.minSimilarity - Minimum similarity threshold
   * @param {number} options.maxResults - Maximum results to return
   * @param {string} options.type - Filter by type: 'skills', 'facts', or 'all'
   * @returns {Promise<Array<SearchResult>>} Search results with confidence
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      throw new Error('RAGSystem not initialized. Call init() first.');
    }

    if (!query || typeof query !== 'string') {
      return [];
    }

    const minSimilarity = options.minSimilarity ?? this.config.minSimilarity;
    const maxResults = options.maxResults ?? this.config.maxResults;
    const type = options.type ?? 'all';

    // Check cache
    const cacheKey = `${query}:${minSimilarity}:${maxResults}:${type}`;
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    this.stats.combinedSearches++;

    try {
      // Get embedding for semantic search
      const embedding = await this._getEmbedding(query);

      let results = [];

      if (type === 'all' || type === 'skills') {
        const skills = await this.searchSkills(embedding, minSimilarity, maxResults);
        results.push(...skills.map(s => ({
          ...s,
          source: 'skill'
        })));
      }

      if (type === 'all' || type === 'facts') {
        const facts = await this.searchFacts(embedding, minSimilarity, maxResults);
        results.push(...facts.map(f => ({
          ...f,
          source: 'fact'
        })));
      }

      // Sort by confidence/similarity
      results.sort((a, b) => (b.confidence || b.similarity || 0) - (a.confidence || a.similarity || 0));

      // Limit results
      results = results.slice(0, maxResults);

      // Cache results
      this._setCache(cacheKey, results);

      return results;

    } catch (error) {
      this.stats.errors++;
      logger.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Search skills by semantic similarity
   * @param {Float32Array|null} embedding - Query embedding
   * @param {number} minSimilarity - Minimum similarity threshold
   * @param {number} maxResults - Maximum results
   * @returns {Promise<Array>} Search results
   */
  async searchSkills(embedding, minSimilarity = this.config.minSimilarity, maxResults = this.config.maxResults) {
    if (!this.initialized) {
      throw new Error('RAGSystem not initialized. Call init() first.');
    }

    this.stats.skillSearches++;

    try {
      // If embedding provided and semantic search available
      if (embedding && this.hybridSearch.isSemanticAvailable() && this.config.hybridSearch) {
        const results = this.hybridSearch.semanticSearch(embedding, 'skills_metadata', {
          minSimilarity,
          maxResults
        });

        return results.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          filePath: r.file_path,
          parameters: r.parameters ? JSON.parse(r.parameters) : null,
          returns: r.returns,
          examples: r.examples ? JSON.parse(r.examples) : null,
          tags: r.tags ? JSON.parse(r.tags) : [],
          similarity: r.similarity,
          confidence: r.similarity,
          searchType: r.searchType
        }));
      }

      // Fallback to keyword-only search
      if (embedding === null && this.embeddingsManager) {
        // No embedding available, keyword search only
        logger.debug('Keyword-only search for skills');
      }

      return [];

    } catch (error) {
      this.stats.errors++;
      logger.error('Skill search failed:', error);
      return [];
    }
  }

  /**
   * Search facts by semantic similarity
   * @param {Float32Array|null} embedding - Query embedding
   * @param {number} minSimilarity - Minimum similarity threshold
   * @param {number} maxResults - Maximum results
   * @returns {Promise<Array>} Search results
   */
  async searchFacts(embedding, minSimilarity = this.config.minSimilarity, maxResults = this.config.maxResults) {
    if (!this.initialized) {
      throw new Error('RAGSystem not initialized. Call init() first.');
    }

    this.stats.factSearches++;

    try {
      // If embedding provided and semantic search available
      if (embedding && this.hybridSearch.isSemanticAvailable() && this.config.hybridSearch) {
        const results = this.hybridSearch.semanticSearch(embedding, 'facts', {
          minSimilarity,
          maxResults
        });

        return results.map(r => ({
          id: r.id,
          type: r.type,
          key: r.key,
          value: r.value,
          similarity: r.similarity,
          confidence: r.similarity,
          searchType: r.searchType
        }));
      }

      return [];

    } catch (error) {
      this.stats.errors++;
      logger.error('Fact search failed:', error);
      return [];
    }
  }

  /**
   * Find the most similar skill to a description
   * @param {string} description - Skill description to match
   * @returns {Promise<Object|null>} Most similar skill or null
   */
  async findSimilarSkill(description) {
    if (!this.initialized) {
      throw new Error('RAGSystem not initialized. Call init() first.');
    }

    if (!description || typeof description !== 'string') {
      return null;
    }

    try {
      const embedding = await this._getEmbedding(description);
      if (!embedding) {
        return null;
      }

      const results = await this.searchSkills(embedding, this.config.minSimilarity, 1);

      return results.length > 0 ? results[0] : null;

    } catch (error) {
      logger.error('findSimilarSkill failed:', error);
      return null;
    }
  }

  /**
   * Find relevant facts for a query
   * @param {string} query - Query to find facts for
   * @param {number} limit - Maximum number of facts
   * @returns {Promise<Array>} Relevant facts
   */
  async findRelevantFacts(query, limit = 5) {
    if (!this.initialized) {
      throw new Error('RAGSystem not initialized. Call init() first.');
    }

    if (!query || typeof query !== 'string') {
      return [];
    }

    try {
      const embedding = await this._getEmbedding(query);
      if (!embedding) {
        return [];
      }

      return await this.searchFacts(embedding, this.config.minSimilarity, limit);

    } catch (error) {
      logger.error('findRelevantFacts failed:', error);
      return [];
    }
  }

  /**
   * Search with hybrid strategy (semantic + keyword)
   * @param {string} query - Text query
   * @param {Float32Array} embedding - Query embedding
   * @param {string} tableName - Table to search
   * @param {Object} options - Search options
   * @returns {Array} Combined results
   */
  hybridSearch(query, embedding, tableName, options = {}) {
    if (!this.initialized || !this.hybridSearch) {
      return [];
    }

    return this.hybridSearch.search(query, embedding, tableName, {
      minSimilarity: options.minSimilarity ?? this.config.minSimilarity,
      maxResults: options.maxResults ?? this.config.maxResults,
      semanticWeight: options.semanticWeight ?? this.config.semanticWeight
    });
  }

  /**
   * Get current configuration
   * @returns {Object} Configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    if (this.hybridSearch) {
      this.hybridSearch.updateConfig({
        semanticWeight: this.config.semanticWeight,
        minSimilarity: this.config.minSimilarity,
        maxResults: this.config.maxResults
      });
    }

    logger.info('RAGSystem config updated', this.config);
  }

  /**
   * Get search statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const hybridStats = this.hybridSearch ? this.hybridSearch.getStats() : {};
    return {
      ...this.stats,
      hybrid: hybridStats,
      cacheSize: this.cache.size
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      skillSearches: 0,
      factSearches: 0,
      combinedSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0
    };

    if (this.hybridSearch) {
      this.hybridSearch.resetStats();
    }
  }

  /**
   * Clear search result cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    logger.info('RAG cache cleared');
  }

  /**
   * Check if semantic search is available
   * @returns {boolean} True if sqlite-vec is available
   */
  isSemanticAvailable() {
    return this.hybridSearch ? this.hybridSearch.isSemanticAvailable() : false;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    this.clearCache();
    this.initialized = false;
    this.hybridSearch = null;

    logger.info('RAGSystem shutdown complete');
  }
}

// Singleton instance
let instance = null;

/**
 * Create or get singleton RAGSystem instance
 * @param {Object} options - Configuration options
 * @returns {RAGSystem} RAG system instance
 */
export function createRAGSystem(options) {
  instance = new RAGSystem(options);
  return instance;
}

/**
 * Get singleton RAGSystem instance
 * @returns {RAGSystem|null} RAG system instance or null
 */
export function getRAGSystem() {
  return instance;
}

/**
 * Clear singleton instance (for testing)
 */
export function clearRAGSystem() {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}

export default RAGSystem;