/**
 * Stuck Detector for ClawMC
 *
 * Detects when the bot is stuck based on position changes.
 * Supports whitelist for stationary tasks and task timeout detection.
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('StuckDetector');

/**
 * StuckDetector
 *
 * Monitors bot position to detect stuck situations.
 * Emits 'stuck' event when stuck condition is detected.
 */
export class StuckDetector {
  /**
   * Create a StuckDetector instance
   * @param {Object} options - Configuration options
   * @param {Object} options.bot - Mineflayer bot instance
   * @param {Object} options.stateManager - State manager instance
   * @param {number} options.checkInterval - Position check interval in ms (default: 5s)
   * @param {number} options.stuckThreshold - Consecutive checks without movement (default: 3)
   * @param {number} options.taskTimeout - Task timeout in ms (default: 30 min)
   * @param {number} options.minMovement - Minimum movement to be considered (default: 1 block)
   */
  constructor(options = {}) {
    this.bot = options.bot || null;
    this.stateManager = options.stateManager || null;
    this.checkInterval = options.checkInterval || 5000;
    this.stuckThreshold = options.stuckThreshold || 3;
    this.taskTimeout = options.taskTimeout || 1800000; // 30 minutes
    this.minMovement = options.minMovement || 1;

    this.timer = null;
    this.running = false;
    this.lastPosition = null;
    this.lastPositionTime = null;
    this.stuckCount = 0;
    this.taskStartTime = null;

    // Whitelist for tasks that don't require movement
    this.whitelist = new Set([
      'crafting',
      'storage',
      'furnace',
      'trading',
      'chatting',
      'waiting',
      'idle',
      'guard',
      'follow'
    ]);

    // Stats
    this.stats = {
      checksPerformed: 0,
      stuckEvents: 0,
      taskTimeouts: 0
    };
  }

  /**
   * Start stuck detection
   */
  start() {
    if (this.running) {
      logger.warn('StuckDetector already running');
      return;
    }

    this.running = true;
    this.stuckCount = 0;

    // Initialize position tracking
    this._updatePosition();

    // Start periodic check
    this.timer = setInterval(() => this.check(), this.checkInterval);

    logger.info('StuckDetector started', {
      checkInterval: this.checkInterval,
      stuckThreshold: this.stuckThreshold,
      taskTimeout: this.taskTimeout
    });
  }

  /**
   * Stop stuck detection
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.stuckCount = 0;
    this.lastPosition = null;
    this.lastPositionTime = null;

    logger.info('StuckDetector stopped');
  }

  /**
   * Perform stuck detection check
   * @returns {Object} Check result
   */
  check() {
    if (!this.running) {
      return { running: false };
    }

    this.stats.checksPerformed++;

    const result = {
      timestamp: new Date().toISOString(),
      position: this._getCurrentPosition(),
      isStuck: false,
      stuckReason: null,
      taskState: null,
      whitelisted: false
    };

    // Get current task
    const currentTask = this.stateManager?.currentTask;
    if (currentTask) {
      result.taskState = {
        type: currentTask.type,
        started: currentTask.started || this.taskStartTime
      };
    }

    // Check if current task is whitelisted
    if (currentTask && this.whitelist.has(currentTask.type)) {
      result.whitelisted = true;
      logger.debug('Task whitelisted, skipping stuck check', {
        task: currentTask.type
      });

      // Reset stuck count for whitelisted tasks
      this.stuckCount = 0;
      this._updatePosition();

      return result;
    }

    // Check task timeout
    if (this.taskStartTime || currentTask?.started) {
      const taskStart = currentTask?.started || this.taskStartTime;
      const taskElapsed = Date.now() - taskStart;

      if (taskElapsed > this.taskTimeout) {
        result.isStuck = true;
        result.stuckReason = 'task_timeout';
        this.stats.taskTimeouts++;

        logger.warn('Task timeout detected', {
          taskType: currentTask?.type,
          elapsed: taskElapsed,
          timeout: this.taskTimeout
        });

        this._emitStuck(result);
        return result;
      }
    }

    // Check position change
    const currentPosition = result.position;
    if (this.lastPosition && currentPosition) {
      const distance = this._calculateDistance(this.lastPosition, currentPosition);

      if (distance < this.minMovement) {
        this.stuckCount++;

        if (this.stuckCount >= this.stuckThreshold) {
          result.isStuck = true;
          result.stuckReason = 'no_movement';
          this.stats.stuckEvents++;

          logger.warn('Stuck detected - no movement', {
            stuckCount: this.stuckCount,
            threshold: this.stuckThreshold,
            position: currentPosition
          });

          this._emitStuck(result);
        }
      } else {
        // Movement detected, reset stuck count
        this.stuckCount = 0;
        logger.debug('Movement detected', { distance });
      }
    }

    // Update tracking
    this._updatePosition();

    // Update task start time if new task
    if (currentTask && !this.taskStartTime) {
      this.taskStartTime = currentTask.started || Date.now();
    }

    return result;
  }

