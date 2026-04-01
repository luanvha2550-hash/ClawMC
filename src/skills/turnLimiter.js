// src/skills/turnLimiter.js
// TurnLimiter - Retry control for skill execution and LLM generation

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('TurnLimiter');

// Default configuration
const DEFAULT_CONFIG = {
  maxAttempts: 3,           // Maximum retry attempts per cycle
  maxRepeatedErrors: 1,     // Max times same error can repeat
  fallbackThreshold: 2      // Failures before fallback is recommended
};

/**
 * TurnLimiter
 *
 * Manages retry control for skill execution and LLM generation cycles.
 * Tracks attempts, errors, and provides error context for re-prompting.
 */
class TurnLimiter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Current cycle state
    this.currentTask = null;
    this.attempts = 0;
    this.errors = [];
    this.errorCounts = new Map(); // Track repeated errors

    // Statistics
    this.stats = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      totalAttempts: 0
    };
  }

  /**
   * Start a new generation/execution cycle
   * @param {Object} task - Task being executed
   * @returns {Object} Cycle info { cycleId, task }
   */
  startGeneration(task) {
    // Reset for new cycle
    this.currentTask = task;
    this.attempts = 0;
    this.errors = [];
    this.errorCounts.clear();

    this.stats.totalCycles++;

    const cycleInfo = {
      cycleId: this.stats.totalCycles,
      task
    };

    logger.debug(`Started cycle ${cycleInfo.cycleId}`, { task: task?.type || 'unknown' });
    return cycleInfo;
  }

  /**
   * Check if retry is allowed
   * @param {Error} error - The error that occurred
   * @returns {Object} { canRetry, reason, remainingAttempts }
   */
  canRetry(error) {
    const errorMessage = error?.message || String(error);

    // Check max attempts
    if (this.attempts >= this.config.maxAttempts) {
      return {
        canRetry: false,
        reason: 'max_attempts_reached',
        remainingAttempts: 0
      };
    }

    // Check for repeated errors
    const errorKey = this._getErrorKey(errorMessage);
    const repeatedCount = this.errorCounts.get(errorKey) || 0;

    if (repeatedCount >= this.config.maxRepeatedErrors) {
      return {
        canRetry: false,
        reason: 'repeated_error',
        remainingAttempts: 0,
        errorCount: repeatedCount + 1
      };
    }

    return {
      canRetry: true,
      reason: null,
      remainingAttempts: this.config.maxAttempts - this.attempts - 1
    };
  }

  /**
   * Record an error attempt
   * @param {Error} error - The error that occurred
   * @returns {Object} Error tracking info
   */
  recordError(error) {
    this.attempts++;
    this.stats.totalAttempts++;

    const errorMessage = error?.message || String(error);
    const errorInfo = {
      attempt: this.attempts,
      message: errorMessage,
      timestamp: Date.now()
    };

    this.errors.push(errorInfo);

    // Track error signature for repeated error detection
    const errorKey = this._getErrorKey(errorMessage);
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    logger.warn(`Error recorded (attempt ${this.attempts})`, { error: errorMessage });

    return {
      attempt: this.attempts,
      errorKey,
      repeatedCount: this.errorCounts.get(errorKey)
    };
  }

  /**
   * Record successful completion
   * @returns {Object} Success info
   */
  recordSuccess() {
    this.stats.successfulCycles++;

    const result = {
      attempts: this.attempts,
      cycleId: this.stats.totalCycles
    };

    logger.debug(`Cycle ${result.cycleId} completed successfully`, { attempts: this.attempts });

    this._resetCycle();
    return result;
  }

  /**
   * Generate error context for re-prompting
   * @returns {Object} Error context for LLM re-prompting
   */
  generateErrorContext() {
    if (this.errors.length === 0) {
      return null;
    }

    const lastError = this.errors[this.errors.length - 1];
    const errorSummary = this._summarizeErrors();

    return {
      lastError: lastError.message,
      allErrors: this.errors.map(e => e.message),
      attempts: this.attempts,
      maxAttempts: this.config.maxAttempts,
      repeatedErrors: this._getRepeatedErrors(),
      summary: errorSummary,
      suggestion: this._generateSuggestion(errorSummary)
    };
  }

  /**
   * Handle when max attempts is reached
   * @returns {Object} Failure info with error details
   */
  handleLimitReached() {
    this.stats.failedCycles++;

    const failureInfo = {
      cycleId: this.stats.totalCycles,
      attempts: this.attempts,
      errors: this.errors,
      finalError: this.errors.length > 0 ? this.errors[this.errors.length - 1].message : null,
      errorSummary: this._summarizeErrors()
    };

    logger.error(`Cycle ${failureInfo.cycleId} failed - limit reached`, {
      attempts: this.attempts,
      errorCount: this.errors.length
    });

    this._resetCycle();
    return failureInfo;
  }

  /**
   * Check if fallback skill should be used
   * @returns {boolean} True if fallback recommended
   */
  shouldUseFallback() {
    // Recommend fallback after configured number of failures
    return this.attempts >= this.config.fallbackThreshold;
  }

  /**
   * Get current status
   * @returns {Object} Current limiter status
   */
  getStatus() {
    return {
      currentTask: this.currentTask,
      attempts: this.attempts,
      remainingAttempts: Math.max(0, this.config.maxAttempts - this.attempts),
      errors: this.errors,
      canRetry: this.attempts < this.config.maxAttempts,
      shouldUseFallback: this.shouldUseFallback(),
      stats: { ...this.stats }
    };
  }

  /**
   * Reset the limiter for a fresh start
   */
  reset() {
    this._resetCycle();
    this.stats = {
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      totalAttempts: 0
    };
    logger.debug('TurnLimiter reset');
  }

  // --- Private methods ---

  /**
   * Get a key for error comparison (normalized error message)
   * @private
   */
  _getErrorKey(errorMessage) {
    // Normalize error message for comparison
    // Remove specific values but keep error type
    return errorMessage
      .toLowerCase()
      .replace(/\d+/g, 'N')           // Replace numbers
      .replace(/'[^']*'/g, 'STR')      // Replace strings
      .replace(/"[^"]*"/g, 'STR')
      .slice(0, 100);                  // Limit length
  }

  /**
   * Summarize all errors
   * @private
   */
  _summarizeErrors() {
    if (this.errors.length === 0) return null;

    const uniqueErrors = new Set(this.errors.map(e => e.message));
    const errorTypes = {};

    for (const error of this.errors) {
      const type = this._categorizeError(error.message);
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    }

    return {
      total: this.errors.length,
      unique: uniqueErrors.size,
      types: errorTypes
    };
  }

  /**
   * Categorize error by type
   * @private
   */
  _categorizeError(message) {
    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes('timeout')) return 'timeout';
    if (lowerMsg.includes('not found')) return 'not_found';
    if (lowerMsg.includes('invalid')) return 'validation';
    if (lowerMsg.includes('permission')) return 'permission';
    if (lowerMsg.includes('network') || lowerMsg.includes('connection')) return 'network';
    if (lowerMsg.includes('memory') || lowerMsg.includes('heap')) return 'memory';

    return 'unknown';
  }

  /**
   * Get repeated errors
   * @private
   */
  _getRepeatedErrors() {
    const repeated = [];
    for (const [key, count] of this.errorCounts) {
      if (count > 1) {
        repeated.push({ key, count });
      }
    }
    return repeated;
  }

  /**
   * Generate suggestion based on error summary
   * @private
   */
  _generateSuggestion(summary) {
    if (!summary) return null;

    const { types } = summary;

    if (types.timeout) {
      return 'Consider increasing timeout or simplifying the task';
    }
    if (types.not_found) {
      return 'The target may not exist or be unreachable';
    }
    if (types.validation) {
      return 'Check skill parameters and retry with valid values';
    }
    if (types.network) {
      return 'Network issue - may need to retry later';
    }
    if (types.memory) {
      return 'Memory pressure - consider clearing caches or reducing scope';
    }

    return 'Review error details and adjust approach';
  }

  /**
   * Reset cycle state
   * @private
   */
  _resetCycle() {
    this.currentTask = null;
    this.attempts = 0;
    this.errors = [];
    this.errorCounts.clear();
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new TurnLimiter instance
 * @param {Object} config - Configuration options
 * @returns {TurnLimiter} New TurnLimiter instance
 */
export function createTurnLimiter(config) {
  instance = new TurnLimiter(config);
  return instance;
}

/**
 * Get the singleton TurnLimiter instance
 * @returns {TurnLimiter} TurnLimiter instance
 */
export function getTurnLimiter() {
  if (!instance) {
    instance = new TurnLimiter();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTurnLimiter() {
  instance = null;
}

export { TurnLimiter };
export default TurnLimiter;