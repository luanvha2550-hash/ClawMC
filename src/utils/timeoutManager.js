import { getLogger } from './logger.js';

/**
 * TimeoutManager - Centralized timeout management
 *
 * Provides:
 * - Promise wrapping with timeout (withTimeout)
 * - Manual timeout creation (createTimeout)
 * - Timeout cancellation (cancel, cancelAll, clearAll)
 * - Default timeouts for operation types
 * - Singleton pattern for global access
 */
class TimeoutManager {
  constructor() {
    this.timeouts = new Map();
    this.logger = getLogger().module('TimeoutManager');

    this.defaults = {
      skill: 30000,           // 30 seconds for skill execution
      compilation: 5000,       // 5 seconds for code compilation
      llm: 60000,              // 60 seconds for LLM calls
      pathfinding: 120000,     // 2 minutes for pathfinding
      checkpoint: 10000,       // 10 seconds for checkpoint operations
      reconnection: 30000,     // 30 seconds for reconnection
      task: 1800000            // 30 minutes for long tasks
    };
  }

  /**
   * Execute promise with timeout
   * @param {Promise} promise - The promise to execute
   * @param {number} ms - Timeout in milliseconds
   * @param {string} operation - Operation name for error messages
   * @returns {Promise} - The promise result or timeout rejection
   */
  async withTimeout(promise, ms, operation = 'operation') {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operation} timeout após ${ms}ms`));
      }, ms);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Create a timeout
   * @param {Function} callback - Function to call when timeout fires
   * @param {number} ms - Timeout in milliseconds
   * @param {string} operation - Operation name for tracking
   * @returns {Object} - Timeout identifier
   */
  createTimeout(callback, ms, operation) {
    const timeoutId = setTimeout(() => {
      this.logger.debug(`${operation} executado após ${ms}ms`);
      this.timeouts.delete(timeoutId);
      callback();
    }, ms);

    this.timeouts.set(timeoutId, { operation, ms, callback });
    return timeoutId;
  }

  /**
   * Cancel a specific timeout
   * @param {Object} timeoutId - The timeout identifier to cancel
   * @returns {boolean} - True if timeout was cancelled, false if not found
   */
  cancel(timeoutId) {
    if (this.timeouts.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.timeouts.delete(timeoutId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all timeouts for an operation
   * @param {string} operation - Operation name to cancel
   */
  cancelAll(operation) {
    for (const [timeoutId, info] of this.timeouts) {
      if (info.operation === operation) {
        clearTimeout(timeoutId);
        this.timeouts.delete(timeoutId);
      }
    }
  }

  /**
   * Get default timeout for operation type
   * @param {string} type - Operation type
   * @returns {number} - Default timeout in milliseconds
   */
  getDefault(type) {
    return this.defaults[type] || 30000;
  }

  /**
   * Set default timeout for operation type
   * @param {string} type - Operation type
   * @param {number} ms - Timeout in milliseconds
   */
  setDefault(type, ms) {
    this.defaults[type] = ms;
  }

  /**
   * Clear all timeouts
   */
  clearAll() {
    for (const timeoutId of this.timeouts.keys()) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
  }

  /**
   * Get active timeout count
   * @returns {number} - Number of active timeouts
   */
  getActiveCount() {
    return this.timeouts.size;
  }

  /**
   * Get all active operations
   * @returns {Object} - Map of operation names to counts
   */
  getActiveOperations() {
    const operations = new Map();
    for (const [, info] of this.timeouts) {
      const count = operations.get(info.operation) || 0;
      operations.set(info.operation, count + 1);
    }
    return Object.fromEntries(operations);
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton TimeoutManager instance
 * @returns {TimeoutManager} - The singleton instance
 */
export function getTimeoutManager() {
  if (!instance) {
    instance = new TimeoutManager();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTimeoutManager() {
  if (instance) {
    instance.clearAll();
    instance = null;
  }
}

export { TimeoutManager };