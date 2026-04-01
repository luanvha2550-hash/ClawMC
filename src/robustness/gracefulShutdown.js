/**
 * Graceful Shutdown for ClawMC
 *
 * Handles process signals and ensures proper cleanup.
 * Creates checkpoint before shutdown and cleans up resources.
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('GracefulShutdown');

/**
 * GracefulShutdown
 *
 * Manages proper application shutdown with:
 * - Signal handling (SIGINT, SIGTERM)
 * - Uncaught exception handling
 * - Unhandled rejection handling
 * - Checkpoint before shutdown
 * - Resource cleanup
 */
export class GracefulShutdown {
  /**
   * Create a GracefulShutdown instance
   * @param {Object} options - Configuration options
   * @param {Object} options.bot - Mineflayer bot instance
   * @param {Object} options.checkpointManager - CheckpointManager instance
   * @param {Object} options.stateManager - State manager instance
   * @param {number} options.timeout - Shutdown timeout in ms (default: 30s)
   * @param {boolean} options.checkpointOnShutdown - Create checkpoint on shutdown (default: true)
   */
  constructor(options = {}) {
    this.bot = options.bot || null;
    this.checkpointManager = options.checkpointManager || null;
    this.stateManager = options.stateManager || null;
    this.timeout = options.timeout || 30000;
    this.checkpointOnShutdown = options.checkpointOnShutdown ?? true;

    this.initialized = false;
    this.shuttingDown = false;
    this.handlers = new Map();
    this.cleanupTasks = [];

    // Track original handlers
    this._originalHandlers = {
      SIGINT: null,
      SIGTERM: null,
      uncaughtException: null,
      unhandledRejection: null
    };
  }

  /**
   * Initialize graceful shutdown
   * - Sets up signal handlers
   * - Sets up error handlers
   */
  init() {
    if (this.initialized) {
      logger.warn('GracefulShutdown already initialized');
      return;
    }

    // Store original handlers
    this._originalHandlers.SIGINT = process.listeners('SIGINT');
    this._originalHandlers.SIGTERM = process.listeners('SIGTERM');

    // Set up signal handlers
    this._setupSignalHandlers();

    // Set up error handlers
    this._setupErrorHandlers();

    this.initialized = true;
    logger.info('GracefulShutdown initialized', {
      timeout: this.timeout,
      checkpointOnShutdown: this.checkpointOnShutdown
    });
  }

  /**
   * Set up process signal handlers
   * @private
   */
  _setupSignalHandlers() {
    // Handle SIGINT (Ctrl+C)
    const sigintHandler = async () => {
      logger.info('SIGINT received');
      await this.shutdown('SIGINT');
    };

    // Handle SIGTERM
    const sigtermHandler = async () => {
      logger.info('SIGTERM received');
      await this.shutdown('SIGTERM');
    };

    // Remove existing handlers and add our own
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    this.handlers.set('SIGINT', sigintHandler);
    this.handlers.set('SIGTERM', sigtermHandler);

    logger.debug('Signal handlers registered');
  }

  /**
   * Set up error handlers
   * @private
   */
  _setupErrorHandlers() {
    // Handle uncaught exceptions
    const uncaughtHandler = async (error) => {
      logger.error('Uncaught exception:', error);
      await this.shutdown('uncaughtException', error);
    };

    // Handle unhandled rejections
    const rejectionHandler = async (reason, promise) => {
      logger.error('Unhandled rejection:', reason);
      await this.shutdown('unhandledRejection', reason);
    };

    process.on('uncaughtException', uncaughtHandler);
    process.on('unhandledRejection', rejectionHandler);

    this.handlers.set('uncaughtException', uncaughtHandler);
    this.handlers.set('unhandledRejection', rejectionHandler);

    logger.debug('Error handlers registered');
  }

  /**
   * Register a custom shutdown handler
   * @param {string} name - Handler name
   * @param {Function} handler - Async handler function
   */
  registerHandler(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.handlers.set(`custom:${name}`, handler);
    logger.debug('Custom handler registered', { name });
  }

  /**
   * Add a cleanup task to run during shutdown
   * @param {Function} task - Async cleanup function
   */
  addCleanupTask(task) {
    if (typeof task !== 'function') {
      throw new Error('Cleanup task must be a function');
    }

    this.cleanupTasks.push(task);
    logger.debug('Cleanup task added');
  }

