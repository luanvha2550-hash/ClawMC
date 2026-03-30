import fs from 'fs/promises';
import path from 'path';

class Logger {
  constructor(config = {}) {
    this.level = config.level || 'info';
    this.logDir = config.logDir || './logs';
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = config.maxFiles || 7;
    this.currentFile = null;
    this.currentSize = 0;
    this.initialized = false;

    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.currentFile = await this.getLogFile();
      this.initialized = true;
    } catch (e) {
      console.error('Failed to initialize logger:', e);
    }
  }

  async getLogFile() {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `bot-${date}.jsonl`);
  }

  formatMessage(level, module, message, data = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      module,
      message,
      ...data
    });
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  async writeToFile(line) {
    if (!this.currentFile || !this.initialized) return;

    try {
      await fs.appendFile(this.currentFile, line + '\n');
    } catch (e) {
      // Fail silently - console is enough
    }
  }

  log(level, module, message, data = {}) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, module, message, data);

    // Console output with colors
    const colors = {
      debug: '\x1b[36m',  // cyan
      info: '\x1b[32m',   // green
      warn: '\x1b[33m',   // yellow
      error: '\x1b[31m'   // red
    };
    const reset = '\x1b[0m';

    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`${colors[level]}[${level.toUpperCase()}]${reset} [${module}] ${message}`, data);

    // File output (async, fire-and-forget)
    this.writeToFile(formatted);
  }

  debug(module, message, data = {}) {
    this.log('debug', module, message, data);
  }

  info(module, message, data = {}) {
    this.log('info', module, message, data);
  }

  warn(module, message, data = {}) {
    this.log('warn', module, message, data);
  }

  error(module, message, data = {}) {
    this.log('error', module, message, data);
  }

  module(moduleName) {
    const parent = this;
    return {
      module: moduleName,
      debug: (msg, data) => parent.debug(moduleName, msg, data),
      info: (msg, data) => parent.info(moduleName, msg, data),
      warn: (msg, data) => parent.warn(moduleName, msg, data),
      error: (msg, data) => parent.error(moduleName, msg, data)
    };
  }
}

// Singleton instance
let instance = null;

export function createLogger(config) {
  instance = new Logger(config);
  return instance;
}

export function getLogger() {
  if (!instance) {
    instance = new Logger();
  }
  return instance;
}

export { Logger };