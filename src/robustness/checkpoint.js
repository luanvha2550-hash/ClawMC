/**
 * Checkpoint Manager for ClawMC
 *
 * Manages periodic saving of bot state for recovery purposes.
 * Saves position, vitals, inventory, and task state to database.
 */

import { getLogger } from '../utils/logger.js';
import { getDatabase, run, get, all } from '../memory/database.js';

const logger = getLogger().module('Checkpoint');

/**
 * CheckpointManager
 *
 * Provides automatic and manual checkpointing of bot state.
 * Supports multiple checkpoint types (auto, manual, death, shutdown).
 */
export class CheckpointManager {
  /**
   * Create a CheckpointManager
   * @param {Object} options - Configuration options
   * @param {Object} options.bot - Mineflayer bot instance
   * @param {Object} options.stateManager - State manager instance
   * @param {number} options.interval - Auto checkpoint interval in ms (default: 5 minutes)
   * @param {number} options.maxCheckpoints - Maximum checkpoints to keep (default: 10)
   */
  constructor(options = {}) {
    this.bot = options.bot || null;
    this.stateManager = options.stateManager || null;
    this.interval = options.interval || 300000; // 5 minutes default
    this.maxCheckpoints = options.maxCheckpoints || 10;

    this.timer = null;
    this.initialized = false;
    this.lastCheckpoint = null;
  }

