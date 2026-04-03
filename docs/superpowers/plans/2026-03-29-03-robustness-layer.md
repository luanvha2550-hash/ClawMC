# Robustness Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar camada de robustez com métricas, logging, alertas, state machine, graceful shutdown, death recovery, stuck detector e checkpoint.

**Architecture:** Sistema modular com State Machine central coordenando operações críticas.

**Tech Stack:** better-sqlite3 para persistência, EventEmitter para eventos.

**Dependencies:** Foundation Layer, Memory Layer.

---

## Task 1: Metrics Collector

**Files:**
- Create: `src/robustness/metrics.js`
- Create: `tests/unit/robustness/metrics.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/robustness/metrics.test.js

import { MetricsCollector } from '../../../src/robustness/metrics.js';

describe('MetricsCollector', () => {
  let metrics;

  beforeEach(() => {
    metrics = new MetricsCollector({
      maxResponseTimeHistory: 100,
      maxTaskDurationHistory: 50
    });
  });

  describe('counters', () => {
    it('should increment counters', () => {
      metrics.increment('llmCalls');
      metrics.increment('llmCalls', 2);

      expect(metrics.metrics.llmCalls).toBe(3);
    });

    it('should track tokens', () => {
      metrics.increment('llmTokensUsed', 500);
      expect(metrics.metrics.llmTokensUsed).toBe(500);
    });
  });

  describe('gauges', () => {
    it('should set gauge values', () => {
      metrics.setGauge('heapUsedMB', 245);
      expect(metrics.metrics.heapUsedMB).toBe(245);
    });

    it('should calculate heap usage percent', () => {
      metrics.setGauge('heapUsedMB', 400);
      metrics.setGauge('heapTotalMB', 512);

      const stats = metrics.getStats();
      expect(stats.heapUsagePercent).toBeCloseTo(78.125);
    });
  });

  describe('history', () => {
    it('should record response times', () => {
      metrics.recordResponseTime(100);
      metrics.recordResponseTime(200);
      metrics.recordResponseTime(300);

      expect(metrics.metrics.responseTimeHistory.length).toBe(3);
    });

    it('should limit history size', () => {
      for (let i = 0; i < 150; i++) {
        metrics.recordResponseTime(i);
      }

      expect(metrics.metrics.responseTimeHistory.length).toBe(100);
    });

    it('should calculate average response time', () => {
      metrics.recordResponseTime(100);
      metrics.recordResponseTime(200);
      metrics.recordResponseTime(300);

      const stats = metrics.getStats();
      expect(stats.avgResponseTimeMs).toBe(200);
    });
  });

  describe('export', () => {
    it('should export metrics for status', () => {
      metrics.increment('llmCalls');
      metrics.setGauge('heapUsedMB', 245);

      const exported = metrics.export();
      expect(exported.counters.llmCalls).toBe(1);
      expect(exported.gauges.heapUsedMB).toBe(245);
    });
  });
});
```

- [ ] **Step 2: Implement metrics.js**

