// src/robustness/index.js
// Robustness Layer - Main entry point for all robustness components

import { MetricsCollector, createMetricsCollector, getMetricsCollector } from './metrics.js';
import { EventLogger, LogLevel, createEventLogger, getEventLogger } from './eventLog.js';
import { AlertSystem, AlertSeverity, AlertState, createAlertSystem, getAlertSystem } from './alerts.js';
import { OperationStateMachine, OperationState, createOperationStateMachine, getOperationStateMachine } from './stateMachine.js';
import { CheckpointManager } from './checkpoint.js';
import { DeathRecovery } from './deathRecovery.js';
import { StuckDetector } from './stuckDetector.js';
import { GracefulShutdown } from './gracefulShutdown.js';
import { getLogger } from '../utils/logger.js';

/**
 * RobustnessLayer
 *
 * Main entry point for the robustness system. Coordinates all robustness
 * components and provides convenience methods for logging and monitoring.
 *
 * Features:
 * - Unified initialization of all robustness components
 * - Convenience methods for common operations
 * - Health monitoring and reporting
 * - Coordinated shutdown handling
 */
export class RobustnessLayer {
  /**
   * Create a RobustnessLayer instance
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      metricsUpdateInterval: config.metricsUpdateInterval || 30000,
      positionUpdateInterval: config.positionUpdateInterval || 10000,
      flushInterval: config.flushInterval || 5000,
      healthReportInterval: config.healthReportInterval || 60000,
      ...config
    };

    this.logger = config.logger || getLogger();
    this.log = this.logger.module('RobustnessLayer');

    // Component instances
    this.metrics = null;
    this.eventLog = null;
    this.alerts = null;
    this.stateMachine = null;
    this.checkpoint = null;
    this.deathRecovery = null;
    this.stuckDetector = null;
    this.gracefulShutdown = null;

    // Timer references
    this.timers = {
      metricsUpdate: null,
      positionUpdate: null,
      flush: null,
      healthReport: null
    };

    this.initialized = false;
    this.bot = null;
    this.db = null;
    this.state = null;
    this.memory = null;
  }

  /**
   * Initialize all robustness components
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} db - Database instance
   * @param {Object} state - State manager instance
   * @param {Object} memory - Memory system instance
   * @returns {Promise<RobustnessLayer>} This instance
   */
  async init(bot, db, state, memory) {
    if (this.initialized) {
      this.log.warn('RobustnessLayer already initialized');
      return this;
    }

    this.bot = bot;
    this.db = db;
    this.state = state;
    this.memory = memory;

    try {
      this.log.info('Initializing RobustnessLayer...');

      // Initialize metrics collector
      this.metrics = new MetricsCollector({ logger: this.logger });
      this.log.debug('MetricsCollector created');

      // Initialize event logger
      this.eventLog = new EventLogger({
        logger: this.logger,
        logDir: this.config.logDir || './logs',
        flushInterval: this.config.flushInterval
      });
      await this.eventLog.init();
      this.log.debug('EventLogger initialized');

      // Initialize alert system
      this.alerts = new AlertSystem({
        logger: this.logger,
        ...this.config.alerts
      });
      this.log.debug('AlertSystem created');

      // Initialize state machine
      this.stateMachine = new OperationStateMachine({ logger: this.logger });
      this.log.debug('OperationStateMachine created');

      // Initialize checkpoint manager
      this.checkpoint = new CheckpointManager({
        bot: this.bot,
        stateManager: this.state,
        interval: this.config.checkpointInterval || 300000,
        maxCheckpoints: this.config.maxCheckpoints || 10
      });
      await this.checkpoint.init();
      this.log.debug('CheckpointManager initialized');

      // Initialize death recovery
      this.deathRecovery = new DeathRecovery({
        bot: this.bot,
        checkpointManager: this.checkpoint,
        maxAttempts: this.config.maxDeathAttempts || 3,
        recoveryDelay: this.config.recoveryDelay || 5000
      });
      await this.deathRecovery.init();
      this.log.debug('DeathRecovery initialized');

      // Initialize stuck detector
      this.stuckDetector = new StuckDetector({
        bot: this.bot,
        stateManager: this.state,
        checkInterval: this.config.stuckCheckInterval || 5000,
        stuckThreshold: this.config.stuckThreshold || 3,
        taskTimeout: this.config.taskTimeout || 1800000
      });
      this.stuckDetector.start();
      this.log.debug('StuckDetector started');

      // Initialize graceful shutdown
      this.gracefulShutdown = new GracefulShutdown({
        bot: this.bot,
        checkpointManager: this.checkpoint,
        stateManager: this.state,
        timeout: this.config.shutdownTimeout || 30000,
        checkpointOnShutdown: this.config.checkpointOnShutdown ?? true
      });
      this.gracefulShutdown.init();
      this.log.debug('GracefulShutdown initialized');

      // Start monitoring
      this._startMonitoring();

      this.initialized = true;
      this.log.info('RobustnessLayer initialized successfully');

      return this;

    } catch (error) {
      this.log.error('Failed to initialize RobustnessLayer:', error);
      throw error;
    }
  }