  /**
   * Check if bot is currently stuck
   * @returns {boolean} True if stuck
   */
  isStuck() {
    return this.stuckCount >= this.stuckThreshold;
  }

  /**
   * Add task type to whitelist
   * @param {string} taskType - Task type to whitelist
   */
  addToWhitelist(taskType) {
    this.whitelist.add(taskType);
    logger.info('Added to whitelist', { taskType });
  }

  /**
   * Remove task type from whitelist
   * @param {string} taskType - Task type to remove
   */
  removeFromWhitelist(taskType) {
    this.whitelist.delete(taskType);
    logger.info('Removed from whitelist', { taskType });
  }

  /**
   * Reset task timer (call when new task starts)
   */
  resetTaskTimer() {
    this.taskStartTime = Date.now();
    this.stuckCount = 0;
    logger.debug('Task timer reset');
  }

  /**
   * Get current position from bot
   * @returns {Object|null} Position object or null
   * @private
   */
  _getCurrentPosition() {
    if (!this.bot?.entity?.position) {
      return null;
    }

    const pos = this.bot.entity.position;
    return {
      x: Math.floor(pos.x),
      y: Math.floor(pos.y),
      z: Math.floor(pos.z)
    };
  }

  /**
   * Update last position tracking
   * @private
   */
  _updatePosition() {
    this.lastPosition = this._getCurrentPosition();
    this.lastPositionTime = Date.now();
  }

  /**
   * Calculate distance between two positions
   * @param {Object} pos1 - First position
   * @param {Object} pos2 - Second position
   * @returns {number} Distance
   * @private
   */
  _calculateDistance(pos1, pos2) {
    if (!pos1 || !pos2) return 0;

    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Emit stuck event
   * @param {Object} result - Check result
   * @private
   */
  _emitStuck(result) {
    this.bot?.emit('stuck', {
      reason: result.stuckReason,
      position: result.position,
      stuckCount: this.stuckCount,
      taskState: result.taskState,
      timestamp: result.timestamp
    });

    // Reset after emitting
    if (result.stuckReason === 'task_timeout') {
      this.taskStartTime = null;
    }
  }

  /**
   * Export detector state for debugging
   * @returns {Object} Detector state
   */
  export() {
    return {
      running: this.running,
      lastPosition: this.lastPosition,
      lastPositionTime: this.lastPositionTime,
      stuckCount: this.stuckCount,
      taskStartTime: this.taskStartTime,
      whitelist: Array.from(this.whitelist),
      stats: { ...this.stats },
      config: {
        checkInterval: this.checkInterval,
        stuckThreshold: this.stuckThreshold,
        taskTimeout: this.taskTimeout,
        minMovement: this.minMovement
      }
    };
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
      checksPerformed: 0,
      stuckEvents: 0,
      taskTimeouts: 0
    };
    logger.info('Statistics reset');
  }
}

export default StuckDetector;