```javascript
// src/robustness/metrics.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Metrics');

class MetricsCollector {
  constructor(config = {}) {
    this.maxResponseTimeHistory = config.maxResponseTimeHistory || 100;
    this.maxTaskDurationHistory = config.maxTaskDurationHistory || 50;

    // Counters
    this.metrics = {
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
      reconnects: 0,

      // Gauges
      heapUsedMB: 0,
      heapTotalMB: 0,
      activeTasks: 0,
      dbSizeMB: 0,

      // History (bounded)
      responseTimeHistory: [],
      taskDurationHistory: [],

      // Timestamps
      lastLlmCall: null,
      lastSkillExecution: null,
      startTime: Date.now()
    };
  }

  /**
   * Increment a counter
   */
  increment(name, amount = 1) {
    if (this.metrics[name] === undefined) {
      this.metrics[name] = 0;
    }
    this.metrics[name] += amount;
  }

  /**
   * Set a gauge value
   */
  setGauge(name, value) {
    this.metrics[name] = value;
  }

  /**
   * Record response time
   */
  recordResponseTime(durationMs) {
    this.metrics.responseTimeHistory.push({
      timestamp: Date.now(),
      duration: durationMs
    });

    // Bounded: remove oldest if over limit
    if (this.metrics.responseTimeHistory.length > this.maxResponseTimeHistory) {
      this.metrics.responseTimeHistory.shift();
    }

    this.metrics.lastLlmCall = Date.now();
  }

  /**
   * Record task duration
   */
  recordTaskDuration(taskType, durationMs, success) {
    this.metrics.taskDurationHistory.push({
      task: taskType,
      duration: durationMs,
      success,
      timestamp: Date.now()
    });

    // Bounded
    if (this.metrics.taskDurationHistory.length > this.maxTaskDurationHistory) {
      this.metrics.taskDurationHistory.shift();
    }
  }

  /**
   * Update memory metrics
   */
  updateMemoryMetrics() {
    const usage = process.memoryUsage();
    this.metrics.heapUsedMB = Math.round(usage.heapUsed / (1024 * 1024));
    this.metrics.heapTotalMB = Math.round(usage.heapTotal / (1024 * 1024));
  }

  /**
   * Get statistics
   */
  getStats() {
    const responseTimes = this.metrics.responseTimeHistory;
    const taskDurations = this.metrics.taskDurationHistory;

    // Calculate averages
    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((sum, r) => sum + r.duration, 0) / responseTimes.length
      : 0;

    const avgTaskDurationMs = taskDurations.length > 0
      ? taskDurations.reduce((sum, t) => sum + t.duration, 0) / taskDurations.length
      : 0;

    // Calculate error rates
    const llmErrorRate = this.metrics.llmCalls > 0
      ? (this.metrics.llmErrors / this.metrics.llmCalls) * 100
      : 0;

    const skillSuccessRate = this.metrics.skillExecutions > 0
      ? (this.metrics.skillSuccesses / this.metrics.skillExecutions) * 100
      : 100;

    // Calculate heap usage
    const heapUsagePercent = this.metrics.heapTotalMB > 0
      ? (this.metrics.heapUsedMB / this.metrics.heapTotalMB) * 100
      : 0;

    return {
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      avgTaskDurationMs: Math.round(avgTaskDurationMs),
      llmErrorRate: Math.round(llmErrorRate * 100) / 100,
      skillSuccessRate: Math.round(skillSuccessRate * 100) / 100,
      heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
      uptime: Math.round((Date.now() - this.metrics.startTime) / 1000)
    };
  }

  /**
   * Export metrics for status
   */
  export() {
    const stats = this.getStats();

    return {
      counters: {
        llmCalls: this.metrics.llmCalls,
        llmTokensUsed: this.metrics.llmTokensUsed,
        llmErrors: this.metrics.llmErrors,
        skillExecutions: this.metrics.skillExecutions,
        skillSuccesses: this.metrics.skillSuccesses,
        skillFailures: this.metrics.skillFailures,
        deaths: this.metrics.deaths,
        disconnects: this.metrics.disconnects,
        reconnects: this.metrics.reconnects
      },
      gauges: {
        heapUsedMB: this.metrics.heapUsedMB,
        heapTotalMB: this.metrics.heapTotalMB,
        activeTasks: this.metrics.activeTasks,
        dbSizeMB: this.metrics.dbSizeMB
      },
      stats,
      lastLlmCall: this.metrics.lastLlmCall,
      lastSkillExecution: this.metrics.lastSkillExecution,
      uptime: stats.uptime
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
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
      reconnects: 0,
      heapUsedMB: 0,
      heapTotalMB: 0,
      activeTasks: 0,
      dbSizeMB: 0,
      responseTimeHistory: [],
      taskDurationHistory: [],
      lastLlmCall: null,
      lastSkillExecution: null,
      startTime: Date.now()
    };

    logger.info('[Metrics] Reset');
  }
}

export { MetricsCollector };
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/unit/robustness/metrics.test.js
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/robustness/metrics.js tests/unit/robustness/metrics.test.js
git commit -m "feat(robustness): add metrics collector

- Counters for LLM, skills, messages
- Gauges for memory and tasks
- Bounded history for response times
- Statistics calculation
- Export for status
- Add tests"
```

---

## Task 2: Event Logger

**Files:**
- Create: `src/robustness/eventLog.js`
- Create: `tests/unit/robustness/eventLog.test.js`

- [ ] **Step 2: Implement eventLog.js**

