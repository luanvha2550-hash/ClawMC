/**
 * Facts Manager for ClawMC Memory Layer
 *
 * Manages persistent facts with embeddings for semantic search.
 * Supports CRUD operations, automatic cleanup, and embedding generation.
 *
 * Features:
 * - Auto-generate embedding when saving
 * - Upsert behavior (insert or update)
 * - Automatic cleanup of old facts (maxAge config)
 * - Limit enforcement (maxFacts config)
 * - Preserve important fact types
 */

import { getDatabase } from './database.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Facts');

/**
 * Default FactsManager configuration
 */
const DEFAULT_FACTS_CONFIG = {
  // Maximum number of facts to store (0 = unlimited)
  maxFacts: 1000,
  // Maximum age of facts in milliseconds (0 = no limit)
  maxAge: 0,
  // Fact types to preserve during cleanup (never deleted)
  preservedTypes: ['location', 'base', 'important'],
  // Enable automatic embedding generation
  autoEmbed: true
};

/**
 * Facts Manager class
 * Handles persistent fact storage with embeddings
 */
export class FactsManager {
  /**
   * Create a FactsManager instance
   * @param {Object} options - Configuration options
   * @param {Object} options.db - Database instance (optional, uses singleton)
   * @param {Object} options.embeddingsManager - Embeddings manager instance (optional)
   * @param {Object} options.config - Facts configuration
   */
  constructor(options = {}) {
    this.db = options.db;
    this.embeddingsManager = options.embeddingsManager;
    this.config = { ...DEFAULT_FACTS_CONFIG, ...options.config };
    this.initialized = false;

    // Statistics
    this.stats = {
      factsSaved: 0,
      factsRetrieved: 0,
      factsDeleted: 0,
      cleanupsRun: 0,
      factsCleaned: 0,
      embeddingGenerated: 0,
      embeddingSkipped: 0,
      errors: 0
    };
  }

  /**
   * Initialize the facts manager
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      logger.warn('FactsManager already initialized');
      return;
    }

    try {
      // Get database if not provided
      if (!this.db) {
        this.db = getDatabase();
      }

      this.initialized = true;
      logger.info('FactsManager initialized', {
        maxFacts: this.config.maxFacts,
        maxAge: this.config.maxAge,
        preservedTypes: this.config.preservedTypes
      });

    } catch (error) {
      logger.error('Failed to initialize FactsManager:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for text value
   * @param {string} text - Text to embed
   * @returns {Promise<Buffer|null>} Embedding buffer or null
   * @private
   */
  async _generateEmbedding(text) {
    if (!this.embeddingsManager || !this.config.autoEmbed) {
      this.stats.embeddingSkipped++;
      return null;
    }

    try {
      const embedding = await this.embeddingsManager.vectorize(text);
      this.stats.embeddingGenerated++;
      return Buffer.from(embedding.buffer);
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      this.stats.embeddingSkipped++;
      return null;
    }
  }

  /**
   * Save or update a fact (upsert behavior)
   * @param {string} type - Fact type (category)
   * @param {string} key - Unique key within type
   * @param {*} value - Value to store (will be JSON serialized)
   * @returns {Promise<Object>} Saved fact object
   */
  async saveFact(type, key, value) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    if (!type || typeof type !== 'string') {
      throw new Error('Invalid type: must be a non-empty string');
    }

    if (!key || typeof key !== 'string') {
      throw new Error('Invalid key: must be a non-empty string');
    }

    const valueStr = JSON.stringify(value);
    const embedding = await this._generateEmbedding(`${type}:${key}:${valueStr}`);
    const now = new Date().toISOString();

