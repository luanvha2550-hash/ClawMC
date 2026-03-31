/**
 * Hybrid Search for ClawMC Memory Layer
 *
 * Combines semantic search (vector similarity) with keyword search (LIKE queries)
 * for improved retrieval accuracy.
 *
 * Features:
 * - Semantic search using sqlite-vec embeddings
 * - Keyword search using LIKE patterns
 * - Configurable weight for combining results
 * - Re-ranking by combined score
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('HybridSearch');

/**
 * Default search configuration
 */
const DEFAULT_CONFIG = {
  // Weight for semantic search (0-1, keyword gets 1 - semanticWeight)
  semanticWeight: 0.7,
  // Minimum similarity threshold for semantic results
  minSimilarity: 0.5,
  // Maximum results to return
  maxResults: 10,
  // Whether to use keyword search as fallback when semantic fails
  keywordFallback: true
};

/**
 * Normalize a search query for keyword matching
 * @param {string} query - Raw search query
 * @returns {string} Normalized query for LIKE patterns
 */
export function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return '';

  // Remove special characters, lowercase, trim
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract keywords from a query
 * @param {string} query - Search query
 * @returns {string[]} Array of keywords
 */
export function extractKeywords(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  // Split on whitespace and filter short words
  return normalized
    .split(' ')
    .filter(word => word.length >= 3)
    .slice(0, 10); // Limit to 10 keywords
}

/**
 * Build LIKE patterns for keyword search
 * @param {string[]} keywords - Keywords to search for
 * @returns {Object} Object with pattern and params
 */
export function buildLikePatterns(keywords) {
  if (!keywords || keywords.length === 0) {
    return { whereClause: '1=0', params: [] };
  }

  const patterns = keywords.map(kw => `LOWER(description) LIKE ?`);
  const params = keywords.map(kw => `%${kw}%`);

  return {
    whereClause: patterns.join(' OR '),
    params
  };
}

/**
 * Calculate keyword match score
 * @param {string} text - Text to search in
 * @param {string[]} keywords - Keywords to match
 * @returns {number} Score between 0 and 1
 */
export function calculateKeywordScore(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return 0;

  const normalizedText = text.toLowerCase();
  let matchCount = 0;

  for (const keyword of keywords) {
    if (normalizedText.includes(keyword)) {
      matchCount++;
    }
  }

  // Normalize by number of keywords
  return matchCount / keywords.length;
}

/**
 * Hybrid Search class
 * Combines semantic and keyword search strategies
 */
export class HybridSearch {
  /**
   * Create a HybridSearch instance
   * @param {Object} db - Database instance (better-sqlite3)
   * @param {Object} config - Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vecAvailable = false;

    // Statistics
    this.stats = {
      semanticSearches: 0,
      keywordSearches: 0,
      hybridSearches: 0,
      resultsCombined: 0
    };

    // Check if sqlite-vec is available
    this._checkVecAvailability();
  }

  /**
   * Check if sqlite-vec extension is available
   * @private
   */
  _checkVecAvailability() {
    try {
      // Try to use vec_distance_cosine function
      this.db.prepare('SELECT vec_distance_cosine(?, ?) as dist')
        .get(new Float32Array([0.1, 0.2]), new Float32Array([0.1, 0.2]));
      this.vecAvailable = true;
    } catch (e) {
      logger.warn('sqlite-vec not available, falling back to keyword search only');
      this.vecAvailable = false;
    }
  }