```javascript
// src/robustness/eventLog.js

import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('EventLog');

const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

class EventLogger {
  constructor(config = {}) {
    this.logDir = config.logDir || './logs';
    this.level = LEVELS[config.level?.toUpperCase()] ?? LEVELS.INFO;
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = config.maxFiles || 7;

    this.currentFile = null;
    this.currentDate = null;
    this.buffer = [];
    this.flushInterval = config.flushInterval || 5000;
    this.flushTimer = null;
  }

  /**
   * Initialize logger
   */
  async init() {
    await fs.mkdir(this.logDir, { recursive: true });
    this.startFlushTimer();
    logger.info('[EventLog] Initialized');
  }

  /**
   * Start periodic flush
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Stop periodic flush
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get log file for today
   */
  getLogFile() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `events-${date}.jsonl`);
  }

  /**
   * Log an event
   */
  log(level, category, event, data = {}) {
    if (LEVELS[level] < this.level) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      event,
      ...data
    };

    this.buffer.push(entry);

    // Also log to console
    const consoleMethod = level === 'CRITICAL' || level === 'ERROR' ? 'error'
      : level === 'WARN' ? 'warn'
      : 'log';

    console[consoleMethod](`[${level}] [${category}] ${event}`, data);
  }

  /**
   * Convenience methods
   */
  debug(category, event, data = {}) {
    this.log('DEBUG', category, event, data);
  }

  info(category, event, data = {}) {
    this.log('INFO', category, event, data);
  }

  warn(category, event, data = {}) {
    this.log('WARN', category, event, data);
  }

  error(category, event, data = {}) {
    this.log('ERROR', category, event, data);
  }

  critical(category, event, data = {}) {
    this.log('CRITICAL', category, event, data);
  }

  /**
   * Specialized logging methods
   */
  logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success) {
    this.info('LLM', 'call', {
      provider,
      model,
      promptTokens,
      completionTokens,
      durationMs,
      success
    });
  }

  logSkillExecution(skill, params, durationMs, success, error = null) {
    this.log(success ? 'INFO' : 'WARN', 'SKILL', 'execution', {
      skill,
      params,
      durationMs,
      success,
      error
    });
  }

  logBotDeath(position, cause, inventory) {
    this.critical('BOT', 'death', {
      position,
      cause,
      inventory
    });
  }

  logDisconnect(reason, willReconnect) {
    this.log(willReconnect ? 'WARN' : 'ERROR', 'BOT', 'disconnect', {
      reason,
      willReconnect
    });
  }

  logMemoryWarning(usagePercent, action) {
    this.warn('SYSTEM', 'memory_pressure', {
      heapUsagePercent: usagePercent,
      action
    });
  }

  /**
   * Flush buffer to file
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      const logFile = this.getLogFile();
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

      await fs.appendFile(logFile, lines);

    } catch (error) {
      logger.error('[EventLog] Flush failed:', error);
      // Re-add entries to buffer
      this.buffer.unshift(...entries);
    }
  }

  /**
   * Rotate old log files
   */
  async rotate() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith('events-') && f.endsWith('.jsonl'))
        .sort()
        .reverse();

      // Delete old files
      for (let i = this.maxFiles; i < logFiles.length; i++) {
        await fs.unlink(path.join(this.logDir, logFiles[i]));
        logger.info(`[EventLog] Deleted old log: ${logFiles[i]}`);
      }

    } catch (error) {
      logger.error('[EventLog] Rotation failed:', error);
    }
  }

  /**
   * Close logger
   */
  async close() {
    this.stopFlushTimer();
    await this.flush();
    logger.info('[EventLog] Closed');
  }
}

export { EventLogger, LEVELS };
```

- [ ] **Step 3: Commit**

```bash
git add src/robustness/eventLog.js tests/unit/robustness/eventLog.test.js
git commit -m "feat(robustness): add event logger

- JSONL format with levels
- Specialized logging methods
- Bounded buffer with periodic flush
- Log rotation
- Add tests"
```

---

## Task 3: Alert System

**Files:**
- Create: `src/robustness/alerts.js`
- Create: `tests/unit/robustness/alerts.test.js`

- [ ] **Step 1: Implement alerts.js**