  /**
   * Start all monitoring timers
   * @private
   */
  _startMonitoring() {
    // Metrics update timer
    this.timers.metricsUpdate = setInterval(() => {
      this.metrics.updateMemoryMetrics();
      const metricsData = this.metrics.getStats();
      this.alerts.check(metricsData);
    }, this.config.metricsUpdateInterval);

    // Position update timer (for death recovery)
    if (this.bot) {
      this.timers.positionUpdate = setInterval(() => {
        // Update last known position for death recovery
        if (this.bot.entity?.position) {
          this.bot._lastPosition = {
            x: Math.floor(this.bot.entity.position.x),
            y: Math.floor(this.bot.entity.position.y),
            z: Math.floor(this.bot.entity.position.z)
          };
        }
        // Update last known inventory for death recovery
        if (this.bot.inventory?.items) {
          this.bot._lastInventory = this.bot.inventory.items().map(item => ({
            name: item.name,
            count: item.count,
            slot: item.slot
          }));
        }
      }, this.config.positionUpdateInterval);
    }

    // Flush timer for event log
    this.timers.flush = setInterval(() => {
      this.eventLog.flush().catch(err => {
        this.log.error('Event log flush failed:', err);
      });
    }, this.config.flushInterval);

    // Health report timer
    this.timers.healthReport = setInterval(() => {
      this._reportHealth();
    }, this.config.healthReportInterval);

    this.log.debug('Monitoring timers started');
  }

  /**
   * Report health status
   * @private
   */
  _reportHealth() {
    const health = this.getHealth();

    this.log.info('Health report', {
      status: health.status,
      uptime: health.uptime,
      memory: health.memory,
      alerts: health.alerts.length
    });

    // Log to event log
    this.eventLog.info('robustness', 'health_check', {
      status: health.status,
      uptime: health.uptime,
      memoryUsageMB: health.memory?.heapUsedMB,
      alertCount: health.alerts.length
    });
  }