  /**
   * Perform semantic search using vector similarity
   * @param {Float32Array} embedding - Query embedding vector
   * @param {string} tableName - Table to search (skills_metadata or facts)
   * @param {Object} options - Search options
   * @returns {Array} Search results with distance/similarity
   */
  semanticSearch(embedding, tableName, options = {}) {
    const minSimilarity = options.minSimilarity ?? this.config.minSimilarity;
    const maxResults = options.maxResults ?? this.config.maxResults;

    if (!this.vecAvailable) {
      logger.debug('Semantic search not available, returning empty results');
      return [];
    }

    try {
      this.stats.semanticSearches++;

      // Build query based on table
      let query;
      if (tableName === 'skills_metadata') {
        query = `
          SELECT
            id, name, description, file_path, parameters, returns, examples, tags,
            vec_distance_cosine(embedding, ?) as distance
          FROM skills_metadata
          WHERE embedding IS NOT NULL
          ORDER BY distance ASC
          LIMIT ?
        `;
      } else if (tableName === 'facts') {
        query = `
          SELECT
            id, type, key, value,
            vec_distance_cosine(embedding, ?) as distance
          FROM facts
          WHERE embedding IS NOT NULL
          ORDER BY distance ASC
          LIMIT ?
        `;
      } else {
        throw new Error(`Unknown table: ${tableName}`);
      }

      // Convert Float32Array to Buffer for sqlite-vec
      const embeddingBuffer = Buffer.from(embedding.buffer);

      const results = this.db.prepare(query).all(embeddingBuffer, maxResults);

      // Convert distance to similarity (cosine distance: 0 = identical, 2 = opposite)
      // Similarity = 1 - distance (for cosine)
      return results
        .map(row => ({
          ...row,
          similarity: 1 - row.distance,
          searchType: 'semantic'
        }))
        .filter(row => row.similarity >= minSimilarity);

    } catch (error) {
      logger.error('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Perform keyword search using LIKE patterns
   * @param {string} query - Search query
   * @param {string} tableName - Table to search
   * @param {Object} options - Search options
   * @returns {Array} Search results with keyword score
   */
  keywordSearch(query, tableName, options = {}) {
    const maxResults = options.maxResults ?? this.config.maxResults;

    try {
      this.stats.keywordSearches++;

      const keywords = extractKeywords(query);
      if (keywords.length === 0) {
        return [];
      }

      let sql;
      if (tableName === 'skills_metadata') {
        sql = `
          SELECT id, name, description, file_path, parameters, returns, examples, tags
          FROM skills_metadata
          WHERE LOWER(description) LIKE ?
             OR LOWER(name) LIKE ?
             OR LOWER(tags) LIKE ?
          LIMIT ?
        `;
        // Create pattern for each field
        const pattern = `%${normalizeQuery(query)}%`;
        const results = this.db.prepare(sql).all(pattern, pattern, pattern, maxResults);

        return results.map(row => ({
          ...row,
          keywordScore: calculateKeywordScore(
            `${row.name} ${row.description || ''} ${row.tags || ''}`,
            keywords
          ),
          searchType: 'keyword'
        }));
      } else if (tableName === 'facts') {
        sql = `
          SELECT id, type, key, value
          FROM facts
          WHERE LOWER(value) LIKE ?
             OR LOWER(key) LIKE ?
          LIMIT ?
        `;
        const pattern = `%${normalizeQuery(query)}%`;
        const results = this.db.prepare(sql).all(pattern, pattern, maxResults);

        return results.map(row => ({
          ...row,
          keywordScore: calculateKeywordScore(
            `${row.key} ${row.value || ''}`,
            keywords
          ),
          searchType: 'keyword'
        }));
      } else {
        throw new Error(`Unknown table: ${tableName}`);
      }

    } catch (error) {
      logger.error('Keyword search failed:', error);
      return [];
    }
  }

  /**
   * Combine and re-rank results from semantic and keyword search
   * @param {Array} semanticResults - Results from semantic search
   * @param {Array} keywordResults - Results from keyword search
   * @param {Object} options - Combination options
   * @returns {Array} Combined and ranked results
   */
  combineResults(semanticResults, keywordResults, options = {}) {
    const semanticWeight = options.semanticWeight ?? this.config.semanticWeight;
    const keywordWeight = 1 - semanticWeight;

    // Create a map to deduplicate by ID
    const resultMap = new Map();

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.id, {
        ...result,
        semanticScore: result.similarity || 0,
        keywordScore: 0,
        combinedScore: (result.similarity || 0) * semanticWeight
      });
    }

    // Merge keyword results
    for (const result of keywordResults) {
      const existing = resultMap.get(result.id);

      if (existing) {
        // Combine scores
        existing.keywordScore = result.keywordScore || 0;
        existing.combinedScore =
          existing.semanticScore * semanticWeight +
          existing.keywordScore * keywordWeight;
      } else {
        // New result from keyword search
        resultMap.set(result.id, {
          ...result,
          semanticScore: 0,
          keywordScore: result.keywordScore || 0,
          combinedScore: (result.keywordScore || 0) * keywordWeight
        });
      }
    }

    // Sort by combined score
    const combined = Array.from(resultMap.values())
      .sort((a, b) => b.combinedScore - a.combinedScore);

    this.stats.resultsCombined++;

    return combined;
  }

  /**
   * Perform hybrid search combining semantic and keyword
   * @param {string} query - Text query (for keyword)
   * @param {Float32Array} embedding - Query embedding (for semantic)
   * @param {string} tableName - Table to search
   * @param {Object} options - Search options
   * @returns {Array} Combined and ranked results
   */
  search(query, embedding, tableName, options = {}) {
    this.stats.hybridSearches++;

    const maxResults = options.maxResults ?? this.config.maxResults;
    const minSimilarity = options.minSimilarity ?? this.config.minSimilarity;
    const semanticWeight = options.semanticWeight ?? this.config.semanticWeight;

    // Perform both searches
    const semanticResults = this.semanticSearch(embedding, tableName, {
      minSimilarity,
      maxResults
    });

    const keywordResults = this.keywordSearch(query, tableName, {
      maxResults
    });

    // Combine results
    const combined = this.combineResults(semanticResults, keywordResults, {
      semanticWeight
    });

    // Limit results
    return combined.slice(0, maxResults);
  }

  /**
   * Get search statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      semanticSearches: 0,
      keywordSearches: 0,
      hybridSearches: 0,
      resultsCombined: 0
    };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('HybridSearch config updated', this.config);
  }

  /**
   * Check if semantic search is available
   * @returns {boolean} True if sqlite-vec is available
   */
  isSemanticAvailable() {
    return this.vecAvailable;
  }
}

export default HybridSearch;