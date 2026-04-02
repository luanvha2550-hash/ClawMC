import { jest } from '@jest/globals';
import {
  TestFirstLoop,
  createTestFirstLoop,
  getTestFirstLoop,
  resetTestFirstLoop,
  FORBIDDEN_PATTERNS,
  REQUIREMENTS
} from '../../../src/skills/testFirst.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

describe('TestFirstLoop', () => {
  let testFirst;

  beforeEach(() => {
    resetTestFirstLoop();
    testFirst = new TestFirstLoop();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('checkSafety', () => {
    it('should return valid for safe code', () => {
      const safeCode = `
        async function skill(bot, state, params) {
          try {
            await bot.chat('Hello');
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      `;

      const result = testFirst.checkSafety(safeCode);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect require() pattern', () => {
      const unsafeCode = `const fs = require('fs');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('require'))).toBe(true);
    });

    it('should detect import pattern', () => {
      const unsafeCode = `import { something } from 'module';`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should detect eval() pattern', () => {
      const unsafeCode = `eval('malicious code');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('eval'))).toBe(true);
    });

    it('should detect Function() pattern', () => {
      const unsafeCode = `new Function('return this')();`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('Function'))).toBe(true);
    });

    it('should detect process access', () => {
      const unsafeCode = `const env = process.env;`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('process'))).toBe(true);
    });

    it('should detect fs access', () => {
      const unsafeCode = `fs.readFile('/etc/passwd');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('fs'))).toBe(true);
    });

    it('should detect child_process access', () => {
      const unsafeCode = `child_process.spawn('rm', ['-rf', '/']);`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('child_process'))).toBe(true);
    });

    it('should detect http access', () => {
      const unsafeCode = `http.get('http://evil.com');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('http'))).toBe(true);
    });

    it('should detect https access', () => {
      const unsafeCode = `https.request('https://evil.com');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('https'))).toBe(true);
    });

    it('should detect net access', () => {
      const unsafeCode = `net.connect(8080, 'evil.com');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('net'))).toBe(true);
    });

    it('should detect __dirname access', () => {
      const unsafeCode = `const dir = __dirname;`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('__dirname'))).toBe(true);
    });

    it('should detect __filename access', () => {
      const unsafeCode = `const file = __filename;`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('__filename'))).toBe(true);
    });

    it('should detect globalThis access', () => {
      const unsafeCode = `globalThis.someVar = 1;`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('globalThis'))).toBe(true);
    });

    it('should detect __proto__ access', () => {
      const unsafeCode = `obj.__proto__ = malicious;`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('__proto__'))).toBe(true);
    });

    it('should detect Reflect access', () => {
      const unsafeCode = `Reflect.get(obj, 'secret');`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('Reflect'))).toBe(true);
    });

    it('should detect Proxy usage', () => {
      const unsafeCode = `new Proxy({}, {});`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('Proxy'))).toBe(true);
    });

    it('should detect suspicious string concatenation', () => {
      const unsafeCode = `const evil = 'req' + 'uire'; eval(evil);`;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Suspicious string concatenation detected');
    });

    it('should return invalid for empty code', () => {
      const result = testFirst.checkSafety('');

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Code must be a non-empty string');
    });

    it('should return invalid for non-string code', () => {
      const result = testFirst.checkSafety(null);

      expect(result.valid).toBe(false);
      expect(result.violations).toContain('Code must be a non-empty string');
    });

    it('should detect multiple violations', () => {
      const unsafeCode = `
        const fs = require('fs');
        const proc = process;
        eval('code');
      `;

      const result = testFirst.checkSafety(unsafeCode);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('checkBasicRequirements', () => {
    it('should pass for valid async skill code with try/catch and bot usage', () => {
      const validCode = `
        async function skill(bot, state, params) {
          try {
            await bot.chat('Hello');
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      `;

      const result = testFirst.checkBasicRequirements(validCode, 'test task');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail for non-async code without await', () => {
      const syncCode = `
        function skill(bot, state, params) {
          try {
            bot.chat('Hello');
            return { success: true };
          } catch (error) {
            return { success: false };
          }
        }
      `;

      const result = testFirst.checkBasicRequirements(syncCode, 'test task');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Code must be async or use await (async operations)');
    });

    it('should pass for code with await even without async keyword', () => {
      const codeWithAwait = `
        try {
          await bot.chat('Hello');
          return { success: true };
        } catch (error) {
          return { success: false };
        }
      `;

      const result = testFirst.checkBasicRequirements(codeWithAwait, 'test task');

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail for code without try/catch', () => {
      const noTryCatchCode = `
        async function skill(bot, state, params) {
          await bot.chat('Hello');
          return { success: true };
        }
      `;

      const result = testFirst.checkBasicRequirements(noTryCatchCode, 'test task');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Code must have try/catch for error handling');
    });

    it('should fail for code without bot usage', () => {
      const noBotCode = `
        async function skill(notBot, state, params) {
          try {
            return { success: true };
          } catch (error) {
            return { success: false };
          }
        }
      `;

      const result = testFirst.checkBasicRequirements(noBotCode, 'test task');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Code must use the bot parameter');
    });

    it('should fail for code missing all requirements', () => {
      const badCode = `
        function skill() {
          return { success: true };
        }
      `;

      const result = testFirst.checkBasicRequirements(badCode, 'test task');

      expect(result.valid).toBe(false);
      // Missing: async/await, try/catch, bot usage
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });

    it('should return invalid for empty code', () => {
      const result = testFirst.checkBasicRequirements('', 'test task');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Code must be a non-empty string');
    });

    it('should pass for async arrow function', () => {
      const arrowCode = `
        const skill = async (bot, state, params) => {
          try {
            await bot.chat('Hello');
            return { success: true };
          } catch (error) {
            return { success: false };
          }
        };
      `;

      const result = testFirst.checkBasicRequirements(arrowCode, 'test task');

      expect(result.valid).toBe(true);
    });
  });

  describe('createMockBot', () => {
    it('should create a mock bot with all required properties', () => {
      const mockBot = testFirst.createMockBot();

      expect(mockBot).toBeDefined();
      expect(mockBot.entity).toBeDefined();
      expect(mockBot.entity.position).toBeDefined();
      expect(mockBot.health).toBe(20);
      expect(mockBot.food).toBe(20);
    });

    it('should have pathfinder mock', () => {
      const mockBot = testFirst.createMockBot();

      expect(mockBot.pathfinder).toBeDefined();
      expect(typeof mockBot.pathfinder.goto).toBe('function');
      expect(typeof mockBot.pathfinder.stop).toBe('function');
      expect(typeof mockBot.pathfinder.setGoal).toBe('function');
    });

    it('should have inventory mock', () => {
      const mockBot = testFirst.createMockBot();

      expect(mockBot.inventory).toBeDefined();
      expect(typeof mockBot.inventory.items).toBe('function');
      expect(typeof mockBot.inventory.itemCount).toBe('function');
    });

    it('should have action methods', () => {
      const mockBot = testFirst.createMockBot();

      expect(typeof mockBot.dig).toBe('function');
      expect(typeof mockBot.placeBlock).toBe('function');
      expect(typeof mockBot.equip).toBe('function');
      expect(typeof mockBot.toss).toBe('function');
      expect(typeof mockBot.attack).toBe('function');
      expect(typeof mockBot.chat).toBe('function');
    });

    it('should have async action methods', async () => {
      const mockBot = testFirst.createMockBot();

      const digResult = await mockBot.dig();
      expect(digResult.success).toBe(true);

      const chatResult = mockBot.chat('test');
      expect(mockBot._lastChat).toBe('test');
    });

    it('should return empty arrays for findBlocks', () => {
      const mockBot = testFirst.createMockBot();

      const blocks = mockBot.findBlocks();
      expect(Array.isArray(blocks)).toBe(true);
      expect(blocks).toHaveLength(0);
    });

    it('should return null for blockAt', () => {
      const mockBot = testFirst.createMockBot();

      const block = mockBot.blockAt();
      expect(block).toBeNull();
    });
  });

  describe('runSimulatedTest', () => {
    it('should pass for valid skill code', async () => {
      const validCode = `
        try {
          await bot.chat('test');
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const result = await testFirst.runSimulatedTest(validCode, 'test task');

      expect(result.passed).toBe(true);
    });

    it('should fail for code that throws an error', async () => {
      const errorCode = `
        throw new Error('Test error');
      `;

      const result = await testFirst.runSimulatedTest(errorCode, 'test task');

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should timeout for infinite loop code', async () => {
      jest.useFakeTimers();

      const infiniteCode = `
        while (true) {
          await new Promise(r => setTimeout(r, 1000));
        }
      `;

      const testPromise = testFirst.runSimulatedTest(infiniteCode, 'test task');

      // Fast-forward time
      await jest.advanceTimersByTimeAsync(10000);

      const result = await testPromise;

      expect(result.passed).toBe(false);
      expect(result.error).toContain('timed out');

      jest.useRealTimers();
    }, 10000);

    it('should allow setTimeout within limits', async () => {
      const validCode = `
        try {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const result = await testFirst.runSimulatedTest(validCode, 'test task');

      expect(result.passed).toBe(true);
    });

    it('should reject setTimeout exceeding limit', async () => {
      // When setTimeout is called with ms > 1000 inside a Promise executor,
      // the throw happens synchronously and becomes a rejected promise.
      // The code's catch block catches it and returns the error message.
      const invalidCode = `
        try {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const result = await testFirst.runSimulatedTest(invalidCode, 'test task');

      // The code runs successfully and catches the setTimeout error
      expect(result.passed).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.error).toContain('setTimeout');
    });

    it('should provide mock bot with working methods', async () => {
      const code = `
        try {
          const pos = bot.entity.position;
          await bot.pathfinder.goto();
          return { success: true, position: pos };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const result = await testFirst.runSimulatedTest(code, 'test task');

      expect(result.passed).toBe(true);
      expect(result.result.position).toBeDefined();
    });

    it('should provide mock state with working methods', async () => {
      const code = `
        try {
          const pos = state.getPosition();
          const vitals = state.getVitals();
          return { success: true, pos, vitals };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const result = await testFirst.runSimulatedTest(code, 'test task');

      expect(result.passed).toBe(true);
      expect(result.result.pos).toBeDefined();
      expect(result.result.vitals).toBeDefined();
    });
  });

  describe('generateAndTest', () => {
    it('should successfully generate and validate skill code', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockResolvedValue(`
          try {
            await bot.chat('Hello');
            return { success: true };
          } catch (error) {
            return { success: false, error: error.message };
          }
        `)
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM);

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.attempts).toBe(1);
    });

    it('should retry on safety violation', async () => {
      const mockLLM = {
        generateSkill: jest.fn()
          .mockResolvedValueOnce(`require('fs');`) // First attempt: unsafe
          .mockResolvedValueOnce(`
            try {
              await bot.chat('Fixed');
              return { success: true };
            } catch (error) {
              return { success: false, error: error.message };
            }
          `) // Second attempt: safe
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM);

      expect(result.success).toBe(true);
      expect(mockLLM.generateSkill).toHaveBeenCalledTimes(2);
    });

    it('should retry on missing requirements', async () => {
      const mockLLM = {
        generateSkill: jest.fn()
          .mockResolvedValueOnce(`
            bot.chat('No async or try/catch');
          `) // Missing async and try/catch
          .mockResolvedValueOnce(`
            async function skill(bot, state, params) {
              try {
                await bot.chat('Fixed');
                return { success: true };
              } catch (error) {
                return { success: false };
              }
            }
          `) // Fixed
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM);

      expect(result.success).toBe(true);
      expect(mockLLM.generateSkill).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockResolvedValue(`require('fs');`)
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM, { maxRetries: 2 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed');
      expect(mockLLM.generateSkill).toHaveBeenCalledTimes(2);
    });

    it('should handle LLM returning invalid code', async () => {
      const mockLLM = {
        generateSkill: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce('')
          .mockResolvedValueOnce(`
            try {
              await bot.chat('Valid');
              return { success: true };
            } catch (error) {
              return { success: false };
            }
          `)
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM);

      expect(result.success).toBe(true);
      expect(mockLLM.generateSkill).toHaveBeenCalledTimes(3);
    });

    it('should handle LLM throwing error', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockRejectedValue(new Error('LLM error'))
      };

      const result = await testFirst.generateAndTest('say hello', mockLLM, { maxRetries: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM error');
    });

    it('should use custom maxRetries', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockResolvedValue(`require('fs');`)
      };

      const customTestFirst = new TestFirstLoop({ maxRetries: 5 });
      const result = await customTestFirst.generateAndTest('say hello', mockLLM);

      expect(result.success).toBe(false);
      expect(mockLLM.generateSkill).toHaveBeenCalledTimes(5);
    });
  });

  describe('test history', () => {
    it('should record test attempts in history', async () => {
      const mockLLM = {
        generateSkill: jest.fn()
          .mockResolvedValueOnce(`require('fs');`)
          .mockResolvedValueOnce(`
            try {
              await bot.chat('Hello');
              return { success: true };
            } catch (error) {
              return { success: false };
            }
          `)
      };

      await testFirst.generateAndTest('say hello', mockLLM);

      const history = testFirst.getTestHistory();

      expect(history).toHaveLength(2);
      expect(history[0].passed).toBe(false);
      expect(history[0].stage).toBe('safety');
      expect(history[1].passed).toBe(true);
    });

    it('should clear history', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockResolvedValue(`require('fs');`)
      };

      await testFirst.generateAndTest('say hello', mockLLM, { maxRetries: 1 });

      testFirst.clearHistory();

      const history = testFirst.getTestHistory();
      expect(history).toHaveLength(0);
    });

    it('should limit history to 100 entries', async () => {
      const mockLLM = {
        generateSkill: jest.fn().mockResolvedValue(`require('fs');`)
      };

      // Generate 105 test entries
      for (let i = 0; i < 105; i++) {
        await testFirst.generateAndTest('test', mockLLM, { maxRetries: 1 });
      }

      const history = testFirst.getTestHistory();

      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('singleton functions', () => {
    it('should create singleton instance', () => {
      const instance1 = getTestFirstLoop();
      const instance2 = getTestFirstLoop();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getTestFirstLoop();
      resetTestFirstLoop();
      const instance2 = getTestFirstLoop();

      expect(instance1).not.toBe(instance2);
    });

    it('should create new instance with config', () => {
      const instance = createTestFirstLoop({ maxRetries: 10 });

      expect(instance.config.maxRetries).toBe(10);
    });
  });

  describe('FORBIDDEN_PATTERNS export', () => {
    it('should export forbidden patterns array', () => {
      expect(Array.isArray(FORBIDDEN_PATTERNS)).toBe(true);
      expect(FORBIDDEN_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should include require pattern', () => {
      const hasRequire = FORBIDDEN_PATTERNS.some(p => p.test('require()'));
      expect(hasRequire).toBe(true);
    });

    it('should include import pattern', () => {
      const hasImport = FORBIDDEN_PATTERNS.some(p => p.test("import x from 'y'"));
      expect(hasImport).toBe(true);
    });

    it('should include eval pattern', () => {
      const hasEval = FORBIDDEN_PATTERNS.some(p => p.test('eval()'));
      expect(hasEval).toBe(true);
    });
  });

  describe('REQUIREMENTS export', () => {
    it('should export requirements object', () => {
      expect(REQUIREMENTS).toBeDefined();
      expect(REQUIREMENTS.MUST_BE_ASYNC_OR_AWAIT).toBeDefined();
      expect(REQUIREMENTS.MUST_HAVE_TRY_CATCH).toBeDefined();
      expect(REQUIREMENTS.MUST_USE_BOT).toBeDefined();
    });

    it('should have pattern and description for each requirement', () => {
      expect(REQUIREMENTS.MUST_BE_ASYNC_OR_AWAIT.pattern).toBeInstanceOf(RegExp);
      expect(REQUIREMENTS.MUST_BE_ASYNC_OR_AWAIT.description).toBeDefined();
      expect(REQUIREMENTS.MUST_HAVE_TRY_CATCH.pattern).toBeInstanceOf(RegExp);
      expect(REQUIREMENTS.MUST_HAVE_TRY_CATCH.description).toBeDefined();
      expect(REQUIREMENTS.MUST_USE_BOT.pattern).toBeInstanceOf(RegExp);
      expect(REQUIREMENTS.MUST_USE_BOT.description).toBeDefined();
    });
  });
});