  /**
   * Initialize checkpoint manager
   * - Creates checkpoint table if needed
   * - Starts auto checkpoint timer
   */
  async init() {
    if (this.initialized) {
      logger.warn('CheckpointManager already initialized');
      return;
    }

    try {
      // Verify table exists (should be created by migration)
      const tableCheck = get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'"
      );

      if (!tableCheck) {
        logger.warn('Checkpoints table not found, creating...');
        this._createCheckpointsTable();
      }

      // Start auto checkpoint timer
      this._startAutoCheckpoint();

      this.initialized = true;
      logger.info('CheckpointManager initialized', {
        interval: this.interval,
        maxCheckpoints: this.maxCheckpoints
      });

    } catch (error) {
      logger.error('Failed to initialize CheckpointManager:', error);
      throw error;
    }
  }

  /**
   * Create checkpoints table (fallback if migration didn't run)
   * @private
   */
  _createCheckpointsTable() {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        data TEXT,
        task_type TEXT,
        task_progress REAL,
        position TEXT,
        inventory TEXT,
        recovered BOOLEAN DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON checkpoints(type);
    `);
  }

  /**
   * Start auto checkpoint timer
   * @private
   */
  _startAutoCheckpoint() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.save('auto').catch(err => {
        logger.error('Auto checkpoint failed:', err);
      });
    }, this.interval);

    logger.debug('Auto checkpoint timer started');
  }

  /**
   * Stop auto checkpoint timer
   * @private
   */
  _stopAutoCheckpoint() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.debug('Auto checkpoint timer stopped');
    }
  }

  /**
   * Save a checkpoint
   * @param {string} type - Checkpoint type (auto, manual, death, shutdown)
   * @param {Object} additionalData - Additional data to include
   * @returns {Promise<number>} Checkpoint ID
   */
  async save(type = 'manual', additionalData = {}) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      const checkpoint = this._buildCheckpoint(type, additionalData);

      const result = run(
        `INSERT INTO checkpoints (timestamp, type, data, task_type, task_progress, position, inventory, recovered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          checkpoint.timestamp,
          checkpoint.type,
          JSON.stringify(checkpoint.data),
          checkpoint.task_type,
          checkpoint.task_progress,
          JSON.stringify(checkpoint.position),
          JSON.stringify(checkpoint.inventory),
          0
        ]
      );

      this.lastCheckpoint = {
        id: result.lastInsertRowid,
        ...checkpoint
      };

      logger.info('Checkpoint saved', {
        id: result.lastInsertRowid,
        type,
        position: checkpoint.position
      });

      // Cleanup old checkpoints
      await this._cleanupOldCheckpoints();

      return result.lastInsertRowid;

    } catch (error) {
      logger.error('Failed to save checkpoint:', error);
      throw error;
    }
  }

  /**
   * Build checkpoint data object
   * @param {string} type - Checkpoint type
   * @param {Object} additionalData - Additional data
   * @returns {Object} Checkpoint data
   * @private
   */
  _buildCheckpoint(type, additionalData = {}) {
    const checkpoint = {
      timestamp: new Date().toISOString(),
      type,
      position: null,
      inventory: [],
      vitals: { health: 20, food: 20 },
      task_type: null,
      task_progress: null,
      data: { ...additionalData }
    };

    // Get position from bot
    if (this.bot?.entity?.position) {
      const pos = this.bot.entity.position;
      checkpoint.position = {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z)
      };

      // Add dimension if available
      if (this.bot.game?.dimension) {
        checkpoint.position.dimension = this.bot.game.dimension;
      }
    }

    // Get vitals from bot
    if (this.bot) {
      checkpoint.vitals = {
        health: this.bot.health ?? 20,
        food: this.bot.food ?? 20
      };
    }

    // Get inventory from bot
    if (this.bot?.inventory?.items) {
      checkpoint.inventory = this.bot.inventory.items().map(item => ({
        name: item.name,
        count: item.count,
        slot: item.slot
      }));
    }

    // Get task state from state manager
    if (this.stateManager) {
      if (this.stateManager.currentTask) {
        checkpoint.task_type = this.stateManager.currentTask.type || 'unknown';
        checkpoint.task_progress = this.stateManager.currentTask.progress || 0;
      }

      // Include following state
      if (this.stateManager.following) {
        checkpoint.data.following = this.stateManager.following;
      }

      // Include curriculum phase
      if (this.stateManager.curriculumPhase) {
        checkpoint.data.curriculumPhase = this.stateManager.curriculumPhase;
      }

      // Include learned skills
      if (this.stateManager.learnedSkills?.size > 0) {
        checkpoint.data.learnedSkills = Array.from(this.stateManager.learnedSkills);
      }
    }

    return checkpoint;
  }

  /**
   * Load latest checkpoint
   * @param {string} type - Filter by type (optional)
   * @returns {Promise<Object|null>} Latest checkpoint or null
   */
  async loadLatest(type = null) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      let query = 'SELECT * FROM checkpoints WHERE recovered = 0';
      const params = [];

      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }

      query += ' ORDER BY timestamp DESC LIMIT 1';

      const row = get(query, params);

      if (!row) {
        logger.debug('No checkpoint found');
        return null;
      }

      return this._rowToCheckpoint(row);

    } catch (error) {
      logger.error('Failed to load checkpoint:', error);
      throw error;
    }
  }

  /**
   * Restore from checkpoint
   * @param {number} checkpointId - Checkpoint ID to restore
   * @returns {Promise<Object>} Restored checkpoint data
   */
  async restore(checkpointId) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      const row = get('SELECT * FROM checkpoints WHERE id = ?', [checkpointId]);

      if (!row) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }

      const checkpoint = this._rowToCheckpoint(row);

      // Mark as recovered
      run(
        'UPDATE checkpoints SET recovered = 1 WHERE id = ?',
        [checkpointId]
      );

      logger.info('Checkpoint restored', {
        id: checkpointId,
        type: checkpoint.type,
        position: checkpoint.position
      });

      return checkpoint;

    } catch (error) {
      logger.error('Failed to restore checkpoint:', error);
      throw error;
    }
  }

  /**
   * List checkpoints
   * @param {Object} options - Filter options
   * @param {string} options.type - Filter by type
   * @param {boolean} options.unrecoveredOnly - Only unrecovered checkpoints
   * @param {number} options.limit - Maximum number to return
   * @returns {Promise<Array>} Array of checkpoints
   */
  async list(options = {}) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      let query = 'SELECT * FROM checkpoints WHERE 1=1';
      const params = [];

      if (options.type) {
        query += ' AND type = ?';
        params.push(options.type);
      }

      if (options.unrecoveredOnly) {
        query += ' AND recovered = 0';
      }

      query += ' ORDER BY timestamp DESC';

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = all(query, params);

      return rows.map(row => this._rowToCheckpoint(row));

    } catch (error) {
      logger.error('Failed to list checkpoints:', error);
      throw error;
    }
  }

  /**
   * Clear all checkpoints
   * @param {Object} options - Clear options
   * @param {boolean} options.onlyRecovered - Only clear recovered checkpoints
   * @returns {Promise<number>} Number of checkpoints cleared
   */
  async clear(options = {}) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      let query = 'DELETE FROM checkpoints';
      const params = [];

      if (options.onlyRecovered) {
        query += ' WHERE recovered = 1';
      }

      const result = run(query, params);

      logger.info('Checkpoints cleared', {
        count: result.changes,
        onlyRecovered: options.onlyRecovered
      });

      return result.changes;

    } catch (error) {
      logger.error('Failed to clear checkpoints:', error);
      throw error;
    }
  }

  /**
   * Export checkpoint for external use
   * @param {number} checkpointId - Checkpoint ID to export
   * @returns {Promise<Object|null>} Checkpoint data or null
   */
  async export(checkpointId) {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      const row = get('SELECT * FROM checkpoints WHERE id = ?', [checkpointId]);

      if (!row) {
        return null;
      }

      return this._rowToCheckpoint(row);

    } catch (error) {
      logger.error('Failed to export checkpoint:', error);
      throw error;
    }
  }

  /**
   * Export all checkpoints
   * @returns {Promise<Object>} Object with checkpoints array and metadata
   */
  async exportAll() {
    if (!this.initialized) {
      throw new Error('CheckpointManager not initialized');
    }

    try {
      const checkpoints = await this.list({ limit: 100 });

      return {
        exportedAt: new Date().toISOString(),
        count: checkpoints.length,
        checkpoints
      };

    } catch (error) {
      logger.error('Failed to export all checkpoints:', error);
      throw error;
    }
  }

  /**
   * Cleanup old checkpoints (keep only maxCheckpoints)
   * @private
   */
  async _cleanupOldCheckpoints() {
    try {
      // Count unrecovered checkpoints
      const countResult = get(
        'SELECT COUNT(*) as count FROM checkpoints WHERE recovered = 0'
      );

      const count = countResult?.count || 0;

      if (count > this.maxCheckpoints) {
        // Delete oldest unrecovered checkpoints (keep maxCheckpoints)
        const deleteResult = run(
          `DELETE FROM checkpoints WHERE id IN (
            SELECT id FROM checkpoints
            WHERE recovered = 0
            ORDER BY timestamp ASC
            LIMIT ?
          )`,
          [count - this.maxCheckpoints]
        );

        if (deleteResult.changes > 0) {
          logger.debug('Cleaned up old checkpoints', {
            deleted: deleteResult.changes
          });
        }
      }

      // Also clean up old recovered checkpoints (keep only 5)
      run(
        `DELETE FROM checkpoints WHERE id IN (
          SELECT id FROM checkpoints
          WHERE recovered = 1
          ORDER BY timestamp DESC
          LIMIT -1 OFFSET 5
        )`
      );

    } catch (error) {
      logger.error('Failed to cleanup old checkpoints:', error);
    }
  }

  /**
   * Convert database row to checkpoint object
   * @param {Object} row - Database row
   * @returns {Object} Checkpoint object
   * @private
   */
  _rowToCheckpoint(row) {
    return {
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      data: row.data ? JSON.parse(row.data) : {},
      task_type: row.task_type,
      task_progress: row.task_progress,
      position: row.position ? JSON.parse(row.position) : null,
      inventory: row.inventory ? JSON.parse(row.inventory) : [],
      recovered: Boolean(row.recovered)
    };
  }

  /**
   * Close checkpoint manager
   * - Stops auto checkpoint timer
   * - Saves final checkpoint if requested
   */
  async close() {
    this._stopAutoCheckpoint();
    this.initialized = false;
    this.lastCheckpoint = null;
    logger.info('CheckpointManager closed');
  }
}

export default CheckpointManager;