  /**
   * Get current health status
   * @returns {Object} Health status object
   */
  getHealth() {
    const metrics = this.metrics.getStats();
    const activeAlerts = this.alerts.getActiveAlerts();

    // Determine overall status
    let status = 'healthy';
    if (activeAlerts.length > 0) {
      const hasCritical = activeAlerts.some(a => a.severity === AlertSeverity.CRITICAL);
      status = hasCritical ? 'critical' : 'degraded';
    }

    // Check memory pressure
    const memUsage = process.memoryUsage();
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        heapUsedMB: metrics.gauges.heapUsedMB,
        heapTotalMB: metrics.gauges.heapTotalMB,
        heapUsagePercent: Math.round(heapUsagePercent * 100) / 100
      },
      rates: {
        skillSuccessRate: metrics.rates.skillSuccessRate,
        llmErrorRate: metrics.rates.llmErrorRate
      },
      alerts: activeAlerts,
      stateMachine: this.stateMachine.getState(),
      stuckDetector: this.stuckDetector.export(),
      lastCheckpoint: this.checkpoint.lastCheckpoint
    };
  }

  /**
   * Log an LLM API call
   * Convenience method that updates metrics and logs event
   * @param {string} provider - LLM provider name
   * @param {string} model - Model name
   * @param {number} promptTokens - Tokens in prompt
   * @param {number} completionTokens - Tokens in completion
   * @param {number} durationMs - Call duration in milliseconds
   * @param {boolean} success - Whether the call succeeded
   */
  logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success = true) {
    // Update metrics
    this.metrics.increment('llmCalls');
    this.metrics.increment('llmTokensUsed', promptTokens + completionTokens);
    if (!success) {
      this.metrics.increment('llmErrors');
    }
    this.metrics.recordResponseTime(durationMs, 'llm');

    // Log event
    this.eventLog.logLLMCall(provider, model, promptTokens + completionTokens, durationMs, success);
  }

  /**
   * Log a skill execution
   * Convenience method that updates metrics and logs event
   * @param {string} skill - Skill name
   * @param {Object} params - Skill parameters
   * @param {number} durationMs - Execution duration in milliseconds
   * @param {boolean} success - Whether execution succeeded
   * @param {string} error - Error message if failed
   */
  logSkillExecution(skill, params, durationMs, success = true, error = null) {
    // Update metrics
    this.metrics.increment('skillExecutions');
    if (success) {
      this.metrics.increment('skillSuccesses');
    } else {
      this.metrics.increment('skillFailures');
    }
    this.metrics.recordTaskDuration(durationMs, skill, success);

    // Log event
    this.eventLog.logSkillExecution(skill, durationMs, success, error);
  }

  /**
   * Restore from latest checkpoint
   * @returns {Promise<Object|null>} Restored checkpoint data or null
   */
  async restoreFromCheckpoint() {
    try {
      // Acquire lock for recovery operation
      const acquisition = await this.stateMachine.acquire('recovery', 'restoreFromCheckpoint');

      if (!acquisition.acquired) {
        this.log.warn('Could not acquire lock for checkpoint restore');
        return null;
      }

      try {
        const checkpoint = await this.checkpoint.loadLatest();

        if (!checkpoint) {
          this.log.info('No checkpoint found to restore');
          return null;
        }

        this.log.info('Restoring from checkpoint', {
          id: checkpoint.id,
          type: checkpoint.type,
          position: checkpoint.position
        });

        const restored = await this.checkpoint.restore(checkpoint.id);

        this.eventLog.info('robustness', 'checkpoint_restored', {
          id: checkpoint.id,
          type: checkpoint.type
        });

        return restored;

      } finally {
        this.stateMachine.release('restoreFromCheckpoint', { success: true });
      }

    } catch (error) {
      this.log.error('Failed to restore from checkpoint:', error);
      return null;
    }
  }

  /**
   * Create a manual checkpoint
   * @param {Object} additionalData - Additional data to include
   * @returns {Promise<number>} Checkpoint ID
   */
  async createCheckpoint(additionalData = {}) {
    try {
      const id = await this.checkpoint.save('manual', additionalData);
      this.eventLog.info('robustness', 'checkpoint_created', { id, type: 'manual' });
      return id;
    } catch (error) {
      this.log.error('Failed to create checkpoint:', error);
      throw error;
    }
  }

  /**
   * Handle bot death event
   * Called when bot dies - records death and initiates recovery
   * @returns {Promise<Object|null>} Death record or null
   */
  async handleDeath() {
    this.metrics.increment('deaths');

    const deathRecord = await this.deathRecovery.handleDeath();

    if (deathRecord) {
      // Create death checkpoint
      await this.checkpoint.save('death', {
        deathId: deathRecord.id,
        position: deathRecord.position
      });
    }

    return deathRecord;
  }

  /**
   * Attempt recovery from death
   * @param {number} deathRecordId - Death record ID (optional)
   * @returns {Promise<Object|null>} Recovery result or null
   */
  async attemptRecovery(deathRecordId = null) {
    return this.deathRecovery.attemptRecovery(deathRecordId);
  }

  /**
   * Check if bot is stuck
   * @returns {boolean} True if stuck
   */
  isBotStuck() {
    return this.stuckDetector.isStuck();
  }

  /**
   * Check if system is shutting down
   * @returns {boolean} True if shutting down
   */
  isShuttingDown() {
    return this.gracefulShutdown.isShuttingDown();
  }

  /**
   * Register a shutdown handler
   * @param {string} name - Handler name
   * @param {Function} handler - Async handler function
   */
  registerShutdownHandler(name, handler) {
    this.gracefulShutdown.registerHandler(name, handler);
  }

  /**
   * Add a cleanup task for shutdown
   * @param {Function} task - Async cleanup function
   */
  addCleanupTask(task) {
    this.gracefulShutdown.addCleanupTask(task);
  }

  /**
   * Register an alert action
   * @param {string} alertName - Alert name
   * @param {Function} action - Action function
   */
  registerAlertAction(alertName, action) {
    this.alerts.registerAction(alertName, action);
  }

  /**
   * Add a task to the stuck detector whitelist
   * @param {string} taskType - Task type to whitelist
   */
  whitelistTask(taskType) {
    this.stuckDetector.addToWhitelist(taskType);
  }

  /**
   * Get current metrics
   * @returns {Object} Metrics data
   */
  getMetrics() {
    return this.metrics.getStats();
  }

  /**
   * Get current alerts
   * @returns {Array} Active alerts
   */
  getAlerts() {
    return this.alerts.getActiveAlerts();
  }

  /**
   * Export all robustness data for debugging
   * @returns {Object} Exported data
   */
  export() {
    return {
      timestamp: new Date().toISOString(),
      health: this.getHealth(),
      metrics: this.metrics.export(),
      alerts: this.alerts.getActiveAlerts(),
      stateMachine: this.stateMachine.getState(),
      stuckDetector: this.stuckDetector.export(),
      lastCheckpoint: this.checkpoint.lastCheckpoint
    };
  }

  /**
   * Close all robustness components
   * Stops timers and closes resources
   */
  async close() {
    this.log.info('Closing RobustnessLayer...');

    // Stop timers
    for (const [name, timer] of Object.entries(this.timers)) {
      if (timer) {
        clearInterval(timer);
        this.log.debug(`Timer ${name} stopped`);
      }
    }

    // Stop stuck detector
    if (this.stuckDetector) {
      this.stuckDetector.stop();
    }

    // Close event logger
    if (this.eventLog) {
      await this.eventLog.close();
    }

    // Close checkpoint manager
    if (this.checkpoint) {
      await this.checkpoint.close();
    }

    this.initialized = false;
    this.log.info('RobustnessLayer closed');
  }

  /**
   * Force shutdown (emergency use only)
   * @param {string} reason - Reason for shutdown
   */
  async forceShutdown(reason = 'emergency') {
    this.log.warn('Force shutdown initiated', { reason });
    this.stateMachine.forceShutdown(reason);
    await this.gracefulShutdown.shutdown(reason);
  }
}

