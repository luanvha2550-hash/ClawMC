import { jest } from '@jest/globals';
import { SkillExecutor, createSkillExecutor, getSkillExecutor, resetSkillExecutor, FORBIDDEN_PATTERNS, ALLOWED_BOT_METHODS } from '../../../src/skills/executor.js';
import { resetTurnLimiter } from '../../../src/skills/turnLimiter.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

describe('SkillExecutor', () => {
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    executor = new SkillExecutor();
    resetTurnLimiter();

    mockBot = {
      entity: {
        position: { x: 100, y: 64, z: 200 },
        velocity: { x: 0, y: 0, z: 0 }
      },
      health: 20,
      food: 20,
      inventory: {
        items: () => [{ name: 'stone', count: 64, slot: 0 }],
        slots: []
      },
      chat: jest.fn(),
      dig: jest.fn().mockResolvedValue(true),
      placeBlock: jest.fn().mockResolvedValue(true),
      findBlocks: jest.fn().mockReturnValue([{ x: 0, y: 0, z: 0 }]),
      blockAt: jest.fn(),
      lookAt: jest.fn().mockResolvedValue(true),
      nearestEntity: jest.fn().mockReturnValue(null),
      attack: jest.fn().mockResolvedValue(true),
      equip: jest.fn().mockResolvedValue(true),
      toss: jest.fn().mockResolvedValue(true),
      openChest: jest.fn().mockResolvedValue({}),
      closeWindow: jest.fn(),
      craft: jest.fn().mockResolvedValue(true),
      pathfinder: {
        goto: jest.fn().mockResolvedValue(true),
        stop: jest.fn(),
        setGoal: jest.fn(),
        isMoving: false
      }
    };

    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 100, y: 64, z: 200 }),
      getVitals: jest.fn().mockReturnValue({ health: 20, food: 20 }),
      getInventory: jest.fn().mockReturnValue([]),
      isBusy: jest.fn().mockReturnValue(false),
      currentTask: null,
      following: null
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    resetSkillExecutor();
    resetTurnLimiter();
  });

  describe('execute', () => {
    it('should execute a skill successfully', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      const result = await executor.execute(skill, mockBot, mockState, { param: 'value' });

      expect(result.success).toBe(true);
      expect(skill.execute).toHaveBeenCalledWith(mockBot, mockState, { param: 'value' });
    });

    it('should return error for invalid skill', async () => {
      const result = await executor.execute(null, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid skill');
    });

    it('should timeout on long-running skill', async () => {
      const skill = {
        name: 'slowSkill',
        execute: jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(resolve, 1000));
        })
      };

      const result = await executor.execute(skill, mockBot, mockState, {}, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.timedOut).toBe(true);
    });

    it('should handle skill errors', async () => {
      const skill = {
        name: 'failingSkill',
        execute: jest.fn().mockRejectedValue(new Error('Skill failed'))
      };

      const result = await executor.execute(skill, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Skill failed');
    });

    it('should include execution duration', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      const result = await executor.execute(skill, mockBot, mockState);

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
    });

    it('should include executionId', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      const result = await executor.execute(skill, mockBot, mockState);

      expect(result.executionId).toBeDefined();
    });

    it('should use custom timeout from options', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve({ success: true }), 200));
        })
      };

      // Should succeed with 300ms timeout
      const result = await executor.execute(skill, mockBot, mockState, {}, { timeout: 300 });
      expect(result.success).toBe(true);
    });
  });

  describe('validateSafety', () => {
    it('should pass safe code', () => {
      const safeCode = `
        const x = 5;
        const y = bot.position.x + 10;
        return { success: true };
      `;

      const result = executor.validateSafety(safeCode);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block require()', () => {
      const result = executor.validateSafety('require("fs")');
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.includes('require'))).toBe(true);
    });

    it('should block import statements', () => {
      const result = executor.validateSafety('import fs from "fs"');
      expect(result.valid).toBe(false);
    });

    it('should block eval()', () => {
      const result = executor.validateSafety('eval("code")');
      expect(result.valid).toBe(false);
    });

    it('should block Function constructor', () => {
      const result = executor.validateSafety('new Function("return 1")');
      expect(result.valid).toBe(false);
    });

    it('should block process access', () => {
      const result = executor.validateSafety('process.exit(0)');
      expect(result.valid).toBe(false);
    });

    it('should block __dirname and __filename', () => {
      expect(executor.validateSafety('__dirname').valid).toBe(false);
      expect(executor.validateSafety('__filename').valid).toBe(false);
    });

    it('should block fs operations', () => {
      const result = executor.validateSafety('fs.readFile("test")');
      expect(result.valid).toBe(false);
    });

    it('should block child_process', () => {
      const result = executor.validateSafety('spawn("ls")');
      expect(result.valid).toBe(false);
    });

    it('should block network operations', () => {
      expect(executor.validateSafety('fetch("http://evil.com")').valid).toBe(false);
      expect(executor.validateSafety('http.get("url")').valid).toBe(false);
    });

    it('should block Buffer constructor', () => {
      const result = executor.validateSafety('new Buffer(10)');
      expect(result.valid).toBe(false);
    });

    it('should block globalThis', () => {
      const result = executor.validateSafety('globalThis.process');
      expect(result.valid).toBe(false);
    });

    it('should block __proto__', () => {
      const result = executor.validateSafety('obj.__proto__');
      expect(result.valid).toBe(false);
    });

    it('should block Proxy and Reflect', () => {
      expect(executor.validateSafety('new Proxy({}, {})').valid).toBe(false);
      expect(executor.validateSafety('Reflect.get(obj, "key")').valid).toBe(false);
    });

    it('should detect suspicious string concatenation', () => {
      const result = executor.validateSafety('"req" + "uire(" + "fs)")');
      expect(result.valid).toBe(false);
    });

    it('should return multiple violations', () => {
      const result = executor.validateSafety('require("fs"); eval("code")');
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });

    it('should reject non-string code', () => {
      expect(executor.validateSafety(null).valid).toBe(false);
      expect(executor.validateSafety('').valid).toBe(false);
      expect(executor.validateSafety(123).valid).toBe(false);
    });
  });

  describe('executeDynamic', () => {
    it('should execute safe dynamic code', async () => {
      const code = `
        const x = params.value || 1;
        return { success: true, result: x * 2 };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState, { value: 5 });

      expect(result.success).toBe(true);
      expect(result.result.result).toBe(10);
    });

    it('should reject unsafe code', async () => {
      const code = 'require("fs")';

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety validation failed');
      expect(result.violations).toBeDefined();
    });

    it('should handle sandbox errors', async () => {
      const code = `
        throw new Error('Sandbox error');
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sandbox error');
    });

    it('should provide bot access in sandbox', async () => {
      const code = `
        const pos = bot.position;
        return { success: true, x: pos.x };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(true);
      expect(result.result.x).toBe(100);
    });

    it('should provide state access in sandbox', async () => {
      const code = `
        const pos = state.getPosition();
        return { success: true, position: pos };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(true);
    });

    it('should provide params in sandbox', async () => {
      const code = `
        return { success: true, received: params.test };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState, { test: 'value' });

      expect(result.success).toBe(true);
      expect(result.result.received).toBe('value');
    });

    it('should provide safe console in sandbox', async () => {
      const code = `
        console.log('test message');
        return { success: true };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(true);
    });

    it('should provide Math and Date in sandbox', async () => {
      const code = `
        const num = Math.max(1, 2, 3);
        const now = Date.now();
        return { success: true, num, now };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(true);
      expect(result.result.num).toBe(3);
      expect(result.result.now).toBeDefined();
    });

    it('should block forbidden globals in sandbox', async () => {
      // Code trying to access process should be rejected by safety validation
      const code = `
        return { success: true, processType: typeof process };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      // Should fail safety validation because 'process' is a forbidden pattern
      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety validation failed');
    });
  });

  describe('createBotProxy', () => {
    it('should return null for null bot', () => {
      const proxy = executor.createBotProxy(null);
      expect(proxy).toBeNull();
    });

    it('should provide allowed methods', () => {
      const proxy = executor.createBotProxy(mockBot);

      expect(typeof proxy.chat).toBe('function');
      expect(typeof proxy.dig).toBe('function');
    });

    it('should provide allowed properties', () => {
      const proxy = executor.createBotProxy(mockBot);

      expect(proxy.position).toBeDefined();
      expect(proxy.position.x).toBe(100);
    });

    it('should not allow forbidden methods', () => {
      // Add a forbidden method to mock bot
      mockBot.dangerousMethod = jest.fn();

      const proxy = executor.createBotProxy(mockBot);

      expect(proxy.dangerousMethod).toBeUndefined();
    });

    it('should freeze the proxy', () => {
      const proxy = executor.createBotProxy(mockBot);

      expect(Object.isFrozen(proxy)).toBe(true);
    });

    it('should proxy pathfinder correctly', () => {
      const proxy = executor.createBotProxy(mockBot);

      expect(proxy.pathfinder).toBeDefined();
      expect(typeof proxy.pathfinder.goto).toBe('function');
      expect(typeof proxy.pathfinder.stop).toBe('function');
    });

    it('should proxy inventory correctly', () => {
      const proxy = executor.createBotProxy(mockBot);

      expect(proxy.inventory).toBeDefined();
      expect(typeof proxy.inventory.items).toBe('function');
    });
  });

  describe('createSafeConsole', () => {
    it('should return safe console methods', () => {
      const safeConsole = executor.createSafeConsole();

      expect(typeof safeConsole.log).toBe('function');
      expect(typeof safeConsole.info).toBe('function');
      expect(typeof safeConsole.warn).toBe('function');
      expect(typeof safeConsole.error).toBe('function');
    });
  });

  describe('getActiveExecutions', () => {
    it('should return empty array when no executions', () => {
      const active = executor.getActiveExecutions();
      expect(active).toHaveLength(0);
    });

    it('should track active executions', async () => {
      const skill = {
        name: 'slowSkill',
        execute: jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve({ success: true }), 100));
        })
      };

      const executePromise = executor.execute(skill, mockBot, mockState);

      // Check during execution
      const activeDuring = executor.getActiveExecutions();
      expect(activeDuring.length).toBeGreaterThanOrEqual(1);

      await executePromise;

      // Check after execution
      const activeAfter = executor.getActiveExecutions();
      expect(activeAfter).toHaveLength(0);
    });
  });

  describe('cancelExecution', () => {
    it('should cancel active execution', async () => {
      const skill = {
        name: 'slowSkill',
        execute: jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(() => resolve({ success: true }), 10000));
        })
      };

      const executePromise = executor.execute(skill, mockBot, mockState);
      const executionId = executor.executionId;

      const cancelled = executor.cancelExecution(executionId);
      expect(cancelled).toBe(true);
    });

    it('should return false for non-existent execution', () => {
      const cancelled = executor.cancelExecution(999);
      expect(cancelled).toBe(false);
    });
  });

  describe('turn limiter integration', () => {
    it('should use turn limiter for retries', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockRejectedValue(new Error('Failed'))
      };

      await executor.execute(skill, mockBot, mockState, {}, { turnKey: 'test' });

      const status = executor.turnLimiter.getStatus();
      expect(status.attempts).toBe(1);
      expect(status.errors).toHaveLength(1);
    });

    it('should record success in turn limiter', async () => {
      const skill = {
        name: 'testSkill',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      executor.turnLimiter.startGeneration({ type: 'test' });

      await executor.execute(skill, mockBot, mockState, {}, { turnKey: 'test' });

      const status = executor.turnLimiter.getStatus();
      expect(status.stats.successfulCycles).toBe(1);
    });
  });

  describe('singleton functions', () => {
    it('should return singleton instance', () => {
      const instance1 = getSkillExecutor();
      const instance2 = getSkillExecutor();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance with createSkillExecutor', () => {
      const instance1 = getSkillExecutor();
      const instance2 = createSkillExecutor({ skillTimeout: 60000 });
      expect(instance2).not.toBe(instance1);
      expect(instance2.config.skillTimeout).toBe(60000);
    });

    it('should reset singleton', () => {
      const instance1 = getSkillExecutor();
      resetSkillExecutor();
      const instance2 = getSkillExecutor();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('configuration', () => {
    it('should use default timeouts', () => {
      expect(executor.config.skillTimeout).toBe(30000);
      expect(executor.config.dynamicTimeout).toBe(10000);
    });

    it('should accept custom timeouts', () => {
      const customExecutor = new SkillExecutor({
        skillTimeout: 60000,
        dynamicTimeout: 5000
      });

      expect(customExecutor.config.skillTimeout).toBe(60000);
      expect(customExecutor.config.dynamicTimeout).toBe(5000);
    });
  });
});

describe('FORBIDDEN_PATTERNS', () => {
  it('should contain patterns for require', () => {
    expect(FORBIDDEN_PATTERNS.some(p => p.test('require("fs")'))).toBe(true);
  });

  it('should contain patterns for import', () => {
    expect(FORBIDDEN_PATTERNS.some(p => p.test('import x from "y"'))).toBe(true);
  });

  it('should contain patterns for eval', () => {
    expect(FORBIDDEN_PATTERNS.some(p => p.test('eval("code")'))).toBe(true);
  });

  it('should contain patterns for process', () => {
    expect(FORBIDDEN_PATTERNS.some(p => p.test('process.exit()'))).toBe(true);
  });
});

describe('ALLOWED_BOT_METHODS', () => {
  it('should include pathfinder', () => {
    expect(ALLOWED_BOT_METHODS).toContain('pathfinder');
  });

  it('should include dig', () => {
    expect(ALLOWED_BOT_METHODS).toContain('dig');
  });

  it('should include chat', () => {
    expect(ALLOWED_BOT_METHODS).toContain('chat');
  });

  it('should include inventory methods', () => {
    expect(ALLOWED_BOT_METHODS).toContain('inventory');
    expect(ALLOWED_BOT_METHODS).toContain('equip');
    expect(ALLOWED_BOT_METHODS).toContain('toss');
  });
});