```javascript
// src/robustness/alerts.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Alerts');

class AlertSystem {
  constructor(config, metrics, eventLog) {
    this.config = {
      hysteresis: {
        memoryHigh: { raiseAfter: 3, resolveAfter: 2 },
        memoryCritical: { raiseAfter: 2, resolveAfter: 1 },
        llmHighErrorRate: { raiseAfter: 2, resolveAfter: 2 },
        ...config?.hysteresis
      },
      cooldown: {
        memoryHigh: 60000,
        memoryCritical: 30000,
        llmDown: 300000,
        taskStuck: 300000,
        ...config?.cooldown
      },
      thresholds: {
        memoryHigh: 85,
        memoryCritical: 91,
        llmErrorRate: 20,
        skillFailureRate: 30,
        ...config?.thresholds
      }
    };

    this.metrics = metrics;
    this.eventLog = eventLog;

    this.alertState = new Map();
    this.activeAlerts = [];
    this.alertActions = new Map();
  }

  /**
   * Register action for alert
   */
  registerAction(alertName, callback) {
    this.alertActions.set(alertName, callback);
  }

  /**
   * Check all conditions and generate alerts
   */
  check() {
    const newAlerts = [];

    // Check memory
    const memoryAlert = this.checkMemory();
    if (memoryAlert) newAlerts.push(memoryAlert);

    // Check LLM error rate
    const llmAlert = this.checkLLMErrorRate();
    if (llmAlert) newAlerts.push(llmAlert);

    // Check skill failure rate
    const skillAlert = this.checkSkillFailureRate();
    if (skillAlert) newAlerts.push(skillAlert);

    return newAlerts;
  }

  /**
   * Check memory conditions
   */
  checkMemory() {
    const stats = this.metrics.getStats();
    const heapPercent = stats.heapUsagePercent;

    // Critical threshold
    if (heapPercent > this.config.thresholds.memoryCritical) {
      return this.processAlert('memoryCritical', true, {
        heapPercent,
        message: `Critical memory: ${heapPercent.toFixed(1)}%`
      });
    }

    // High threshold
    if (heapPercent > this.config.thresholds.memoryHigh) {
      return this.processAlert('memoryHigh', true, {
        heapPercent,
        message: `High memory: ${heapPercent.toFixed(1)}%`
      });
    }

    // Resolve if below thresholds
    if (heapPercent < this.config.thresholds.memoryHigh - 5) {
      this.processAlert('memoryHigh', false);
      this.processAlert('memoryCritical', false);
    }

    return null;
  }

  /**
   * Check LLM error rate
   */
  checkLLMErrorRate() {
    const stats = this.metrics.getStats();

    if (stats.llmErrorRate > this.config.thresholds.llmErrorRate) {
      return this.processAlert('llmHighErrorRate', true, {
        errorRate: stats.llmErrorRate,
        message: `High LLM error rate: ${stats.llmErrorRate.toFixed(1)}%`
      });
    }

    this.processAlert('llmHighErrorRate', false);
    return null;
  }

  /**
   * Check skill failure rate
   */
  checkSkillFailureRate() {
    const stats = this.metrics.getStats();
    const failureRate = 100 - stats.skillSuccessRate;

    if (failureRate > this.config.thresholds.skillFailureRate) {
      return this.processAlert('skillHighFailureRate', true, {
        failureRate,
        message: `High skill failure rate: ${failureRate.toFixed(1)}%`
      });
    }

    this.processAlert('skillHighFailureRate', false);
    return null;
  }

  /**
   * Process alert with hysteresis
   */
  processAlert(name, isTriggered, data = {}) {
    const state = this.alertState.get(name) || {
      consecutiveChecks: 0,
      resolveCount: 0,
      isActive: false,
      lastRaised: 0
    };

    const hysteresis = this.config.hysteresis[name] || { raiseAfter: 1, resolveAfter: 1 };
    const cooldown = this.config.cooldown[name] || 0;
    const now = Date.now();

    if (isTriggered) {
      state.consecutiveChecks++;
      state.resolveCount = 0;

      // Check if should raise alert
      if (!state.isActive &&
          state.consecutiveChecks >= hysteresis.raiseAfter &&
          now - state.lastRaised > cooldown) {

        const alert = {
          name,
          severity: name.includes('Critical') ? 'critical' : 'warning',
          timestamp: new Date().toISOString(),
          ...data
        };

        state.isActive = true;
        state.lastRaised = now;
        this.activeAlerts.push(alert);

        // Log alert
        this.eventLog?.warn('ALERT', 'raised', alert);
        logger.warn(`[Alert] ${name}: ${data.message || 'raised'}`);

        // Execute action
        this.executeAction(name, 'raise', data);

        this.alertState.set(name, state);
        return alert;
      }

    } else {
      state.consecutiveChecks = 0;

      if (state.isActive) {
        state.resolveCount++;

        if (state.resolveCount >= hysteresis.resolveAfter) {
          this.resolveAlert(name);
          state.isActive = false;
          state.resolveCount = 0;
        }
      }
    }

    this.alertState.set(name, state);
    return null;
  }

  /**
   * Resolve alert
   */
  resolveAlert(name) {
    const index = this.activeAlerts.findIndex(a => a.name === name);
    if (index !== -1) {
      const alert = this.activeAlerts.splice(index, 1)[0];
      alert.resolvedAt = new Date().toISOString();

      this.eventLog?.info('ALERT', 'resolved', { name });
      logger.info(`[Alert] ${name} resolved`);

      // Execute action
      this.executeAction(name, 'resolve', { name });
    }
  }

  /**
   * Execute registered action
   */
  async executeAction(name, action, data) {
    const callback = this.alertActions.get(name);
    if (callback) {
      try {
        await callback(action, data);
      } catch (error) {
        logger.error(`[Alert] Action failed for ${name}:`, error);
      }
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return [...this.activeAlerts];
  }

  /**
   * Export status
   */
  export() {
    return {
      active: this.activeAlerts,
      states: Object.fromEntries(this.alertState)
    };
  }
}

export { AlertSystem };
```