/**
 * Create a RobustnessLayer instance
 * @param {Object} config - Configuration options
 * @returns {RobustnessLayer} New RobustnessLayer instance
 */
export function createRobustnessLayer(config) {
  return new RobustnessLayer(config);
}

// Singleton instance
let instance = null;

/**
 * Get the singleton RobustnessLayer instance
 * @returns {RobustnessLayer} RobustnessLayer instance
 */
export function getRobustnessLayer() {
  if (!instance) {
    instance = new RobustnessLayer();
  }
  return instance;
}

/**
 * Initialize the robustness layer
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} db - Database instance
 * @param {Object} state - State manager instance
 * @param {Object} memory - Memory system instance
 * @param {Object} config - Configuration options
 * @returns {Promise<RobustnessLayer>} Initialized RobustnessLayer
 */
export async function initializeRobustnessLayer(bot, db, state, memory, config = {}) {
  const layer = getRobustnessLayer();

  // Apply config
  Object.assign(layer.config, config);

  await layer.init(bot, db, state, memory);
  return layer;
}

/**
 * Shutdown the robustness layer
 */
export async function shutdownRobustnessLayer() {
  if (instance) {
    await instance.close();
    instance = null;
  }
}

// Export all components
export {
  MetricsCollector,
  createMetricsCollector,
  getMetricsCollector,
  EventLogger,
  LogLevel,
  createEventLogger,
  getEventLogger,
  AlertSystem,
  AlertSeverity,
  AlertState,
  createAlertSystem,
  getAlertSystem,
  OperationStateMachine,
  OperationState,
  createOperationStateMachine,
  getOperationStateMachine,
  CheckpointManager,
  DeathRecovery,
  StuckDetector,
  GracefulShutdown
};

export default RobustnessLayer;