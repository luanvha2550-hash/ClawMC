// src/skills/executor.js
// SkillExecutor - Execute skills with timeout and sandbox isolation

import { getLogger } from '../utils/logger.js';
import { getTurnLimiter } from './turnLimiter.js';

const logger = getLogger().module('SkillExecutor');

// Default timeout for skill execution (30 seconds)
const DEFAULT_SKILL_TIMEOUT = 30000;

// Default timeout for dynamic skill code (10 seconds)
const DEFAULT_DYNAMIC_TIMEOUT = 10000;

// Forbidden patterns for security
const FORBIDDEN_PATTERNS = [
  // Module system
  /\brequire\s*\(/gi,
  /\bimport\s+.*from\s+['"]/gi,
  /\bimport\s*\(/gi,
  /\bexport\s+/gi,

  // Dangerous functions
  /\beval\s*\(/gi,
  /\bFunction\s*\(/gi,
  /\bnew\s+Function\b/gi,

  // Process/system access
  /\bprocess\b/gi,
  /\b__dirname\b/gi,
  /\b__filename\b/gi,

  // File system
  /\bfs\b/gi,
  /\bfs\s*\.\s*\w+/gi,
  /\breadFile/gi,
  /\bwriteFile/gi,
  /\baccessFile/gi,
  /\bunlinkFile/gi,
  /\breaddir/gi,

  // Child process
  /\bchild_process\b/gi,
  /\bspawn\s*\(/gi,
  /\bexec\s*\(/gi,
  /\bexecFile/gi,

  // Network
  /\bhttp\b/gi,
  /\bhttps\b/gi,
  /\bnet\b/gi,
  /\bfetch\s*\(/gi,
  /\bXMLHttpRequest\b/gi,
  /\bWebSocket\b/gi,

  // Buffer and VM
  /\bBuffer\s*\(/gi,
  /\bvm\b/gi,
  /\brunInContext/gi,
  /\brunInNewContext/gi,

  // Global access
  /\bglobalThis\b/gi,
  /\bglobal\s*\(/gi,
  /\b__proto__\b/gi,
  /\bReflect\b/gi,
  /\bProxy\b/gi,

  // Other dangerous patterns
  /\bmodule\.exports\b/gi,
  /\bexports\s*\./gi,
  /\bconstructor\s*\(/gi
];

// Allowed bot methods for sandbox
const ALLOWED_BOT_METHODS = [
  // Movement/Pathfinding
  'pathfinder',
  'dig',
  'placeBlock',

  // Block finding
  'findBlocks',
  'blockAt',

  // Inventory
  'inventory',
  'equip',
  'toss',
  'tossStack',

  // Communication
  'chat',
  'whisper',

  // Looking
  'lookAt',
  'lookAtLock',

  // Entity interaction
  'entity',
  'entities',
  'nearestEntity',
  'attack',

  // Container interaction
  'openChest',
  'closeWindow',
  'craft',

  // State queries (read-only)
  'health',
  'food',
  'position'
];

// Allowed bot properties (read-only)
const ALLOWED_BOT_PROPERTIES = [
  'entity',
  'health',
  'food',
  'position',
  'velocity',
  'inventory'
];

/**
 * SkillExecutor
 *
 * Executes skills with timeout management and sandbox isolation for dynamic skills.
 * Provides security validation and controlled bot access.
 */
class SkillExecutor {
  constructor(config = {}) {
    this.config = {
      skillTimeout: config.skillTimeout || DEFAULT_SKILL_TIMEOUT,
      dynamicTimeout: config.dynamicTimeout || DEFAULT_DYNAMIC_TIMEOUT,
      enableSandbox: config.enableSandbox !== false
    };

    this.turnLimiter = config.turnLimiter || getTurnLimiter();

    // Track active executions
    this.activeExecutions = new Map();
    this.executionId = 0;
  }

  /**
   * Execute a skill with timeout
   * @param {Object} skill - Skill object with execute function
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} state - State manager instance
   * @param {Object} params - Parameters for the skill
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async execute(skill, bot, state, params = {}, options = {}) {
    const timeout = options.timeout || this.config.skillTimeout;
    const executionId = ++this.executionId;

    // Validate bot instance
    if (!bot) {
      const error = 'Bot instance is required';
      logger.error(error);
      return { success: false, error, executionId };
    }

    // Validate state instance
    if (!state) {
      const error = 'State instance is required';
      logger.error(error);
      return { success: false, error, executionId };
    }

    // Validate skill
    if (!skill || typeof skill.execute !== 'function') {
      const error = 'Invalid skill: missing execute function';
      logger.error(error);
      return { success: false, error, executionId };
    }

    // Check turn limiter for retry management
    if (options.turnKey) {
      const limiterStatus = this.turnLimiter.getStatus();
      if (!limiterStatus.canRetry && limiterStatus.attempts > 0) {
        const error = 'Turn limiter blocked execution';
        logger.warn(error, { turnKey: options.turnKey });
        return { success: false, error, executionId, blocked: true };
      }
    }

    // Create execution context
    const context = {
      executionId,
      skillName: skill.name || 'unknown',
      startTime: Date.now(),
      params
    };

    this.activeExecutions.set(executionId, context);

    logger.info(`Executing skill: ${skill.name}`, { params, timeout });

    try {
      // Set up timeout
      const result = await this._executeWithTimeout(
        skill.execute(bot, state, params),
        timeout,
        `Skill '${skill.name}' timed out`
      );

      // Record success in turn limiter if configured
      if (options.turnKey) {
        this.turnLimiter.recordSuccess();
      }

      const duration = Date.now() - context.startTime;
      logger.info(`Skill completed: ${skill.name}`, { duration, success: result?.success });

      return {
        ...result,
        executionId,
        duration
      };

    } catch (error) {
      const duration = Date.now() - context.startTime;

      // Record error in turn limiter
      if (options.turnKey) {
        const errorInfo = this.turnLimiter.recordError(error);
        logger.warn(`Skill error recorded`, {
          skill: skill.name,
          attempt: errorInfo.attempt,
          error: error.message
        });
      }

      logger.error(`Skill failed: ${skill.name}`, { error: error.message, duration });

      return {
        success: false,
        error: error.message,
        executionId,
        duration,
        timedOut: error.name === 'TimeoutError'
      };

    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Validate code for security violations
   * @param {string} code - Code to validate
   * @returns {Object} { valid, violations }
   */
  validateSafety(code) {
    if (!code || typeof code !== 'string') {
      return { valid: false, violations: ['Code must be a non-empty string'] };
    }

    const violations = [];

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        // Get the matched pattern for error message
        const match = code.match(pattern);
        violations.push(`Forbidden pattern: ${match ? match[0] : pattern.source}`);
      }
    }

    // Check for suspicious concatenation (trying to bypass)
    if (/\+\s*['"`]/.test(code) && /['"`]\s*\+/.test(code)) {
      violations.push('Suspicious string concatenation detected');
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Execute dynamic skill code in sandbox
   * @param {string} code - JavaScript code to execute
   * @param {Object} bot - Mineflayer bot instance (will be proxied)
   * @param {Object} state - State manager instance
   * @param {Object} params - Parameters for the skill
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeDynamic(code, bot, state, params = {}, options = {}) {
    const timeout = options.timeout || this.config.dynamicTimeout;

    // Validate safety first
    const safety = this.validateSafety(code);
    if (!safety.valid) {
      const error = `Safety validation failed: ${safety.violations.join(', ')}`;
      logger.error(error);
      return { success: false, error, violations: safety.violations };
    }

    // Create sandbox environment
    const sandbox = this._createSandbox(bot, state, params);

    logger.info('Executing dynamic skill', { timeout });

    try {
      // Execute in sandbox with timeout
      const result = await this._executeInSandbox(code, sandbox, timeout);

      logger.info('Dynamic skill completed', { success: result?.success });

      return {
        success: true,
        result,
        executionId: ++this.executionId
      };

    } catch (error) {
      logger.error('Dynamic skill failed', { error: error.message });

      return {
        success: false,
        error: error.message,
        executionId: this.executionId
      };
    }
  }

  /**
   * Create a limited bot proxy for sandbox
   * @param {Object} bot - Original bot instance
   * @returns {Object} Proxied bot object
   */
  createBotProxy(bot) {
    if (!bot) {
      return null;
    }

    const executor = this;
    const proxy = {};

    // Proxy allowed methods
    for (const method of ALLOWED_BOT_METHODS) {
      if (typeof bot[method] === 'function') {
        proxy[method] = function(...args) {
          logger.debug(`Bot method called: ${method}`, { argCount: args.length });
          return bot[method].apply(bot, args);
        };
      } else if (bot[method] !== undefined) {
        // Property, not method
        Object.defineProperty(proxy, method, {
          get() {
            const value = bot[method];
            // Return deep proxy for objects
            if (value && typeof value === 'object' && method === 'entity') {
              return executor._createDeepProxy(value, ['position', 'velocity', 'name', 'type', 'id']);
            }
            if (value && typeof value === 'object' && method === 'inventory') {
              return executor._createInventoryProxy(value);
            }
            if (value && typeof value === 'object' && method === 'pathfinder') {
              return executor._createPathfinderProxy(value);
            }
            return value;
          },
          enumerable: true
        });
      }
    }

    // Add position shortcut if not already defined
    if (!Object.prototype.hasOwnProperty.call(proxy, 'position')) {
      Object.defineProperty(proxy, 'position', {
        get() {
          return bot.entity?.position || { x: 0, y: 0, z: 0 };
        },
        enumerable: true
      });
    }

    // Freeze to prevent modifications
    return Object.freeze(proxy);
  }

  /**
   * Create a safe console for sandbox
   * @returns {Object} Safe console object
   */
  createSafeConsole() {
    return {
      log: (...args) => logger.debug('Sandbox:', ...args),
      info: (...args) => logger.info('Sandbox:', ...args),
      warn: (...args) => logger.warn('Sandbox:', ...args),
      error: (...args) => logger.error('Sandbox:', ...args)
    };
  }

  /**
   * Get active executions
   * @returns {Array} Array of active execution contexts
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Cancel an execution
   * @param {number} executionId - ID of execution to cancel
   * @returns {boolean} True if cancelled
   */
  cancelExecution(executionId) {
    if (this.activeExecutions.has(executionId)) {
      const context = this.activeExecutions.get(executionId);
      context.cancelled = true;
      logger.info(`Execution ${executionId} cancelled`, { skill: context.skillName });
      return true;
    }
    return false;
  }

  // --- Private methods ---

  /**
   * Execute promise with timeout
   * @private
   */
  async _executeWithTimeout(promise, timeoutMs, errorMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(errorMessage);
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
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
   * Create sandbox environment
   * @private
   */
  _createSandbox(bot, state, params) {
    // Note: We don't include blocked globals like require, import, process, etc.
    // because they're not available in Function constructor scope by default.
    // The code running in the sandbox won't have access to these unless we explicitly
    // provide them (which we don't).
    return {
      bot: this.createBotProxy(bot),
      state: this._createStateProxy(state),
      params,
      console: this.createSafeConsole(),
      // Allowed globals (safe JavaScript built-ins)
      Math,
      Date,
      Array,
      Object,
      Number,
      String,
      Boolean,
      JSON,
      // Custom setTimeout with limits (overwrites global)
      setTimeout: (fn, ms) => {
        if (ms > 5000) {
          throw new Error('setTimeout max is 5000ms in sandbox');
        }
        return setTimeout(fn, ms);
      }
    };
  }

  /**
   * Execute code in sandbox
   * @private
   */
  async _executeInSandbox(code, sandbox, timeout) {
    const sandboxKeys = Object.keys(sandbox);
    const sandboxValues = Object.values(sandbox);

    // Wrap code to support both sync and async patterns
    // If code doesn't have a return statement, we add one
    const wrappedCode = `
      "use strict";
      return (function() {
        ${code}
      })();
    `;

    try {
      // Create a synchronous function first
      const syncFn = new Function(...sandboxKeys, wrappedCode);

      // Execute synchronously first
      let result;
      try {
        result = syncFn(...sandboxValues);
      } catch (syncError) {
        // If sync execution fails, might need async
        throw syncError;
      }

      // If result is a promise, await it with timeout
      if (result && typeof result.then === 'function') {
        result = await this._executeWithTimeout(
          result,
          timeout,
          'Dynamic skill execution timed out'
        );
      }

      return result;

    } catch (error) {
      // Check if it's a sandbox violation
      if (error.message.includes('is not defined') ||
          error.message.includes('is not a function') ||
          error.message.includes('Unexpected token')) {
        throw new Error(`Sandbox error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create state proxy (read-only)
   * @private
   */
  _createStateProxy(state) {
    if (!state) return null;

    const allowedMethods = [
      'getPosition', 'getVitals', 'getInventory',
      'isBusy', 'currentTask', 'following'
    ];

    const proxy = {};

    for (const key of allowedMethods) {
      if (typeof state[key] === 'function') {
        proxy[key] = state[key].bind(state);
      } else if (state[key] !== undefined) {
        Object.defineProperty(proxy, key, {
          get() { return state[key]; },
          enumerable: true
        });
      }
    }

    return Object.freeze(proxy);
  }

  /**
   * Create deep proxy for objects
   * @private
   */
  _createDeepProxy(obj, allowedKeys) {
    const proxy = {};

    for (const key of allowedKeys) {
      if (obj[key] !== undefined) {
        Object.defineProperty(proxy, key, {
          get() { return obj[key]; },
          enumerable: true
        });
      }
    }

    return Object.freeze(proxy);
  }

  /**
   * Create inventory proxy
   * @private
   */
  _createInventoryProxy(inventory) {
    if (!inventory) return null;

    return Object.freeze({
      items: () => inventory.items ? inventory.items() : [],
      slots: inventory.slots,
      itemCount: (name) => {
        const items = inventory.items ? inventory.items() : [];
        return items.filter(i => i.name === name).reduce((sum, i) => sum + i.count, 0);
      }
    });
  }

  /**
   * Create pathfinder proxy
   * @private
   */
  _createPathfinderProxy(pathfinder) {
    if (!pathfinder) return null;

    return Object.freeze({
      goto: pathfinder.goto?.bind(pathfinder),
      stop: pathfinder.stop?.bind(pathfinder),
      setGoal: pathfinder.setGoal?.bind(pathfinder),
      isMoving: pathfinder.isMoving
    });
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new SkillExecutor instance
 * @param {Object} config - Configuration options
 * @returns {SkillExecutor} New SkillExecutor instance
 */
export function createSkillExecutor(config) {
  instance = new SkillExecutor(config);
  return instance;
}

/**
 * Get the singleton SkillExecutor instance
 * @returns {SkillExecutor} SkillExecutor instance
 */
export function getSkillExecutor() {
  if (!instance) {
    instance = new SkillExecutor();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSkillExecutor() {
  instance = null;
}

// Export forbidden patterns for testing
export { FORBIDDEN_PATTERNS, ALLOWED_BOT_METHODS, ALLOWED_BOT_PROPERTIES };

export { SkillExecutor };
export default SkillExecutor;