    try {
      // Use INSERT OR REPLACE for upsert behavior
      const stmt = this.db.prepare(`
        INSERT INTO facts (type, key, value, embedding, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(type, key) DO UPDATE SET
          value = excluded.value,
          embedding = excluded.embedding,
          updated_at = excluded.updated_at
      `);

      const result = stmt.run(type, key, valueStr, embedding, now, now);

      this.stats.factsSaved++;

      logger.debug('Fact saved', { type, key, changes: result.changes });

      return {
        id: result.lastInsertRowid,
        type,
        key,
        value,
        createdAt: now,
        updatedAt: now,
        hasEmbedding: !!embedding
      };

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to save fact:', error);
      throw error;
    }
  }

  /**
   * Get a single fact by type and key
   * @param {string} type - Fact type
   * @param {string} key - Fact key
   * @returns {Promise<Object|null>} Fact object or null if not found
   */
  async getFact(type, key) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const row = this.db.prepare(`
        SELECT id, type, key, value, created_at, updated_at, embedding IS NOT NULL as has_embedding
        FROM facts
        WHERE type = ? AND key = ?
      `).get(type, key);

      if (!row) {
        return null;
      }

      this.stats.factsRetrieved++;

      return {
        id: row.id,
        type: row.type,
        key: row.key,
        value: row.value ? JSON.parse(row.value) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        hasEmbedding: !!row.has_embedding
      };

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to get fact:', error);
      throw error;
    }
  }

  /**
   * Get all facts of a specific type
   * @param {string} type - Fact type
   * @returns {Promise<Array<Object>>} Array of fact objects
   */
  async getFactsByType(type) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const rows = this.db.prepare(`
        SELECT id, type, key, value, created_at, updated_at, embedding IS NOT NULL as has_embedding
        FROM facts
        WHERE type = ?
        ORDER BY updated_at DESC
      `).all(type);

      this.stats.factsRetrieved += rows.length;

      return rows.map(row => ({
        id: row.id,
        type: row.type,
        key: row.key,
        value: row.value ? JSON.parse(row.value) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        hasEmbedding: !!row.has_embedding
      }));

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to get facts by type:', error);
      throw error;
    }
  }

  /**
   * Get all facts
   * @returns {Promise<Array<Object>>} Array of all fact objects
   */
  async getAllFacts() {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const rows = this.db.prepare(`
        SELECT id, type, key, value, created_at, updated_at, embedding IS NOT NULL as has_embedding
        FROM facts
        ORDER BY updated_at DESC
      `).all();

      this.stats.factsRetrieved += rows.length;

      return rows.map(row => ({
        id: row.id,
        type: row.type,
        key: row.key,
        value: row.value ? JSON.parse(row.value) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        hasEmbedding: !!row.has_embedding
      }));

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to get all facts:', error);
      throw error;
    }
  }

  /**
   * Delete a specific fact
   * @param {string} type - Fact type
   * @param {string} key - Fact key
   * @returns {Promise<boolean>} True if fact was deleted, false if not found
   */
  async deleteFact(type, key) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const result = this.db.prepare(`
        DELETE FROM facts WHERE type = ? AND key = ?
      `).run(type, key);

      if (result.changes > 0) {
        this.stats.factsDeleted += result.changes;
        logger.debug('Fact deleted', { type, key });
        return true;
      }

      return false;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to delete fact:', error);
      throw error;
    }
  }

  /**
   * Delete all facts of a specific type
   * @param {string} type - Fact type
   * @returns {Promise<number>} Number of facts deleted
   */
  async deleteFactsByType(type) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const result = this.db.prepare(`
        DELETE FROM facts WHERE type = ?
      `).run(type);

      this.stats.factsDeleted += result.changes;
      logger.debug('Facts deleted by type', { type, count: result.changes });

      return result.changes;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to delete facts by type:', error);
      throw error;
    }
  }

  /**
   * Cleanup old and excess facts
   * - Removes facts older than maxAge (if configured)
   * - Removes oldest facts when exceeding maxFacts limit (if configured)
   * - Preserves facts of preserved types
   * @returns {Promise<Object>} Cleanup result with counts
   */
  async cleanup() {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    this.stats.cleanupsRun++;

    const result = {
      ageDeleted: 0,
      limitDeleted: 0,
      totalDeleted: 0
    };

    try {
      // Build preserved types placeholder clause
      const preservedClause = this.config.preservedTypes.length > 0
        ? `AND type NOT IN (${this.config.preservedTypes.map(() => '?').join(',')})`
        : '';

      // 1. Cleanup by age if maxAge is set
      if (this.config.maxAge > 0) {
        const cutoffDate = new Date(Date.now() - this.config.maxAge).toISOString();

        const ageStmt = this.db.prepare(`
          DELETE FROM facts
          WHERE created_at < ? ${preservedClause}
        `);

        const params = [cutoffDate, ...this.config.preservedTypes];
        const ageResult = ageStmt.run(...params);
        result.ageDeleted = ageResult.changes;
      }

      // 2. Cleanup by count limit if maxFacts is set
      if (this.config.maxFacts > 0) {
        // Count facts that can be deleted (excluding preserved types)
        const preservedWhere = this.config.preservedTypes.length > 0
          ? `WHERE type NOT IN (${this.config.preservedTypes.map(() => '?').join(',')})`
          : '';

        const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM facts ${preservedWhere}`);
        const countParams = this.config.preservedTypes;
        const countRow = countStmt.get(...countParams);
        const deletableCount = countRow.count;

        // Calculate how many to delete
        const excessCount = deletableCount - this.config.maxFacts;

        if (excessCount > 0) {
          // Delete oldest facts (excluding preserved types)
          const deleteStmt = this.db.prepare(`
            DELETE FROM facts
            WHERE id IN (
              SELECT id FROM facts
              ${preservedWhere}
              ORDER BY created_at ASC
              LIMIT ?
            )
          `);

          const deleteParams = [...this.config.preservedTypes, excessCount];
          const deleteResult = deleteStmt.run(...deleteParams);
          result.limitDeleted = deleteResult.changes;
        }
      }

      result.totalDeleted = result.ageDeleted + result.limitDeleted;
      this.stats.factsCleaned += result.totalDeleted;

      if (result.totalDeleted > 0) {
        logger.info('Facts cleanup completed', result);
      }

      return result;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to cleanup facts:', error);
      throw error;
    }
  }

  /**
   * Get total count of facts
   * @returns {Promise<number>} Total fact count
   */
  async getFactCount() {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM facts').get();
      return row.count;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to get fact count:', error);
      throw error;
    }
  }

  /**
   * Get count of facts grouped by type
   * @returns {Promise<Object>} Object with type as key and count as value
   */
  async getFactCountByType() {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const rows = this.db.prepare(`
        SELECT type, COUNT(*) as count
        FROM facts
        GROUP BY type
        ORDER BY count DESC
      `).all();

      const result = {};
      for (const row of rows) {
        result[row.type] = row.count;
      }

      return result;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to get fact count by type:', error);
      throw error;
    }
  }

  /**
   * Check if a fact exists
   * @param {string} type - Fact type
   * @param {string} key - Fact key
   * @returns {Promise<boolean>} True if fact exists
   */
  async hasFact(type, key) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    try {
      const row = this.db.prepare(`
        SELECT 1 FROM facts WHERE type = ? AND key = ? LIMIT 1
      `).get(type, key);

      return !!row;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to check fact existence:', error);
      throw error;
    }
  }

  /**
   * Update embedding for an existing fact
   * @param {string} type - Fact type
   * @param {string} key - Fact key
   * @returns {Promise<boolean>} True if embedding was updated
   */
  async updateEmbedding(type, key) {
    if (!this.initialized) {
      throw new Error('FactsManager not initialized. Call init() first.');
    }

    if (!this.embeddingsManager) {
      logger.warn('No embeddings manager, cannot update embedding');
      return false;
    }

    try {
      // Get the fact value
      const fact = await this.getFact(type, key);
      if (!fact) {
        return false;
      }

      // Generate new embedding
      const valueStr = JSON.stringify(fact.value);
      const embedding = await this._generateEmbedding(`${type}:${key}:${valueStr}`);

      if (!embedding) {
        return false;
      }

      // Update embedding
      this.db.prepare(`
        UPDATE facts SET embedding = ?, updated_at = ? WHERE type = ? AND key = ?
      `).run(embedding, new Date().toISOString(), type, key);

      return true;

    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to update embedding:', error);
      throw error;
    }
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
    logger.info('FactsManager config updated', this.config);
  }

  /**
   * Get statistics
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
      factsSaved: 0,
      factsRetrieved: 0,
      factsDeleted: 0,
      cleanupsRun: 0,
      factsCleaned: 0,
      embeddingGenerated: 0,
      embeddingSkipped: 0,
      errors: 0
    };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    this.initialized = false;
    logger.info('FactsManager shutdown complete');
  }
}

// Singleton instance
let instance = null;

/**
 * Create or get singleton FactsManager instance
 * @param {Object} options - Configuration options
 * @returns {FactsManager} Manager instance
 */
export function createFactsManager(options) {
  instance = new FactsManager(options);
  return instance;
}

/**
 * Get singleton FactsManager instance
 * @returns {FactsManager|null} Manager instance or null
 */
export function getFactsManager() {
  return instance;
}

/**
 * Clear singleton instance (for testing)
 */
export function clearFactsManager() {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}

export default FactsManager;