// src/robustness/alerts.js

import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger.js';

/**
 * Alert severity levels
 */
export const AlertSeverity = {
  WARNING: 'warning',
  CRITICAL: 'critical'
};

/**
 * Alert states
 */
export const AlertState = {
  RAISING: 'raising',    // Condition detected, waiting for raiseAfter
  ACTIVE: 'active',     // Alert is active
  RESOLVING: 'resolving', // Condition cleared, waiting for resolveAfter
  RESOLVED: 'resolved'   // Alert resolved
};

/**
 * AlertSystem - Manages alerts with hysteresis and cooldown
 *
 * Features:
 * - Hysteresis: requires N consecutive checks to raise/resolve
 * - Cooldown: prevents repeated alerts for same condition
 * - Threshold-based alerting for common metrics
 * - Action registration for alert responses
 */
export class AlertSystem extends EventEmitter {
  constructor(config = {}) {
    super();

    this.logger = config.logger || getLogger();
    this.log = this.logger.module('alerts');

    // Configuration
    this.defaultRaiseAfter = config.raiseAfter || 3;
    this.defaultResolveAfter = config.resolveAfter || 2;
    this.defaultCooldown = config.cooldown || 60000; // 1 minute

    // Thresholds
    this.thresholds = {
      memoryHigh: config.memoryHigh || 85,       // 85% heap usage
      memoryCritical: config.memoryCritical || 91, // 91% heap usage
      llmErrorRate: config.llmErrorRate || 20,   // 20% error rate
      skillFailureRate: config.skillFailureRate || 30 // 30% failure rate
    };

    // Alert definitions
    this.alertDefs = new Map();

    // Active alerts state
    this.alertStates = new Map();

    // Cooldown tracking
    this.lastAlertTime = new Map();

    // Registered actions
    this.actions = new Map();

    // Initialize default alert definitions
    this._initDefaultAlerts();
  }

  /**
   * Initialize default alert definitions
   * @private
   */
  _initDefaultAlerts() {
    this.defineAlert('memory_high', {
      check: () => this.checkMemory(this.thresholds.memoryHigh),
      severity: AlertSeverity.WARNING,
      message: 'Memory usage is high',
      raiseAfter: 3,
      resolveAfter: 2,
      cooldown: 30000
    });

    this.defineAlert('memory_critical', {
      check: () => this.checkMemory(this.thresholds.memoryCritical),
      severity: AlertSeverity.CRITICAL,
      message: 'Memory usage is critical',
      raiseAfter: 2,
      resolveAfter: 3,
      cooldown: 10000
    });

    this.defineAlert('llm_error_rate', {
      check: (metrics) => this.checkLLMErrorRate(metrics, this.thresholds.llmErrorRate),
      severity: AlertSeverity.WARNING,
      message: 'LLM error rate is high',
      raiseAfter: 3,
      resolveAfter: 2,
      cooldown: 60000
    });

    this.defineAlert('skill_failure_rate', {
      check: (metrics) => this.checkSkillFailureRate(metrics, this.thresholds.skillFailureRate),
      severity: AlertSeverity.WARNING,
      message: 'Skill failure rate is high',
      raiseAfter: 3,
      resolveAfter: 2,
      cooldown: 60000
    });
  }

  /**
   * Define a new alert
   * @param {string} name - Alert name
   * @param {object} definition - Alert definition
   */
  defineAlert(name, definition) {
    this.alertDefs.set(name, {
      name,
      severity: definition.severity || AlertSeverity.WARNING,
      message: definition.message || name,
      check: definition.check,
      raiseAfter: definition.raiseAfter || this.defaultRaiseAfter,
      resolveAfter: definition.resolveAfter || this.defaultResolveAfter,
      cooldown: definition.cooldown || this.defaultCooldown,
      data: definition.data || {}
    });

    // Initialize state
    this.alertStates.set(name, {
      state: AlertState.RESOLVED,
      counter: 0,
      lastCheck: null
    });
  }

  /**
   * Register an action to be called when an alert is raised
   * @param {string} alertName - Alert name
   * @param {Function} action - Action function
   */
  registerAction(alertName, action) {
    if (!this.actions.has(alertName)) {
      this.actions.set(alertName, []);
    }
    this.actions.get(alertName).push(action);
  }

  /**
   * Check all alerts and update states
   * @param {object} metrics - Current metrics from MetricsCollector
   * @returns {object} Check results
   */
  check(metrics = {}) {
    const results = {};

    for (const [name, def] of this.alertDefs) {
      results[name] = this._checkAlert(name, def, metrics);
    }

    return results;
  }