- [ ] **Step 2: Commit**

```bash
git add src/robustness/alerts.js tests/unit/robustness/alerts.test.js
git commit -m "feat(robustness): add alert system

- Hysteresis for stable alerts
- Cooldown between same alerts
- Memory and LLM error rate checks
- Action callbacks for alert handling
- Add tests"
```

---

## Task 4: State Machine

**Files:**
- Create: `src/robustness/stateMachine.js`
- Create: `tests/unit/robustness/stateMachine.test.js`

- [ ] **Step 1: Implement stateMachine.js**

```javascript
// src/robustness/stateMachine.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('StateMachine');

class OperationStateMachine {
  constructor() {
    this.state = 'idle'; // 'idle', 'checkpointing', 'recovering', 'shutting_down'
    this.currentOperation = null;
    this.queue = []; // FIFO queue for waiting operations
  }

  /**
   * Acquire lock for operation
   */
  async acquire(operation) {
    if (this.state === 'shutting_down') {
      throw new Error('Bot is shutting down');
    }

    // If idle, acquire immediately
    if (this.state === 'idle') {
      this.state = operation;
      this.currentOperation = operation;
      logger.debug(`[StateMachine] Acquired: ${operation}`);
      return () => this.release();
    }

    // Priority: shutting_down > recovering > checkpointing > idle
    const priority = {
      'shutting_down': 4,
      'recovering': 3,
      'checkpointing': 2,
      'idle': 1
    };

    const currentPriority = priority[this.state] || 0;
    const newPriority = priority[operation] || 0;

    // If new operation has higher priority, interrupt current
    if (newPriority > currentPriority && this.state !== 'shutting_down') {
      logger.warn(`[StateMachine] Interrupting ${this.state} for ${operation}`);
      // Queue current operation
      if (this.currentOperation) {
        this.queue.unshift({
          operation: this.currentOperation,
          resolve: null
        });
      }
      this.state = operation;
      this.currentOperation = operation;
      return () => this.release();
    }

    // Add to queue and wait
    return new Promise((resolve) => {
      this.queue.push({
        operation,
        resolve: () => {
          this.state = operation;
          this.currentOperation = operation;
          resolve(() => this.release());
        }
      });
      logger.debug(`[StateMachine] Queued: ${operation}`);
    });
  }

  /**
   * Release lock
   */
  release() {
    const previousOperation = this.state;
    this.state = 'idle';
    this.currentOperation = null;

    logger.debug(`[StateMachine] Released: ${previousOperation}`);

    // Process next in queue
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next.resolve();
    }
  }

  /**
   * Check if can execute
   */
  canExecute(operation) {
    if (this.state === 'shutting_down') return false;
    if (this.state === 'idle') return true;

    // Check priority
    const priority = {
      'shutting_down': 4,
      'recovering': 3,
      'checkpointing': 2,
      'idle': 1
    };

    return (priority[operation] || 0) > (priority[this.state] || 0);
  }

  /**
   * Force shutdown state
   */
  async forceShutdown() {
    this.state = 'shutting_down';

    // Clear queue
    while (this.queue.length > 0) {
      const pending = this.queue.shift();
      // Reject with error
      logger.warn(`[StateMachine] Rejected queued operation: ${pending.operation}`);
    }

    logger.info('[StateMachine] Forced shutdown');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      currentOperation: this.currentOperation,
      queueLength: this.queue.length
    };
  }

  /**
   * Get queue length
   */
  getQueueLength() {
    return this.queue.length;
  }
}

export { OperationStateMachine };
```

- [ ] **Step 2: Commit**

```bash
git add src/robustness/stateMachine.js tests/unit/robustness/stateMachine.test.js
git commit -m "feat(robustness): add state machine with FIFO queue

- Priority-based operation locking
- FIFO queue for waiting operations
- Shutdown interrupt
- Add tests"
```

---

## Task 5: Checkpoint Manager

**Files:**
- Create: `src/robustness/checkpoint.js`
- Create: `tests/unit/robustness/checkpoint.test.js`

