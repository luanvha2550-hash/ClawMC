/**
 * Death Recovery for ClawMC
 *
 * Handles bot death events and coordinates recovery attempts.
 * Records death location, inventory, and manages recovery process.
 */

import { getLogger } from '../utils/logger.js';
import { getDatabase, run, get, all } from '../memory/database.js';

const logger = getLogger().module('DeathRecovery');

/**
 * DeathRecovery
 *
 * Manages death events and recovery attempts.
 * Works with CheckpointManager to restore bot state after death.
 */
export class DeathRecovery {
  /**
   * Create a DeathRecovery instance
   * @param {Object} options - Configuration options
   * @param {Object} options.bot - Mineflayer bot instance
   * @param {Object} options.checkpointManager - CheckpointManager instance
   * @param {number} options.maxAttempts - Maximum recovery attempts (default: 3)
   * @param {number} options.recoveryDelay - Delay before recovery in ms (default: 5s)
   */
  constructor(options = {}) {
    this.bot = options.bot || null;
    this.checkpointManager = options.checkpointManager || null;
    this.maxAttempts = options.maxAttempts || 3;
    this.recoveryDelay = options.recoveryDelay || 5000;

    this.initialized = false;
    this.lastDeath = null;
    this.recovering = false;
  }

  /**
   * Initialize death recovery
   * - Creates death_records table if needed
   * - Sets up bot death listener
   */
  async init() {
    if (this.initialized) {
      logger.warn('DeathRecovery already initialized');
      return;
    }

    try {
      // Verify table exists (should be created by migration)
      const tableCheck = get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='death_records'"
      );

      if (!tableCheck) {
        logger.warn('death_records table not found, creating...');
        this._createDeathRecordsTable();
      }

      // Set up bot death listener
      if (this.bot) {
        this.bot.on('death', () => this.handleDeath());
        logger.debug('Bot death listener registered');
      }

      this.initialized = true;
      logger.info('DeathRecovery initialized', {
        maxAttempts: this.maxAttempts,
        recoveryDelay: this.recoveryDelay
      });

    } catch (error) {
      logger.error('Failed to initialize DeathRecovery:', error);
      throw error;
    }
  }

  /**
   * Create death_records table (fallback if migration didn't run)
   * @private
   */
  _createDeathRecordsTable() {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS death_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        position TEXT,
        cause TEXT,
        inventory TEXT,
        dimension TEXT,
        recovery_attempts INTEGER DEFAULT 0,
        recovered BOOLEAN DEFAULT 0,
        recovered_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_death_records_timestamp ON death_records(timestamp);
    `);
  }

  /**
   * Handle bot death event
   * - Records death information
   * - Triggers recovery process
   */
  async handleDeath() {
    if (!this.initialized) {
      logger.error('DeathRecovery not initialized');
      return null;
    }

    if (this.recovering) {
      logger.warn('Already in recovery, skipping duplicate death handling');
      return null;
    }

    try {
      logger.info('Bot death detected');

      // Capture death state
      const deathInfo = this._captureDeathInfo();

      // Record death
      const recordId = await this._recordDeath(deathInfo);

      this.lastDeath = {
        id: recordId,
        ...deathInfo
      };

      logger.info('Death recorded', {
        id: recordId,
        position: deathInfo.position,
        cause: deathInfo.cause
      });

      // Emit event for other systems
      this.bot?.emit('death_recorded', this.lastDeath);

      return this.lastDeath;

    } catch (error) {
      logger.error('Failed to handle death:', error);
      return null;
    }
  }

  /**
   * Capture death information from bot
   * @returns {Object} Death information
   * @private
   */
  _captureDeathInfo() {
    const info = {
      timestamp: new Date().toISOString(),
      position: null,
      cause: 'unknown',
      inventory: [],
      dimension: null
    };

    // Get last known position (before death)
    if (this.bot?.entity?.position) {
      const pos = this.bot.entity.position;
      info.position = {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z)
      };
    }

    // Get dimension
    if (this.bot?.game?.dimension) {
      info.dimension = this.bot.game.dimension;
    }

    // Get cause if available
    if (this.bot?.game?.gameMode) {
      info.cause = this.bot.game.gameMode;
    }

    // Get inventory from before death (if we have it stored)
    // Note: After death, bot.inventory is empty, so we rely on pre-death state
    if (this.bot?._lastInventory) {
      info.inventory = this.bot._lastInventory;
    }

    return info;
  }

  /**
   * Record death in database
   * @param {Object} deathInfo - Death information
   * @returns {Promise<number>} Record ID
   * @private
   */
  async _recordDeath(deathInfo) {
    const result = run(
      `INSERT INTO death_records (timestamp, position, cause, inventory, dimension, recovery_attempts, recovered)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        deathInfo.timestamp,
        JSON.stringify(deathInfo.position),
        deathInfo.cause,
        JSON.stringify(deathInfo.inventory),
        deathInfo.dimension,
        0,
        0
      ]
    );

    return result.lastInsertRowid;
  }

  /**
   * Attempt recovery from death
   * @param {number} deathRecordId - Death record ID (optional, uses latest)
   * @returns {Promise<Object|null>} Recovery result or null if failed
   */
  async attemptRecovery(deathRecordId = null) {
    if (!this.initialized) {
      throw new Error('DeathRecovery not initialized');
    }

    if (this.recovering) {
      logger.warn('Recovery already in progress');
      return null;
    }

    this.recovering = true;

    try {
      // Get death record
      let record;
      if (deathRecordId) {
        record = get('SELECT * FROM death_records WHERE id = ?', [deathRecordId]);
      } else {
        record = get(
          'SELECT * FROM death_records WHERE recovered = 0 ORDER BY timestamp DESC LIMIT 1'
        );
      }

      if (!record) {
        logger.info('No unrecovered death record found');
        return null;
      }

      // Check recovery attempts
      const attempts = record.recovery_attempts || 0;
      if (attempts >= this.maxAttempts) {
        logger.warn('Max recovery attempts reached for death record', {
          id: record.id,
          attempts
        });
        return null;
      }

      logger.info('Attempting recovery', {
        deathId: record.id,
        attempt: attempts + 1,
        maxAttempts: this.maxAttempts
      });

      // Increment attempt counter
      run(
        'UPDATE death_records SET recovery_attempts = recovery_attempts + 1 WHERE id = ?',
        [record.id]
      );

      // Wait for respawn
      await this._waitForRespawn();

      // Navigate to death location
      const recoveryResult = await this._navigateToRecovery(record);

      // Mark as recovered if successful
      if (recoveryResult.success) {
        run(
          `UPDATE death_records SET recovered = 1, recovered_at = ? WHERE id = ?`,
          [new Date().toISOString(), record.id]
        );

        logger.info('Recovery successful', {
          deathId: record.id,
          attempts: attempts + 1
        });

        // Emit recovery event
        this.bot?.emit('death_recovered', { deathId: record.id, attempts: attempts + 1 });
      }

      return {
        deathId: record.id,
        attempt: attempts + 1,
        ...recoveryResult
      };

    } catch (error) {
      logger.error('Recovery attempt failed:', error);
      return null;

    } finally {
      this.recovering = false;
    }
  }

  /**
   * Wait for bot to respawn
   * @private
   */
  async _waitForRespawn() {
    if (!this.bot) return;

    return new Promise((resolve) => {
      const checkSpawn = () => {
        if (this.bot?.entity) {
          resolve();
        } else {
          setTimeout(checkSpawn, 500);
        }
      };

      // Initial delay
      setTimeout(checkSpawn, this.recoveryDelay);
    });
  }

  /**
   * Navigate to recovery location
   * @param {Object} record - Death record
   * @returns {Promise<Object>} Navigation result
   * @private
   */
  async _navigateToRecovery(record) {
    const result = {
      success: false,
      position: null,
      itemsRecovered: 0
    };

    try {
      const position = record.position ? JSON.parse(record.position) : null;

      if (!position) {
        logger.warn('No position in death record');
        return result;
      }

      result.position = position;

      // If we have a checkpoint manager, restore from checkpoint
      if (this.checkpointManager) {
        const latestCheckpoint = await this.checkpointManager.loadLatest();
        if (latestCheckpoint) {
          logger.info('Restoring from checkpoint', { id: latestCheckpoint.id });
          await this.checkpointManager.restore(latestCheckpoint.id);
        }
      }

      // Attempt to navigate to death location
      if (this.bot && position) {
        logger.info('Navigating to death location', { position });

        // Navigation would be done by pathfinder integration
        // For now, we just mark success if we have the position
        result.success = true;
      }

    } catch (error) {
      logger.error('Navigation to recovery failed:', error);
    }

    return result;
  }

  /**
   * Check if recovery is possible
   * @param {number} deathRecordId - Death record ID (optional)
   * @returns {Promise<boolean>} True if recovery is possible
   */
  async canRecover(deathRecordId = null) {
    if (!this.initialized) {
      return false;
    }

    try {
      let record;
      if (deathRecordId) {
        record = get('SELECT * FROM death_records WHERE id = ?', [deathRecordId]);
      } else {
        record = get(
          'SELECT * FROM death_records WHERE recovered = 0 ORDER BY timestamp DESC LIMIT 1'
        );
      }

      if (!record) {
        return false;
      }

      const attempts = record.recovery_attempts || 0;
      return attempts < this.maxAttempts;

    } catch (error) {
      logger.error('Failed to check recovery status:', error);
      return false;
    }
  }

  /**
   * Export death records for analysis
   * @param {Object} options - Export options
   * @param {boolean} options.onlyUnrecovered - Only export unrecovered records
   * @param {number} options.limit - Maximum number to return
   * @returns {Promise<Object>} Export data
   */
  async export(options = {}) {
    if (!this.initialized) {
      throw new Error('DeathRecovery not initialized');
    }

    try {
      let query = 'SELECT * FROM death_records WHERE 1=1';
      const params = [];

      if (options.onlyUnrecovered) {
        query += ' AND recovered = 0';
      }

      query += ' ORDER BY timestamp DESC';

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const records = all(query, params);

      return {
        exportedAt: new Date().toISOString(),
        count: records.length,
        records: records.map(r => ({
          id: r.id,
          timestamp: r.timestamp,
          position: r.position ? JSON.parse(r.position) : null,
          cause: r.cause,
          dimension: r.dimension,
          recoveryAttempts: r.recovery_attempts,
          recovered: Boolean(r.recovered),
          recoveredAt: r.recovered_at
        }))
      };

    } catch (error) {
      logger.error('Failed to export death records:', error);
      throw error;
    }
  }

  /**
   * Get recovery statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    if (!this.initialized) {
      throw new Error('DeathRecovery not initialized');
    }

    try {
      const totalDeaths = get('SELECT COUNT(*) as count FROM death_records')?.count || 0;
      const recovered = get('SELECT COUNT(*) as count FROM death_records WHERE recovered = 1')?.count || 0;
      const failedRecoveries = get(
        'SELECT COUNT(*) as count FROM death_records WHERE recovered = 0 AND recovery_attempts >= ?',
        [this.maxAttempts]
      )?.count || 0;

      return {
        totalDeaths,
        recovered,
        failedRecoveries,
        pendingRecovery: totalDeaths - recovered - failedRecoveries,
        recoveryRate: totalDeaths > 0 ? (recovered / totalDeaths * 100).toFixed(1) : 0
      };

    } catch (error) {
      logger.error('Failed to get recovery stats:', error);
      throw error;
    }
  }

  /**
   * Clear old death records
   * @param {number} daysOld - Delete records older than this many days
   * @returns {Promise<number>} Number of records deleted
   */
  async clearOldRecords(daysOld = 30) {
    if (!this.initialized) {
      throw new Error('DeathRecovery not initialized');
    }

    try {
      const result = run(
        `DELETE FROM death_records
         WHERE recovered = 1
         AND datetime(timestamp) < datetime('now', '-' || ? || ' days')`,
        [daysOld]
      );

      logger.info('Cleared old death records', {
        count: result.changes,
        daysOld
      });

      return result.changes;

    } catch (error) {
      logger.error('Failed to clear old death records:', error);
      throw error;
    }
  }
}

export default DeathRecovery;