  /**
   * Check a single alert
   * @private
   */
  _checkAlert(name, def, metrics) {
    const state = this.alertStates.get(name);
    const now = Date.now();

    // Check cooldown
    const lastAlert = this.lastAlertTime.get(name) || 0;
    if (now - lastAlert < def.cooldown && state.state === AlertState.RESOLVED) {
      return { name, state: state.state, skipped: true, reason: 'cooldown' };
    }

    // Run the check function
    let conditionMet = false;
    try {
      conditionMet = def.check(metrics);
    } catch (e) {
      this.log.error(`Alert check failed for ${name}`, { error: e.message });
      return { name, state: state.state, error: e.message };
    }

    state.lastCheck = now;

    // State machine logic with hysteresis
    if (conditionMet) {
      if (state.state === AlertState.RESOLVED) {
        state.state = AlertState.RAISING;
        state.counter = 1;
        // Check if we've already hit raiseAfter (e.g., raiseAfter: 1)
        if (state.counter >= def.raiseAfter) {
          this._processAlert(name, def, state);
        }
      } else if (state.state === AlertState.RAISING) {
        state.counter++;
        if (state.counter >= def.raiseAfter) {
          this._processAlert(name, def, state);
        }
      } else if (state.state === AlertState.RESOLVING) {
        // Condition came back, go back to active
        state.state = AlertState.ACTIVE;
        state.counter = 0;
      }
    } else {
      if (state.state === AlertState.ACTIVE) {
        state.state = AlertState.RESOLVING;
        state.counter = 1;
      } else if (state.state === AlertState.RESOLVING) {
        state.counter++;
        if (state.counter >= def.resolveAfter) {
          this._resolveAlert(name, def, state);
        }
      } else if (state.state === AlertState.RAISING) {
        // Condition cleared before alert was raised
        state.state = AlertState.RESOLVED;
        state.counter = 0;
      }
    }

    return {
      name,
      state: state.state,
      counter: state.counter,
      conditionMet
    };
  }

  /**
   * Process an alert being raised
   * @private
   */
  _processAlert(name, def, state) {
    state.state = AlertState.ACTIVE;
    state.counter = 0;
    this.lastAlertTime.set(name, Date.now());

    const alertData = {
      name,
      severity: def.severity,
      message: def.message,
      timestamp: new Date().toISOString(),
      ...def.data
    };

    this.log.warn(`Alert raised: ${name}`, alertData);
    this.emit('alert', alertData);

    // Execute registered actions
    const actions = this.actions.get(name) || [];
    for (const action of actions) {
      try {
        action(alertData);
      } catch (e) {
        this.log.error(`Action failed for alert ${name}`, { error: e.message });
      }
    }
  }

  /**
   * Process an alert being resolved
   * @private
   */
  _resolveAlert(name, def, state) {
    state.state = AlertState.RESOLVED;
    state.counter = 0;

    const resolveData = {
      name,
      message: def.message,
      timestamp: new Date().toISOString()
    };

    this.log.info(`Alert resolved: ${name}`, resolveData);
    this.emit('resolved', resolveData);
  }

  /**
   * Check memory usage against threshold
   * @param {number} threshold - Memory percentage threshold
   * @returns {boolean} True if threshold exceeded
   */
  checkMemory(threshold) {
    const memUsage = process.memoryUsage();
    const percentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    return percentage >= threshold;
  }

  /**
   * Check LLM error rate against threshold
   * @param {object} metrics - Metrics object with rates
   * @param {number} threshold - Error rate threshold
   * @returns {boolean} True if threshold exceeded
   */
  checkLLMErrorRate(metrics, threshold) {
    if (!metrics.counters) return false;

    const totalCalls = metrics.counters.llmCalls || 0;
    const errors = metrics.counters.llmErrors || 0;

    if (totalCalls < 5) return false; // Need minimum sample size

    const errorRate = (errors / totalCalls) * 100;
    return errorRate >= threshold;
  }

  /**
   * Check skill failure rate against threshold
   * @param {object} metrics - Metrics object with rates
   * @param {number} threshold - Failure rate threshold
   * @returns {boolean} True if threshold exceeded
   */
  checkSkillFailureRate(metrics, threshold) {
    if (!metrics.counters) return false;

    const successes = metrics.counters.skillSuccesses || 0;
    const failures = metrics.counters.skillFailures || 0;
    const total = successes + failures;

    if (total < 5) return false; // Need minimum sample size

    const failureRate = (failures / total) * 100;
    return failureRate >= threshold;
  }

  /**
   * Manually process an alert (for testing or manual triggers)
   * @param {string} name - Alert name
   * @param {object} data - Additional data
   */
  processAlert(name, data = {}) {
    const def = this.alertDefs.get(name);
    const state = this.alertStates.get(name);

    if (!def || !state) {
      this.log.warn(`Unknown alert: ${name}`);
      return;
    }

    this._processAlert(name, def, state);
  }

  /**
   * Manually resolve an alert
   * @param {string} name - Alert name
   */
  resolveAlert(name) {
    const def = this.alertDefs.get(name);
    const state = this.alertStates.get(name);

    if (!def || !state) {
      this.log.warn(`Unknown alert: ${name}`);
      return;
    }

    this._resolveAlert(name, def, state);
  }

  /**
   * Get all active alerts
   * @returns {object[]} Array of active alert data
   */
  getActiveAlerts() {
    const active = [];

    for (const [name, state] of this.alertStates) {
      if (state.state === AlertState.ACTIVE || state.state === AlertState.RESOLVING) {
        const def = this.alertDefs.get(name);
        active.push({
          name,
          severity: def.severity,
          message: def.message,
          state: state.state,
          lastCheck: state.lastCheck
        });
      }
    }

    return active;
  }

  /**
   * Reset all alert states
   */
  reset() {
    for (const [name] of this.alertStates) {
      this.alertStates.set(name, {
        state: AlertState.RESOLVED,
        counter: 0,
        lastCheck: null
      });
    }
    this.lastAlertTime.clear();
    this.emit('reset');
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new AlertSystem instance
 * @param {object} config - Configuration options
 * @returns {AlertSystem} New AlertSystem instance
 */
export function createAlertSystem(config) {
  instance = new AlertSystem(config);
  return instance;
}

/**
 * Get the singleton AlertSystem instance
 * @returns {AlertSystem} AlertSystem instance
 */
export function getAlertSystem() {
  if (!instance) {
    instance = new AlertSystem();
  }
  return instance;
}

export default AlertSystem;