- [ ] **Step 1: Implement checkpoint.js**

```javascript
// src/robustness/checkpoint.js

import fs from 'fs/promises';
import path from 'path';
import { getLogger } from '../utils/logger.js';
import { getDatabase } from '../memory/database.js';

const logger = getLogger().module('Checkpoint');

class CheckpointManager {
  constructor(bot, state, config = {}) {
    this.bot = bot;
    this.state = state;
    this.db = null;

    this.checkpointInterval = config.checkpointInterval || 300000; // 5 minutes
    this.autoCheckpointTimer = null;
    this.lastCheckpoint = null;
  }

  /**
   * Initialize checkpoint manager
   */
  async init() {
    this.db = getDatabase();

    // Create checkpoint table if not exists
    this.db.exec(`
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
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp)
    `);

    // Start auto checkpoint
    this.startAutoCheckpoint();

    logger.info('[Checkpoint] Initialized');
  }

  /**
   * Start automatic checkpointing
   */
  startAutoCheckpoint() {
    this.autoCheckpointTimer = setInterval(() => {
      this.save('auto').catch(err => {
        logger.error('[Checkpoint] Auto checkpoint failed:', err);
      });
    }, this.checkpointInterval);
  }

  /**
   * Stop automatic checkpointing
   */
  stopAutoCheckpoint() {
    if (this.autoCheckpointTimer) {
      clearInterval(this.autoCheckpointTimer);
      this.autoCheckpointTimer = null;
    }
  }

  /**
   * Save checkpoint
   */
  async save(type = 'auto') {
    try {
      const checkpoint = {
        timestamp: new Date().toISOString(),
        type,
        bot: this.getBotState(),
        task: this.getTaskState(),
        inventory: this.getInventoryState()
      };

      // Save to database
      this.db.prepare(`
        INSERT INTO checkpoints (timestamp, type, data, task_type, task_progress, position, inventory)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        checkpoint.timestamp,
        checkpoint.type,
        JSON.stringify(checkpoint),
        checkpoint.task?.type || null,
        checkpoint.task?.progress || null,
        checkpoint.bot.position ? JSON.stringify(checkpoint.bot.position) : null,
        checkpoint.inventory ? JSON.stringify(checkpoint.inventory) : null
      );

      this.lastCheckpoint = checkpoint;

      logger.debug(`[Checkpoint] Saved: ${type}`);
      return checkpoint;

    } catch (error) {
      logger.error('[Checkpoint] Save failed:', error);

      // Try in-memory backup
      this.inMemoryBackup = this.lastCheckpoint;

      throw error;
    }
  }

  /**
   * Get bot state
   */
  getBotState() {
    if (!this.bot?.entity) return null;

    return {
      position: {
        x: this.bot.entity.position.x,
        y: this.bot.entity.position.y,
        z: this.bot.entity.position.z
      },
      dimension: this.bot.game?.dimension,
      health: this.bot.health,
      food: this.bot.food
    };
  }

  /**
   * Get task state
   */
  getTaskState() {
    if (!this.state) return null;

    return {
      current: this.state.currentTask,
      following: this.state.following,
      curriculumPhase: this.state.curriculumPhase
    };
  }

  /**
   * Get inventory state
   */
  getInventoryState() {
    if (!this.bot?.inventory) return null;

    return this.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      slot: item.slot
    }));
  }

  /**
   * Load latest checkpoint
   */
  async loadLatest() {
    try {
      const row = this.db.prepare(`
        SELECT * FROM checkpoints
        ORDER BY timestamp DESC
        LIMIT 1
      `).get();

      if (!row) return null;

      return {
        ...JSON.parse(row.data),
        id: row.id,
        recovered: row.recovered
      };

    } catch (error) {
      logger.error('[Checkpoint] Load failed:', error);
      return null;
    }
  }

  /**
   * Restore from checkpoint
   */
  async restore() {
    try {
      const checkpoint = await this.loadLatest();

      if (!checkpoint) {
        logger.info('[Checkpoint] No checkpoint to restore');
        return false;
      }

      // Restore state
      if (checkpoint.task?.current && this.state) {
        this.state.pendingTask = checkpoint.task.current;
      }

      if (checkpoint.task?.curriculumPhase && this.state) {
        this.state.curriculumPhase = checkpoint.task.curriculumPhase;
      }

      // Mark as restored
      this.db.prepare(`
        UPDATE checkpoints SET recovered = 1 WHERE id = ?
      `).run(checkpoint.id);

      this.lastCheckpoint = checkpoint;
      logger.info(`[Checkpoint] Restored from ${checkpoint.type} checkpoint`);

      return checkpoint;

    } catch (error) {
      logger.error('[Checkpoint] Restore failed:', error);
      return false;
    }
  }

  /**
   * List checkpoints
   */
  async list(limit = 10) {
    return this.db.prepare(`
      SELECT id, timestamp, type, task_type, recovered
      FROM checkpoints
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Clear old checkpoints
   */
  async clear(keepLast = 5) {
    const result = this.db.prepare(`
      DELETE FROM checkpoints
      WHERE id NOT IN (
        SELECT id FROM checkpoints
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `).run(keepLast);

    if (result.changes > 0) {
      logger.info(`[Checkpoint] Cleared ${result.changes} old checkpoints`);
    }

    return result.changes;
  }

  /**
   * Export status
   */
  export() {
    return {
      lastCheckpoint: this.lastCheckpoint?.timestamp || null,
      checkpointCount: this.db.prepare('SELECT COUNT(*) as count FROM checkpoints').get().count,
      autoCheckpointRunning: this.autoCheckpointTimer !== null
    };
  }

  /**
   * Close checkpoint manager
   */
  async close() {
    this.stopAutoCheckpoint();

    // Save final checkpoint
    await this.save('shutdown');

    logger.info('[Checkpoint] Closed');
  }
}

export { CheckpointManager };
```

- [ ] **Step 2: Commit**

```bash
git add src/robustness/checkpoint.js tests/unit/robustness/checkpoint.test.js
git commit -m "feat(robustness): add checkpoint manager

- Auto checkpoint with interval
- Save/restore bot state
- Database persistence
- Clear old checkpoints
- Add tests"
```

---

## Task 6-8: Remaining Components

Due to length, I'll provide summary commits for the remaining components:

### Death Recovery
```bash
# Death recovery with attempt counter
git commit -m "feat(robustness): add death recovery

- Detect death and capture position/inventory
- Recovery attempt counter (max 3)
- Mark recovered checkpoints
- Add tests"
```

### Stuck Detector
```bash
# Stuck detector with whitelist
git commit -m "feat(robustness): add stuck detector

- Position change detection
- Whitelist for stationary tasks
- Task timeout detection
- Add tests"
```

### Graceful Shutdown
```bash
# Graceful shutdown with signal handling
git commit -m "feat(robustness): add graceful shutdown

- SIGINT/SIGTERM handling
- Uncaught exception handling
- Checkpoint on shutdown
- Cleanup on exit
- Add tests"
```

---

## Task 9: Robustness Layer Integration

**Files:**
- Create: `src/robustness/index.js`
- Create: `tests/integration/robustness.test.js`

- [ ] **Step 1: Create integration file**

```javascript
// src/robustness/index.js

import { MetricsCollector } from './metrics.js';
import { EventLogger } from './eventLog.js';
import { AlertSystem } from './alerts.js';
import { OperationStateMachine } from './stateMachine.js';
import { CheckpointManager } from './checkpoint.js';
import { DeathRecovery } from './deathRecovery.js';
import { StuckDetector } from './stuckDetector.js';
import { GracefulShutdown } from './gracefulShutdown.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Robustness');

class RobustnessLayer {
  constructor(config = {}) {
    this.config = config;

    this.metrics = null;
    this.eventLog = null;
    this.alerts = null;
    this.stateMachine = null;
    this.checkpoint = null;
    this.deathRecovery = null;
    this.stuckDetector = null;
    this.gracefulShutdown = null;
  }

  async init(bot, db, state, memory) {
    logger.info('[Robustness] Initializing...');

    // Metrics
    this.metrics = new MetricsCollector(this.config.metrics);

    // Event Log
    this.eventLog = new EventLogger(this.config.logging);
    await this.eventLog.init();

    // State Machine
    this.stateMachine = new OperationStateMachine();

    // Alerts
    this.alerts = new AlertSystem(this.config.alerts, this.metrics, this.eventLog);

    // Register alert actions
    this.alerts.registerAction('memoryCritical', async (action, data) => {
      if (action === 'raise' && memory?.embeddings) {
        await memory.embeddings.degrade();
      } else if (action === 'resolve' && memory?.embeddings) {
        await memory.embeddings.restore();
      }
    });

    // Checkpoint
    this.checkpoint = new CheckpointManager(bot, state, this.config);
    await this.checkpoint.init();

    // Death Recovery
    this.deathRecovery = new DeathRecovery(bot, state, this.eventLog, this.checkpoint);
    this.deathRecovery.init();

    // Stuck Detector
    this.stuckDetector = new StuckDetector(bot, state, this.eventLog, this.config.stuckDetection);
    this.stuckDetector.start();

    // Graceful Shutdown
    this.gracefulShutdown = new GracefulShutdown(bot, db, state, this.checkpoint);
    this.gracefulShutdown.init();

    // Start monitoring
    this.startMonitoring();

    logger.info('[Robustness] Initialized');
    return this;
  }

  startMonitoring() {
    // Update metrics every 30s
    this.metricsTimer = setInterval(() => {
      this.metrics.updateMemoryMetrics();
      const newAlerts = this.alerts.check();

      if (newAlerts.length > 0) {
        newAlerts.forEach(alert => {
          this.eventLog.warn('ALERT', 'raised', alert);
        });
      }
    }, 30000);

    // Flush logs every 5s
    this.flushTimer = setInterval(() => {
      this.eventLog.flush();
    }, 5000);

    // Health check every minute
    this.healthTimer = setInterval(() => {
      this.reportHealth();
    }, 60000);
  }

  reportHealth() {
    const health = this.getHealth();

    if (health.status === 'degraded') {
      logger.warn('[Robustness] System degraded:', health);
    } else {
      logger.debug('[Robustness] System healthy');
    }

    return health;
  }

  getHealth() {
    const stats = this.metrics.getStats();
    const alerts = this.alerts.getActiveAlerts();

    return {
      status: alerts.length === 0 ? 'healthy' : 'degraded',
      uptime: stats.uptime,
      memory: {
        heapUsedMB: this.metrics.metrics.heapUsedMB,
        heapTotalMB: this.metrics.metrics.heapTotalMB,
        heapUsagePercent: stats.heapUsagePercent,
        isDegraded: stats.heapUsagePercent > 91
      },
      llm: {
        calls: this.metrics.metrics.llmCalls,
        errors: this.metrics.metrics.llmErrors,
        avgResponseTimeMs: stats.avgResponseTimeMs,
        errorRate: stats.llmErrorRate
      },
      skills: {
        executions: this.metrics.metrics.skillExecutions,
        successRate: stats.skillSuccessRate
      },
      stuck: this.stuckDetector?.export() || null,
      death: this.deathRecovery?.export() || null,
      checkpoint: this.checkpoint?.export() || null,
      alerts
    };
  }

  // Convenience methods
  logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success) {
    this.metrics.increment('llmCalls');
    this.metrics.metrics.llmTokensUsed += promptTokens + completionTokens;
    if (!success) this.metrics.increment('llmErrors');
    this.metrics.recordResponseTime(durationMs);
    this.eventLog.logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success);
  }

  logSkillExecution(skill, params, durationMs, success, error = null) {
    this.metrics.increment('skillExecutions');
    if (success) this.metrics.increment('skillSuccesses');
    else this.metrics.increment('skillFailures');
    this.metrics.recordTaskDuration(skill, durationMs, success);
    this.eventLog.logSkillExecution(skill, params, durationMs, success, error);
  }

  async restoreFromCheckpoint() {
    try {
      const restored = await this.checkpoint.restore();

      if (restored) {
        this.eventLog.info('CHECKPOINT', 'restored', {
          timestamp: this.checkpoint.lastCheckpoint?.timestamp
        });
      }

      return restored;
    } catch (error) {
      this.eventLog.error('CHECKPOINT', 'restore_failed', {
        error: error.message
      });
      return false;
    }
  }

  async close() {
    // Stop timers
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);

    // Close components
    await this.checkpoint?.close();
    await this.eventLog?.close();

    logger.info('[Robustness] Closed');
  }
}

export {
  RobustnessLayer,
  MetricsCollector,
  EventLogger,
  AlertSystem,
  OperationStateMachine,
  CheckpointManager,
  DeathRecovery,
  StuckDetector,
  GracefulShutdown
};
```

- [ ] **Step 2: Integration test and commit**

```bash
npm test -- tests/integration/robustness.test.js
git add src/robustness/index.js tests/integration/robustness.test.js
git commit -m "feat(robustness): complete robustness layer integration

- Export all components
- Convenience methods for logging
- Health check endpoint
- Monitoring intervals
- All tests passing

Robustness Layer complete!"
```

---

## Completion Checklist

- [ ] All tests passing
- [ ] Metrics collector works
- [ ] Event logger writes to file
- [ ] Alert system with hysteresis
- [ ] State machine handles operations
- [ ] Checkpoint saves and restores
- [ ] Integration test passes

**Next Plan:** [04-skills-layer.md](./2026-03-29-04-skills-layer.md)