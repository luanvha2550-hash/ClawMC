// src/skills/testFirst.js
// TestFirstLoop - Validate dynamic skill code before execution

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('TestFirstLoop');

// Forbidden patterns for security - used in checkSafety
const FORBIDDEN_PATTERNS = [
  // Module system
  /\brequire\s*\(/i,
  /\bimport\s+.*from\s+['"]/i,
  /\bimport\s*\(/i,
  /\bexport\s+/i,

  // Dangerous functions
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bnew\s+Function\b/i,

  // Process/system access
  /\bprocess\b/i,
  /\bfs\b/i,
  /\bchild_process\b/i,

  // Network
  /\bhttp\b/i,
  /\bhttps\b/i,
  /\bnet\b/i,

  // Dangerous globals
  /\b__dirname\b/i,
  /\b__filename\b/i,
  /\bglobalThis\b/i,
  /\bglobal\s*\(/i,
  /\b__proto__\b/i,
  /\bReflect\b/i,
  /\bProxy\b/i
];

// Basic requirement checks
const REQUIREMENTS = {
  MUST_BE_ASYNC_OR_AWAIT: {
    // Either has async keyword OR uses await (will be wrapped in async function for simulated test)
    pattern: /\basync\b|\bawait\b/i,
    description: 'Code must be async or use await (async operations)'
  },
  MUST_HAVE_TRY_CATCH: {
    pattern: /\btry\s*\{[\s\S]*\}\s*catch/i,
    description: 'Code must have try/catch for error handling'
  },
  MUST_USE_BOT: {
    pattern: /\bbot\b/i,
    description: 'Code must use the bot parameter'
  }
};

/**
 * TestFirstLoop
 *
 * Validates dynamically generated skills before execution.
 * Performs safety checks, requirement validation, and simulated testing.
 */
class TestFirstLoop {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      testTimeout: config.testTimeout || 5000,
      ...config
    };

    // Track test history
    this.testHistory = [];
    this.testId = 0;
  }

  /**
   * Generate and test skill code
   * @param {string} task - Task description for the skill
   * @param {Object} llmProvider - LLM provider to generate code
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result with valid code or error
   */
  async generateAndTest(task, llmProvider, options = {}) {
    const testId = ++this.testId;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    logger.info(`Starting generateAndTest for task: ${task}`, { testId, maxRetries });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate code using LLM
        logger.debug(`Generating code attempt ${attempt}`, { testId });
        const code = await llmProvider.generateSkill(task, options);

        if (!code || typeof code !== 'string') {
          logger.warn('LLM returned invalid code', { testId, attempt });
          continue;
        }

        // Check safety first
        const safetyResult = this.checkSafety(code);
        if (!safetyResult.valid) {
          logger.warn('Safety check failed', {
            testId,
            attempt,
            violations: safetyResult.violations
          });

          // Record failed attempt
          this._recordTest(testId, task, code, {
            passed: false,
            stage: 'safety',
            violations: safetyResult.violations
          });

          // Ask LLM to regenerate with safety feedback
          continue;
        }

        // Check basic requirements
        const reqResult = this.checkBasicRequirements(code, task);
        if (!reqResult.valid) {
          logger.warn('Requirements check failed', {
            testId,
            attempt,
            issues: reqResult.issues
          });

          this._recordTest(testId, task, code, {
            passed: false,
            stage: 'requirements',
            issues: reqResult.issues
          });

          continue;
        }

        // Run simulated test
        const testResult = await this.runSimulatedTest(code, task);
        if (!testResult.passed) {
          logger.warn('Simulated test failed', {
            testId,
            attempt,
            error: testResult.error
          });

          this._recordTest(testId, task, code, {
            passed: false,
            stage: 'simulated_test',
            error: testResult.error
          });

          continue;
        }

        // All checks passed
        logger.info(`Skill code validated successfully`, {
          testId,
          attempts: attempt
        });

        this._recordTest(testId, task, code, {
          passed: true,
          attempts: attempt
        });

        return {
          success: true,
          code,
          attempts: attempt,
          testId
        };

      } catch (error) {
        logger.error(`Error in generateAndTest attempt ${attempt}`, {
          testId,
          error: error.message
        });

        this._recordTest(testId, task, '', {
          passed: false,
          stage: 'error',
          error: error.message
        });

        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts: ${error.message}`,
            attempts: attempt,
            testId
          };
        }
      }
    }

    return {
      success: false,
      error: `Failed to generate valid skill after ${maxRetries} attempts`,
      attempts: maxRetries,
      testId
    };
  }

  /**
   * Run simulated test in mock environment
   * @param {string} code - Code to test
   * @param {string} task - Task description
   * @returns {Promise<Object>} Test result
   */
  async runSimulatedTest(code, task) {
    logger.debug('Running simulated test', { codeLength: code.length });

    try {
      // Create mock bot for testing
      const mockBot = this.createMockBot();
      const mockState = this._createMockState();
      const mockParams = this._createMockParams(task);

      // Create sandbox environment
      const sandbox = {
        bot: mockBot,
        state: mockState,
        params: mockParams,
        console: this._createSafeConsole(),
        Math,
        Date,
        Array,
        Object,
        Number,
        String,
        Boolean,
        JSON,
        setTimeout: (fn, ms) => {
          if (ms > 1000) {
            throw new Error('setTimeout max is 1000ms in simulated test');
          }
          return setTimeout(fn, ms);
        }
      };

      // Wrap code for execution
      const wrappedCode = `
        "use strict";
        return (async function() {
          ${code}
        })();
      `;

      // Execute with timeout
      const timeout = this.config.testTimeout;
      const result = await this._executeWithTimeout(
        wrappedCode,
        sandbox,
        timeout
      );

      // Check if result indicates success
      if (result && typeof result === 'object') {
        // Skill returned a result object
        return {
          passed: true,
          result
        };
      }

      // Code executed without explicit return - still valid
      return {
        passed: true,
        result: { success: true }
      };

    } catch (error) {
      return {
        passed: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Check code safety for forbidden patterns
   * @param {string} code - Code to check
   * @returns {Object} { valid, violations }
   */
  checkSafety(code) {
    if (!code || typeof code !== 'string') {
      return { valid: false, violations: ['Code must be a non-empty string'] };
    }

    const violations = [];

    for (const pattern of FORBIDDEN_PATTERNS) {
      const matches = code.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push(`Forbidden pattern: ${match}`);
        }
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
   * Check basic requirements for skill code
   * @param {string} code - Code to check
   * @param {string} task - Task description (optional context)
   * @returns {Object} { valid, issues }
   */
  checkBasicRequirements(code, task) {
    if (!code || typeof code !== 'string') {
      return { valid: false, issues: ['Code must be a non-empty string'] };
    }

    const issues = [];

    // Check for async or await
    if (!REQUIREMENTS.MUST_BE_ASYNC_OR_AWAIT.pattern.test(code)) {
      issues.push(REQUIREMENTS.MUST_BE_ASYNC_OR_AWAIT.description);
    }

    // Check for try/catch
    if (!REQUIREMENTS.MUST_HAVE_TRY_CATCH.pattern.test(code)) {
      issues.push(REQUIREMENTS.MUST_HAVE_TRY_CATCH.description);
    }

    // Check for bot usage
    if (!REQUIREMENTS.MUST_USE_BOT.pattern.test(code)) {
      issues.push(REQUIREMENTS.MUST_USE_BOT.description);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Create mock bot for testing
   * @returns {Object} Mock bot instance
   */
  createMockBot() {
    const mockBot = {
      // Position
      entity: {
        position: { x: 0, y: 64, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        name: 'mockBot',
        type: 'player',
        id: 1
      },

      // Vitals
      health: 20,
      food: 20,

      // Inventory mock
      inventory: {
        items: () => [],
        slots: [],
        itemCount: () => 0
      },

      // Movement/Pathfinding mock
      pathfinder: {
        goto: async () => ({ success: true }),
        stop: () => {},
        setGoal: () => {},
        isMoving: false
      },

      // Block finding mock
      findBlocks: () => [],
      blockAt: () => null,

      // Actions mock
      dig: async () => ({ success: true }),
      placeBlock: async () => ({ success: true }),
      equip: async () => ({ success: true }),
      toss: async () => ({ success: true }),
      tossStack: async () => ({ success: true }),
      attack: () => {},
      chat: (msg) => {
        mockBot._lastChat = msg;
      },
      whisper: async () => ({ success: true }),
      lookAt: async () => ({ success: true }),

      // Container interaction mock
      openChest: async () => ({ success: true }),
      closeWindow: () => {},
      craft: async () => ({ success: true }),

      // Entities
      entities: {},
      nearestEntity: () => null,

      // State queries
      position: { x: 0, y: 64, z: 0 }
    };

    return mockBot;
  }

  /**
   * Get test history
   * @returns {Array} Array of test records
   */
  getTestHistory() {
    return [...this.testHistory];
  }

  /**
   * Clear test history
   */
  clearHistory() {
    this.testHistory = [];
  }

  // --- Private methods ---

  /**
   * Create mock state for testing
   * @private
   */
  _createMockState() {
    return {
      getPosition: () => ({ x: 0, y: 64, z: 0 }),
      getVitals: () => ({ health: 20, food: 20 }),
      getInventory: () => [],
      isBusy: () => false,
      currentTask: null,
      following: null
    };
  }

  /**
   * Create mock params for testing
   * @private
   */
  _createMockParams(task) {
    // Parse task for potential params
    return {
      task,
      target: null,
      count: 1,
      timeout: 5000
    };
  }

  /**
   * Create safe console for sandbox
   * @private
   */
  _createSafeConsole() {
    return {
      log: (...args) => logger.debug('Sandbox:', ...args),
      info: (...args) => logger.info('Sandbox:', ...args),
      warn: (...args) => logger.warn('Sandbox:', ...args),
      error: (...args) => logger.error('Sandbox:', ...args)
    };
  }

  /**
   * Execute code with timeout
   * @private
   */
  async _executeWithTimeout(wrappedCode, sandbox, timeout) {
    const sandboxKeys = Object.keys(sandbox);
    const sandboxValues = Object.values(sandbox);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error('Simulated test timed out');
        error.name = 'TimeoutError';
        reject(error);
      }, timeout);
    });

    try {
      const fn = new Function(...sandboxKeys, wrappedCode);
      const resultPromise = fn(...sandboxValues);

      const result = await Promise.race([resultPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Record test in history
   * @private
   */
  _recordTest(testId, task, code, result) {
    this.testHistory.push({
      testId,
      task,
      codeLength: code.length,
      timestamp: Date.now(),
      ...result
    });

    // Keep history bounded
    if (this.testHistory.length > 100) {
      this.testHistory.shift();
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new TestFirstLoop instance
 * @param {Object} config - Configuration options
 * @returns {TestFirstLoop} New TestFirstLoop instance
 */
export function createTestFirstLoop(config) {
  instance = new TestFirstLoop(config);
  return instance;
}

/**
 * Get the singleton TestFirstLoop instance
 * @returns {TestFirstLoop} TestFirstLoop instance
 */
export function getTestFirstLoop() {
  if (!instance) {
    instance = new TestFirstLoop();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTestFirstLoop() {
  instance = null;
}

// Export forbidden patterns for testing
export { FORBIDDEN_PATTERNS, REQUIREMENTS };

export { TestFirstLoop };
export default TestFirstLoop;