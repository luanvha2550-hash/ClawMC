// src/robustness/eventLog.js

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { getLogger } from '../utils/logger.js';

/**
 * Log levels with numeric values for comparison
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

/**
 * Log level names for output
 */
const LogLevelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];

/**
 * EventLogger - Structured event logging for ClawMC
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - Specialized logging methods for common events
 * - Buffer with periodic flush for performance
 * - Log rotation with size and file limits
 */
export class EventLogger extends EventEmitter {
  constructor(config = {}) {
    super();

    this._logger = config.logger || getLogger();
    this._log = this._logger.module('eventLog');

    // Configuration
    this.logDir = config.logDir || './logs';
    this.logFile = config.logFile || 'events.jsonl';
    this.flushInterval = config.flushInterval || 5000; // 5 seconds
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = config.maxFiles || 7;
    this.minLevel = config.minLevel !== undefined ? config.minLevel : LogLevel.INFO;
    this.bufferSize = config.bufferSize || 100;

    // State
    this.buffer = [];
    this.currentFile = null;
    this.currentSize = 0;
    this.flushTimer = null;
    this.initialized = false;
    this.flushPromise = null;
  }

  /**
   * Initialize the event logger
   * Creates log directory and starts flush timer
   */
  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.currentFile = await this._getLogFile();
      await this._checkRotation();
      this._startFlushTimer();
      this.initialized = true;
      this._log.info('EventLogger initialized', { logDir: this.logDir });
    } catch (e) {
      this._log.error('Failed to initialize EventLogger', { error: e.message });
      throw e;
    }
  }

  /**
   * Get the current log file path
   * @private
   * @returns {string} Log file path
   */
  async _getLogFile() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `${this.logFile.replace('.jsonl', '')}-${date}.jsonl`);
  }

  /**
   * Start the periodic flush timer
   * @private
   */
  _startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(e => {
        this._log.error('Periodic flush failed', { error: e.message });
      });
    }, this.flushInterval);
  }

  /**
   * Log an event
   * @param {number} level - Log level (LogLevel enum)
   * @param {string} category - Event category
   * @param {string} event - Event name
   * @param {object} data - Additional event data
   */
  log(level, category, event, data = {}) {
    if (level < this.minLevel) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: LogLevelNames[level],
      category,
      event,
      ...data
    };

    this.buffer.push(entry);

    // Emit for real-time monitoring
    this.emit('log', entry);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flush().catch(e => {
        this._log.error('Auto-flush failed', { error: e.message });
      });
    }

    // Also output to console for critical errors
    if (level >= LogLevel.ERROR) {
      console.error(`[EVENTLOG] ${LogLevelNames[level]} [${category}] ${event}`, data);
    }
  }

  /**
   * Log a debug event
   */
  debug(category, event, data = {}) {
    this.log(LogLevel.DEBUG, category, event, data);
  }

  /**
   * Log an info event
   */
  info(category, event, data = {}) {
    this.log(LogLevel.INFO, category, event, data);
  }

  /**
   * Log a warning event
   */
  warn(category, event, data = {}) {
    this.log(LogLevel.WARN, category, event, data);
  }

  /**
   * Log an error event
   */
  error(category, event, data = {}) {
    this.log(LogLevel.ERROR, category, event, data);
  }

  /**
   * Log a critical event
   */
  critical(category, event, data = {}) {
    this.log(LogLevel.CRITICAL, category, event, data);
  }

  // Specialized logging methods

  /**
   * Log an LLM API call
   * @param {string} provider - LLM provider name
   * @param {string} model - Model name
   * @param {number} tokens - Tokens used
   * @param {number} duration - Call duration in ms
   * @param {boolean} success - Whether the call succeeded
   */
  logLLMCall(provider, model, tokens, duration, success = true) {
    this.info('llm', success ? 'call_success' : 'call_failed', {
      provider,
      model,
      tokens,
      duration
    });
  }

  /**
   * Log a skill execution
   * @param {string} skillName - Name of the skill
   * @param {number} duration - Execution duration in ms
   * @param {boolean} success - Whether execution succeeded
   * @param {string} error - Error message if failed
   */
  logSkillExecution(skillName, duration, success = true, error = null) {
    this[success ? 'info' : 'warn']('skill', success ? 'execution_success' : 'execution_failed', {
      skillName,
      duration,
      error
    });
  }

  /**
   * Log a bot death event
   * @param {object} position - Death position {x, y, z}
   * @param {string} cause - Cause of death
   * @param {number} recoveryAttempt - Recovery attempt number
   */
  logBotDeath(position, cause, recoveryAttempt = 0) {
    this.critical('bot', 'death', {
      position,
      cause,
      recoveryAttempt
    });
  }

  /**
   * Log a disconnect event
   * @param {string} reason - Disconnect reason
   * @param {number} reconnectAttempt - Reconnect attempt number
   */
  logDisconnect(reason, reconnectAttempt = 0) {
    this.warn('connection', 'disconnect', {
      reason,
      reconnectAttempt
    });
  }

  /**
   * Log a memory warning
   * @param {number} heapUsedMB - Current heap usage in MB
   * @param {number} heapTotalMB - Total heap in MB
   * @param {number} percentage - Memory usage percentage
   */
  logMemoryWarning(heapUsedMB, heapTotalMB, percentage) {
    this.warn('system', 'memory_warning', {
      heapUsedMB,
      heapTotalMB,
      percentage
    });
  }

  /**
   * Flush buffered events to disk
   */
  async flush() {
    if (this.buffer.length === 0 || !this.initialized) {
      return;
    }

    // Wait for any existing flush to complete
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    this.flushPromise = this._doFlush();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Internal flush implementation
   * @private
   */
  async _doFlush() {
    const entries = this.buffer.splice(0, this.buffer.length);
    if (entries.length === 0) return;

    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

    try {
      await this._checkRotation();
      await fs.appendFile(this.currentFile, lines);
      this.currentSize += Buffer.byteLength(lines);
    } catch (e) {
      this._log.error('Failed to write events', { error: e.message });
      // Put entries back in buffer
      this.buffer.unshift(...entries);
      throw e;
    }
  }

  /**
   * Check if log rotation is needed and perform it
   * @private
   */
  async _checkRotation() {
    try {
      const stats = await fs.stat(this.currentFile).catch(() => null);

      if (stats && stats.size >= this.maxFileSize) {
        await this.rotate();
      }
    } catch (e) {
      // File doesn't exist yet, that's fine
    }
  }

  /**
   * Rotate log files
   * Keeps maxFiles files, removes oldest
   */
  async rotate() {
    try {
      // Get all log files matching pattern
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.startsWith(this.logFile.replace('.jsonl', '')) && f.endsWith('.jsonl'))
        .sort();

      // Remove oldest files if we have too many
      while (logFiles.length >= this.maxFiles) {
        const oldest = logFiles.shift();
        await fs.unlink(path.join(this.logDir, oldest));
        this._log.info('Removed old log file', { file: oldest });
      }

      // Create new log file
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      this.currentFile = path.join(
        this.logDir,
        `${this.logFile.replace('.jsonl', '')}-${date}.jsonl`
      );
      this.currentSize = 0;

      this._log.info('Rotated log file', { newFile: this.currentFile });
      this.emit('rotate', { file: this.currentFile });
    } catch (e) {
      this._log.error('Failed to rotate logs', { error: e.message });
      throw e;
    }
  }

  /**
   * Close the event logger
   * Flushes remaining entries and stops timer
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    this.initialized = false;
    this._log.info('EventLogger closed');
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new EventLogger instance
 * @param {object} config - Configuration options
 * @returns {EventLogger} New EventLogger instance
 */
export function createEventLogger(config) {
  instance = new EventLogger(config);
  return instance;
}

/**
 * Get the singleton EventLogger instance
 * @returns {EventLogger} EventLogger instance
 */
export function getEventLogger() {
  if (!instance) {
    instance = new EventLogger();
  }
  return instance;
}

export default EventLogger;