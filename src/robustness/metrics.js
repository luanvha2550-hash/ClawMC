// src/robustness/metrics.js

import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger.js';

/**
 * MetricsCollector - Collects and aggregates metrics for ClawMC
 *
 * Features:
 * - Counters for events (LLM calls, skill executions, etc.)
 * - Gauges for current state (memory usage, active tasks)
 * - Bounded history for time-series data
 * - Export functionality for monitoring
 */
export class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.logger = config.logger || getLogger();
    this.log = this.logger.module('metrics');

    // Configuration
    this.maxResponseTimeHistory = config.maxResponseTimeHistory || 100;
    this.maxTaskDurationHistory = config.maxTaskDurationHistory || 50;

    // Counters - monotonically increasing
    this.counters = {
      llmCalls: 0,
      llmTokensUsed: 0,
      llmErrors: 0,
      skillExecutions: 0,
      skillSuccesses: 0,
      skillFailures: 0,
      messagesReceived: 0,
      messagesSent: 0,
      deaths: 0,
      disconnects: 0,
      reconnects: 0
    };

    // Gauges - current state values
    this.gauges = {
      heapUsedMB: 0,
      heapTotalMB: 0,
      activeTasks: 0,
      dbSizeMB: 0
    };

    // Bounded history arrays
    this.responseTimeHistory = [];
    this.taskDurationHistory = [];

    // Start time for uptime calculation
    this.startTime = Date.now();
  }

  /**
   * Increment a counter by a specified amount
   * @param {string} name - Counter name
   * @param {number} amount - Amount to increment (default: 1)
   */
  increment(name, amount = 1) {
    if (!(name in this.counters)) {
      this.log.warn(`Unknown counter: ${name}`);
      return;
    }

    this.counters[name] += amount;
    this.emit('counter', { name, value: this.counters[name], delta: amount });
  }

  /**
   * Set a gauge to a specific value
   * @param {string} name - Gauge name
   * @param {number} value - Value to set
   */
  setGauge(name, value) {
    if (!(name in this.gauges)) {
      this.log.warn(`Unknown gauge: ${name}`);
      return;
    }

    const oldValue = this.gauges[name];
    this.gauges[name] = value;
    this.emit('gauge', { name, value, oldValue });
  }

  /**
   * Record a response time measurement
   * @param {number} timeMs - Response time in milliseconds
   * @param {string} type - Type of response (llm, api, etc.)
   */
  recordResponseTime(timeMs, type = 'llm') {
    const entry = {
      time: timeMs,
      type,
      timestamp: Date.now()
    };

    this.responseTimeHistory.push(entry);

    // Enforce bounded history
    if (this.responseTimeHistory.length > this.maxResponseTimeHistory) {
      this.responseTimeHistory.shift();
    }

    this.emit('responseTime', entry);
  }

  /**
   * Record a task duration measurement
   * @param {number} durationMs - Duration in milliseconds
   * @param {string} taskName - Name of the task
   * @param {boolean} success - Whether the task succeeded
   */
  recordTaskDuration(durationMs, taskName, success = true) {
    const entry = {
      duration: durationMs,
      taskName,
      success,
      timestamp: Date.now()
    };

    this.taskDurationHistory.push(entry);

    // Enforce bounded history
    if (this.taskDurationHistory.length > this.maxTaskDurationHistory) {
      this.taskDurationHistory.shift();
    }

    this.emit('taskDuration', entry);
  }

  /**
   * Update memory-related gauges from process.memoryUsage()
   */
  updateMemoryMetrics() {
    const memUsage = process.memoryUsage();

    this.setGauge('heapUsedMB', Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100);
    this.setGauge('heapTotalMB', Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100);
  }

  /**
   * Get statistics summary
   * @returns {object} Statistics object
   */
  getStats() {
    // Calculate response time statistics
    const responseTimes = this.responseTimeHistory.map(e => e.time);
    const responseTimeStats = this._calculateStats(responseTimes);

    // Calculate task duration statistics
    const taskDurations = this.taskDurationHistory.map(e => e.duration);
    const taskDurationStats = this._calculateStats(taskDurations);

    // Calculate success rates
    const totalSkillExecs = this.counters.skillSuccesses + this.counters.skillFailures;
    const skillSuccessRate = totalSkillExecs > 0
      ? (this.counters.skillSuccesses / totalSkillExecs * 100).toFixed(2)
      : 0;

    const totalLLMCalls = this.counters.llmCalls;
    const llmErrorRate = totalLLMCalls > 0
      ? (this.counters.llmErrors / totalLLMCalls * 100).toFixed(2)
      : 0;

    return {
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      rates: {
        skillSuccessRate: parseFloat(skillSuccessRate),
        llmErrorRate: parseFloat(llmErrorRate)
      },
      responseTime: responseTimeStats,
      taskDuration: taskDurationStats,
      historySizes: {
        responseTime: this.responseTimeHistory.length,
        taskDuration: this.taskDurationHistory.length
      }
    };
  }

  /**
   * Export metrics in a format suitable for external monitoring
   * @returns {object} Exportable metrics
   */
  export() {
    const stats = this.getStats();
    return {
      timestamp: new Date().toISOString(),
      ...stats
    };
  }

  /**
   * Reset all counters and histories
   */
  reset() {
    // Reset counters
    for (const key of Object.keys(this.counters)) {
      this.counters[key] = 0;
    }

    // Reset gauges
    for (const key of Object.keys(this.gauges)) {
      this.gauges[key] = 0;
    }

    // Clear histories
    this.responseTimeHistory = [];
    this.taskDurationHistory = [];

    // Reset start time
    this.startTime = Date.now();

    this.emit('reset');
    this.log.info('Metrics reset');
  }

  /**
   * Calculate statistics for an array of numbers
   * @private
   * @param {number[]} values - Array of numbers
   * @returns {object} Statistics object
   */
  _calculateStats(values) {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, median: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / values.length * 100) / 100,
      median: sorted[Math.floor(sorted.length / 2)],
      count: values.length
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new MetricsCollector instance
 * @param {object} config - Configuration options
 * @returns {MetricsCollector} New MetricsCollector instance
 */
export function createMetricsCollector(config) {
  instance = new MetricsCollector(config);
  return instance;
}

/**
 * Get the singleton MetricsCollector instance
 * @returns {MetricsCollector} MetricsCollector instance
 */
export function getMetricsCollector() {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

export default MetricsCollector;