  /**
   * Perform graceful shutdown
   * @param {string} reason - Shutdown reason
   * @param {Error} [error] - Error if shutdown due to error
   */
  async shutdown(reason = 'manual', error = null) {
    if (this.shuttingDown) {
      logger.warn('Already shutting down, ignoring duplicate request');
      return;
    }

    this.shuttingDown = true;
    const startTime = Date.now();

    logger.info('Starting graceful shutdown', {
      reason,
      error: error?.message
    });

    // Set shutdown timeout
    const timeoutId = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.timeout);

    try {
      // Run custom handlers
      await this._runCustomHandlers(reason, error);

      // Create checkpoint if enabled
      if (this.checkpointOnShutdown && this.checkpointManager) {
        await this._createCheckpoint(reason);
      }

      // Run cleanup tasks
      await this._runCleanupTasks();

      // Close bot connection
      await this._closeBot();

      // Close checkpoint manager
      if (this.checkpointManager) {
        await this.checkpointManager.close();
      }

      const duration = Date.now() - startTime;
      logger.info('Shutdown complete', { duration, reason });

      clearTimeout(timeoutId);

      // Exit with appropriate code
      const exitCode = error ? 1 : 0;
      process.exit(exitCode);

    } catch (shutdownError) {
      logger.error('Error during shutdown:', shutdownError);
      clearTimeout(timeoutId);
      process.exit(1);
    }
  }

  /**
   * Run custom handlers
   * @param {string} reason - Shutdown reason
   * @param {Error} [error] - Error if applicable
   * @private
   */
  async _runCustomHandlers(reason, error) {
    const customHandlers = Array.from(this.handlers.entries())
      .filter(([key]) => key.startsWith('custom:'));

    for (const [name, handler] of customHandlers) {
      try {
        await handler(reason, error);
        logger.debug('Custom handler completed', { name });
      } catch (handlerError) {
        logger.error('Custom handler failed:', { name, error: handlerError.message });
      }
    }
  }

  /**
   * Create checkpoint before shutdown
   * @param {string} reason - Shutdown reason
   * @private
   */
  async _createCheckpoint(reason) {
    try {
      if (!this.checkpointManager.initialized) {
        logger.debug('CheckpointManager not initialized, skipping checkpoint');
        return;
      }

      const checkpointId = await this.checkpointManager.save('shutdown', {
        reason,
        timestamp: new Date().toISOString()
      });

      logger.info('Shutdown checkpoint created', { checkpointId });

    } catch (error) {
      logger.error('Failed to create shutdown checkpoint:', error);
    }
  }

  /**
   * Run cleanup tasks
   * @private
   */
  async _runCleanupTasks() {
    logger.debug('Running cleanup tasks', { count: this.cleanupTasks.length });

    for (const task of this.cleanupTasks) {
      try {
        await task();
      } catch (error) {
        logger.error('Cleanup task failed:', error);
      }
    }
  }

  /**
   * Close bot connection
   * @private
   */
  async _closeBot() {
    if (!this.bot) {
      return;
    }

    try {
      // Emit shutdown event for other systems
      this.bot.emit('graceful_shutdown');

      // End bot connection
      if (typeof this.bot.end === 'function') {
        this.bot.end();
      }

      logger.debug('Bot connection closed');

    } catch (error) {
      logger.error('Error closing bot connection:', error);
    }
  }

  /**
   * Check if currently shutting down
   * @returns {boolean} True if shutting down
   */
  isShuttingDown() {
    return this.shuttingDown;
  }

  /**
   * Get shutdown status
   * @returns {Object} Shutdown status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      shuttingDown: this.shuttingDown,
      handlersCount: this.handlers.size,
      cleanupTasksCount: this.cleanupTasks.length,
      checkpointOnShutdown: this.checkpointOnShutdown
    };
  }

  /**
   * Restore original handlers (for testing)
   */
  restoreOriginalHandlers() {
    // Remove our handlers
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    // Restore original handlers
    if (this._originalHandlers.SIGINT) {
      this._originalHandlers.SIGINT.forEach(handler => {
        process.on('SIGINT', handler);
      });
    }

    if (this._originalHandlers.SIGTERM) {
      this._originalHandlers.SIGTERM.forEach(handler => {
        process.on('SIGTERM', handler);
      });
    }

    logger.debug('Original handlers restored');
  }
}

export default GracefulShutdown;