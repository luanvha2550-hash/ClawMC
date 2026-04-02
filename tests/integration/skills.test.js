// tests/integration/skills.test.js
// Integration tests for Skills Layer components
//
// Tests Registry + Executor + TurnLimiter integration

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMockBot, createMockState, createMockMemory, createTestEnvironment } from '../mocks/bot.mock.js';

// Module imports
let SkillRegistry, createSkillRegistry, getSkillRegistry, resetSkillRegistry;
let SkillExecutor, createSkillExecutor, getSkillExecutor, resetSkillExecutor;
let TurnLimiter, createTurnLimiter, getTurnLimiter, resetTurnLimiter;

// Load modules before tests
beforeAll(async () => {
  process.env.SERVER_HOST = 'localhost';
  process.env.SERVER_PORT = '25565';
  process.env.SERVER_VERSION = '1.20.4';
  process.env.BOT_NAME = 'TestBot';
  process.env.BOT_OWNER = 'TestOwner';

  const skillsModule = await import('../../src/skills/index.js');
  SkillRegistry = skillsModule.SkillRegistry;
  createSkillRegistry = skillsModule.createSkillRegistry;
  getSkillRegistry = skillsModule.getSkillRegistry;
  resetSkillRegistry = skillsModule.resetSkillRegistry;

  const executorModule = await import('../../src/skills/executor.js');
  SkillExecutor = executorModule.SkillExecutor;
  createSkillExecutor = executorModule.createSkillExecutor;
  getSkillExecutor = executorModule.getSkillExecutor;
  resetSkillExecutor = executorModule.resetSkillExecutor;

  const turnLimiterModule = await import('../../src/skills/turnLimiter.js');
  TurnLimiter = turnLimiterModule.TurnLimiter;
  createTurnLimiter = turnLimiterModule.createTurnLimiter;
  getTurnLimiter = turnLimiterModule.getTurnLimiter;
  resetTurnLimiter = turnLimiterModule.resetTurnLimiter;
});

afterAll(() => {
  delete process.env.SERVER_HOST;
  delete process.env.SERVER_PORT;
  delete process.env.SERVER_VERSION;
  delete process.env.BOT_NAME;
  delete process.env.BOT_OWNER;
});

// ============================================
// Registry + Executor Integration Tests
// ============================================

describe('Registry + Executor Integration', () => {
  let registry;
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    registry = new SkillRegistry();
    executor = new SkillExecutor();
    resetTurnLimiter();

    const env = createTestEnvironment({
      bot: { position: { x: 100, y: 64, z: -200 } },
      state: { isBusy: false }
    });

    mockBot = env.bot;
    mockState = env.state;
  });

  afterEach(() => {
    resetSkillRegistry();
    resetSkillExecutor();
    resetTurnLimiter();
  });

  describe('should register and execute skill', () => {
    it('should register skill and execute it', async () => {
      // Register skill
      const skill = {
        name: 'test_skill',
        description: 'A test skill',
        execute: jest.fn().mockResolvedValue({ success: true, result: 'done' })
      };

      registry.register(skill);

      // Verify registration
      expect(registry.has('test_skill')).toBe(true);
      const registered = registry.get('test_skill');
      expect(registered.name).toBe('test_skill');

      // Execute skill
      const result = await executor.execute(registered, mockBot, mockState, { param: 'value' });

      expect(result.success).toBe(true);
      expect(result.result).toBe('done');
      expect(skill.execute).toHaveBeenCalledWith(mockBot, mockState, { param: 'value' });
    });

    it('should execute skill with parameters', async () => {
      const skill = {
        name: 'parameterized_skill',
        description: 'Skill with parameters',
        execute: jest.fn().mockImplementation(async (bot, state, params) => {
          const { x, y } = params;
          return { success: true, sum: x + y };
        })
      };

      registry.register(skill);
      const registered = registry.get('parameterized_skill');

      const result = await executor.execute(registered, mockBot, mockState, { x: 5, y: 10 });

      expect(result.success).toBe(true);
      expect(result.sum).toBe(15);
    });

    it('should execute skill that interacts with bot', async () => {
      const skill = {
        name: 'chat_skill',
        description: 'Send a chat message',
        execute: async (bot, state, params) => {
          const { message } = params;
          if (!message) {
            return { success: false, error: 'Message required' };
          }
          bot.chat(message);
          return { success: true, message };
        }
      };

      registry.register(skill);
      const registered = registry.get('chat_skill');

      const result = await executor.execute(registered, mockBot, mockState, { message: 'Hello!' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Hello!');
      expect(mockBot.chat).toHaveBeenCalledWith('Hello!');
    });

    it('should execute skill that queries state', async () => {
      const skill = {
        name: 'status_skill',
        description: 'Get bot status',
        execute: async (bot, state, params) => {
          const position = state.getPosition();
          const vitals = state.getVitals();
          return {
            success: true,
            position,
            vitals
          };
        }
      };

      registry.register(skill);
      const registered = registry.get('status_skill');

      const result = await executor.execute(registered, mockBot, mockState);

      expect(result.success).toBe(true);
      expect(result.position).toEqual({ x: 100, y: 64, z: -200 });
      expect(result.vitals).toEqual({ health: 20, food: 20 });
    });
  });

  describe('should handle skill timeout', () => {
    it('should timeout on long-running skill', async () => {
      const skill = {
        name: 'slow_skill',
        description: 'A slow skill',
        execute: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return { success: true };
        })
      };

      registry.register(skill);
      const registered = registry.get('slow_skill');

      const result = await executor.execute(registered, mockBot, mockState, {}, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.timedOut).toBe(true);
    });

    it('should complete within timeout', async () => {
      const skill = {
        name: 'fast_skill',
        description: 'A fast skill',
        execute: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true };
        })
      };

      registry.register(skill);
      const registered = registry.get('fast_skill');

      const result = await executor.execute(registered, mockBot, mockState, {}, { timeout: 1000 });

      expect(result.success).toBe(true);
      expect(result.duration).toBeDefined();
    });

    it('should use default timeout when not specified', async () => {
      const skill = {
        name: 'default_timeout_skill',
        description: 'Uses default timeout',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      registry.register(skill);
      const registered = registry.get('default_timeout_skill');

      // Should use default timeout (30000ms)
      const result = await executor.execute(registered, mockBot, mockState);

      expect(result.success).toBe(true);
    });
  });

  describe('should handle skill error', () => {
    it('should catch and return skill errors', async () => {
      const skill = {
        name: 'failing_skill',
        description: 'A skill that fails',
        execute: jest.fn().mockRejectedValue(new Error('Skill failed!'))
      };

      registry.register(skill);
      const registered = registry.get('failing_skill');

      const result = await executor.execute(registered, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Skill failed!');
      expect(result.timedOut).toBe(false);
    });

    it('should handle synchronous errors', async () => {
      const skill = {
        name: 'sync_error_skill',
        description: 'A skill with sync error',
        execute: async () => {
          throw new Error('Sync error');
        }
      };

      registry.register(skill);
      const registered = registry.get('sync_error_skill');

      const result = await executor.execute(registered, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sync error');
    });

    it('should include error duration', async () => {
      const skill = {
        name: 'error_skill',
        description: 'A skill that errors',
        execute: jest.fn().mockRejectedValue(new Error('Error'))
      };

      registry.register(skill);
      const registered = registry.get('error_skill');

      const result = await executor.execute(registered, mockBot, mockState);

      expect(result.duration).toBeDefined();
      expect(typeof result.duration).toBe('number');
    });

    it('should handle invalid skill', async () => {
      const result = await executor.execute(null, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid skill');
    });

    it('should handle missing bot', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn()
      };

      const result = await executor.execute(skill, null, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Bot instance is required');
    });

    it('should handle missing state', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn()
      };

      const result = await executor.execute(skill, mockBot, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('State instance is required');
    });
  });
});

// ============================================
// Turn Limiter Behavior Tests
// ============================================

describe('Turn Limiter Behavior', () => {
  let registry;
  let executor;
  let turnLimiter;
  let mockBot;
  let mockState;

  beforeEach(() => {
    registry = new SkillRegistry();
    turnLimiter = new TurnLimiter({ maxAttempts: 3, maxRepeatedErrors: 1 });
    executor = new SkillExecutor({ turnLimiter });

    const env = createTestEnvironment({
      bot: { position: { x: 100, y: 64, z: -200 } }
    });
    mockBot = env.bot;
    mockState = env.state;
  });

  afterEach(() => {
    resetSkillRegistry();
    resetSkillExecutor();
    resetTurnLimiter();
  });

  describe('should limit retries', () => {
    it('should allow first attempt', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      const status = turnLimiter.getStatus();
      expect(status.canRetry).toBe(true);
      expect(status.attempts).toBe(0);
    });

    it('should allow retry after first error', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Failed'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // First attempt
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });

      const status = turnLimiter.getStatus();
      expect(status.attempts).toBe(1);
      expect(status.canRetry).toBe(true);
      expect(status.remainingAttempts).toBe(2);
    });

    it('should block after max attempts', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Failed'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // Multiple attempts
      for (let i = 0; i < 3; i++) {
        await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });
      }

      const status = turnLimiter.getStatus();
      expect(status.attempts).toBe(3);
      expect(status.canRetry).toBe(false);
    });

    it('should reset after successful execution', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn()
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce({ success: true })
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // First attempt fails
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });
      expect(turnLimiter.getStatus().attempts).toBe(1);

      // Second attempt succeeds
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });
      expect(turnLimiter.getStatus().stats.successfulCycles).toBe(1);
    });
  });

  describe('should detect repeated errors', () => {
    it('should block on repeated identical errors', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Same error'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // First error
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });

      // Second attempt with same error
      const canRetry = turnLimiter.canRetry(new Error('Same error'));
      expect(canRetry.canRetry).toBe(false);
      expect(canRetry.reason).toBe('repeated_error');
    });

    it('should allow different errors', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn()
          .mockRejectedValueOnce(new Error('Error 1'))
          .mockRejectedValueOnce(new Error('Error 2'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // First error
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });

      // Different error should still be allowed
      const canRetry = turnLimiter.canRetry(new Error('Different error'));
      expect(canRetry.canRetry).toBe(true);
    });

    it('should track error counts correctly', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Test error'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });

      const context = turnLimiter.generateErrorContext();
      expect(context).not.toBeNull();
      expect(context.attempts).toBe(1);
      expect(context.lastError).toBe('Test error');
    });

    it('should generate error context for re-prompting', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Timeout'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });

      const context = turnLimiter.generateErrorContext();
      expect(context).not.toBeNull();
      expect(context.lastError).toBe('Timeout');
      expect(context.allErrors).toContain('Timeout');
      expect(context.suggestion).toBeDefined();
    });
  });

  describe('should use fallback threshold', () => {
    it('should not use fallback initially', () => {
      turnLimiter.startGeneration({ type: 'test' });
      expect(turnLimiter.shouldUseFallback()).toBe(false);
    });

    it('should suggest fallback after threshold', async () => {
      const skill = {
        name: 'test',
        description: 'Test',
        execute: jest.fn().mockRejectedValue(new Error('Failed'))
      };

      registry.register(skill);
      turnLimiter.startGeneration({ type: 'test' });

      // First error (threshold is 2)
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });
      expect(turnLimiter.shouldUseFallback()).toBe(false);

      // Second error - reaches threshold
      await executor.execute(registry.get('test'), mockBot, mockState, {}, { turnKey: 'test' });
      expect(turnLimiter.shouldUseFallback()).toBe(true);
    });
  });
});

// ============================================
// Load All Base Skills Tests
// ============================================

describe('Load All Base Skills', () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  afterEach(() => {
    resetSkillRegistry();
  });

  describe('should load all base skills from directory', () => {
    it('should load skills from base directory', async () => {
      const skillsDir = path.join(process.cwd(), 'src', 'skills', 'base');

      const count = await registry.loadBaseSkills(skillsDir);

      // Should load at least some skills
      expect(count).toBeGreaterThan(0);
    });

    it('should have all expected skill names', async () => {
      const skillsDir = path.join(process.cwd(), 'src', 'skills', 'base');
      await registry.loadBaseSkills(skillsDir);

      const names = registry.getNames();

      // Check for expected skills
      const expectedSkills = ['walk', 'stop', 'come', 'follow', 'mine', 'craft', 'attack', 'collect', 'store', 'inventory', 'say', 'escape'];

      for (const skillName of expectedSkills) {
        expect(names).toContain(skillName);
      }
    });

    it('should handle non-existent directory gracefully', async () => {
      const count = await registry.loadBaseSkills('./non-existent-directory');
      expect(count).toBe(0);
    });

    it('should skip invalid skill files', async () => {
      // Create a temp directory with an invalid skill
      const tempDir = path.join(process.cwd(), 'tests', 'tmp', 'skills');
      const fs = await import('fs/promises');

      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(
          path.join(tempDir, 'invalid.js'),
          '// Invalid skill - no export\nconst x = 1;'
        );
        await fs.writeFile(
          path.join(tempDir, 'valid.js'),
          'export default { name: "valid", execute: () => ({ success: true }) };'
        );

        const count = await registry.loadBaseSkills(tempDir);

        // Should load only the valid skill
        expect(count).toBe(1);
        expect(registry.has('valid')).toBe(true);
        expect(registry.has('invalid')).toBe(false);

        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Cleanup on error
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        throw e;
      }
    });
  });

  describe('should list all skill names', () => {
    it('should list loaded skills', async () => {
      const skillsDir = path.join(process.cwd(), 'src', 'skills', 'base');
      await registry.loadBaseSkills(skillsDir);

      const skills = registry.list();
      const names = registry.getNames();

      expect(skills.length).toBe(names.length);

      // All loaded skills should have required properties
      for (const skill of skills) {
        expect(skill.name).toBeDefined();
        expect(skill.execute).toBeDefined();
        expect(skill.type).toBe('base');
      }
    });

    it('should include both base and dynamic skills', () => {
      registry.register({ name: 'base_skill', execute: async () => ({ success: true }) });
      registry.registerDynamic({ name: 'dynamic_skill', execute: async () => ({ success: true }) });

      const names = registry.getNames();

      expect(names).toContain('base_skill');
      expect(names).toContain('dynamic_skill');
      expect(names.length).toBe(2);
    });

    it('should find skills by similarity', async () => {
      registry.register({
        name: 'walk',
        description: 'Walk to a location',
        execute: async () => ({ success: true })
      });
      registry.register({
        name: 'mine',
        description: 'Mine a block',
        execute: async () => ({ success: true })
      });

      const results = registry.findSimilar('walk');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].skill.name).toBe('walk');
      expect(results[0].confidence).toBe(0.9); // name match
    });
  });
});

// ============================================
// Skill Execution with Bot Interactions
// ============================================

describe('Skill Execution with Bot Interactions', () => {
  let registry;
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    registry = new SkillRegistry();
    executor = new SkillExecutor();
    resetTurnLimiter();

    const env = createTestEnvironment({
      bot: { position: { x: 100, y: 64, z: -200 } }
    });
    mockBot = env.bot;
    mockState = env.state;
  });

  afterEach(() => {
    resetSkillRegistry();
    resetSkillExecutor();
    resetTurnLimiter();
  });

  describe('navigation skills', () => {
    it('should execute walk skill through pathfinder', async () => {
      const walkSkill = {
        name: 'walk',
        description: 'Walk to coordinates',
        execute: async (bot, state, params) => {
          const { target } = params;
          if (!target) {
            return { success: false, error: 'Target required' };
          }

          await bot.pathfinder.goto({ x: target.x, y: target.y, z: target.z });
          return { success: true, position: state.getPosition() };
        }
      };

      registry.register(walkSkill);

      const result = await executor.execute(
        registry.get('walk'),
        mockBot,
        mockState,
        { target: { x: 200, y: 64, z: 100 } }
      );

      expect(result.success).toBe(true);
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });

    it('should stop navigation on error', async () => {
      mockBot.pathfinder.goto.mockRejectedValueOnce(new Error('Path not found'));

      const walkSkill = {
        name: 'walk',
        description: 'Walk to coordinates',
        execute: async (bot, state, params) => {
          try {
            await bot.pathfinder.goto(params.target);
            return { success: true };
          } catch (error) {
            bot.pathfinder.stop();
            return { success: false, error: error.message };
          }
        }
      };

      registry.register(walkSkill);

      const result = await executor.execute(
        registry.get('walk'),
        mockBot,
        mockState,
        { target: { x: 200, y: 64, z: 100 } }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path not found');
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });
  });

  describe('inventory skills', () => {
    it('should execute inventory skill', async () => {
      const inventorySkill = {
        name: 'inventory',
        description: 'List inventory',
        execute: async (bot, state, params) => {
          const items = bot.inventory.items();
          return { success: true, items };
        }
      };

      registry.register(inventorySkill);

      const result = await executor.execute(
        registry.get('inventory'),
        mockBot,
        mockState
      );

      expect(result.success).toBe(true);
      expect(result.items).toBeDefined();
    });

    it('should execute equip skill', async () => {
      const equipSkill = {
        name: 'equip',
        description: 'Equip an item',
        execute: async (bot, state, params) => {
          const { item, destination } = params;
          await bot.equip(item, destination);
          return { success: true };
        }
      };

      registry.register(equipSkill);

      const result = await executor.execute(
        registry.get('equip'),
        mockBot,
        mockState,
        { item: 'diamond_pickaxe', destination: 'hand' }
      );

      expect(result.success).toBe(true);
      expect(mockBot.equip).toHaveBeenCalled();
    });
  });

  describe('chat skills', () => {
    it('should execute say skill', async () => {
      const saySkill = {
        name: 'say',
        description: 'Send chat message',
        execute: async (bot, state, params) => {
          const { message } = params;
          if (!message) {
            return { success: false, error: 'Message required' };
          }
          bot.chat(message);
          return { success: true };
        }
      };

      registry.register(saySkill);

      const result = await executor.execute(
        registry.get('say'),
        mockBot,
        mockState,
        { message: 'Hello World!' }
      );

      expect(result.success).toBe(true);
      expect(mockBot.chat).toHaveBeenCalledWith('Hello World!');
    });
  });

  describe('action skills', () => {
    it('should execute mine skill', async () => {
      const mineSkill = {
        name: 'mine',
        description: 'Mine a block',
        execute: async (bot, state, params) => {
          const { target } = params;
          const block = bot.blockAt(target);
          await bot.dig(block);
          return { success: true };
        }
      };

      registry.register(mineSkill);

      const result = await executor.execute(
        registry.get('mine'),
        mockBot,
        mockState,
        { target: { x: 10, y: 64, z: 10 } }
      );

      expect(result.success).toBe(true);
      expect(mockBot.blockAt).toHaveBeenCalled();
      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should execute craft skill', async () => {
      const craftSkill = {
        name: 'craft',
        description: 'Craft an item',
        execute: async (bot, state, params) => {
          const { recipe, count } = params;
          await bot.craft(recipe, count);
          return { success: true };
        }
      };

      registry.register(craftSkill);

      const result = await executor.execute(
        registry.get('craft'),
        mockBot,
        mockState,
        { recipe: { id: 1 }, count: 4 }
      );

      expect(result.success).toBe(true);
      expect(mockBot.craft).toHaveBeenCalled();
    });
  });
});

// ============================================
// Dynamic Skills Tests
// ============================================

describe('Dynamic Skills', () => {
  let registry;
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    registry = new SkillRegistry();
    executor = new SkillExecutor();

    const env = createTestEnvironment({
      bot: { position: { x: 100, y: 64, z: -200 } }
    });
    mockBot = env.bot;
    mockState = env.state;
  });

  afterEach(() => {
    resetSkillRegistry();
    resetSkillExecutor();
  });

  describe('should handle dynamic skills', () => {
    it('should register dynamic skill', () => {
      const skill = {
        name: 'dynamic_test',
        description: 'A dynamic skill',
        execute: async () => ({ success: true })
      };

      registry.registerDynamic(skill);

      expect(registry.has('dynamic_test')).toBe(true);
      const registered = registry.get('dynamic_test');
      expect(registered.type).toBe('dynamic');
    });

    it('should execute dynamic skill', async () => {
      const skill = {
        name: 'dynamic_test',
        description: 'A dynamic skill',
        execute: jest.fn().mockResolvedValue({ success: true, dynamic: true })
      };

      registry.registerDynamic(skill);

      const result = await executor.execute(
        registry.get('dynamic_test'),
        mockBot,
        mockState
      );

      expect(result.success).toBe(true);
      expect(result.dynamic).toBe(true);
    });

    it('should prefer base skill over dynamic with same name', () => {
      const baseSkill = {
        name: 'conflict',
        execute: async () => ({ source: 'base' })
      };
      const dynamicSkill = {
        name: 'conflict',
        execute: async () => ({ source: 'dynamic' })
      };

      registry.register(baseSkill);
      registry.registerDynamic(dynamicSkill);

      const retrieved = registry.get('conflict');
      expect(retrieved.type).toBe('base');
    });

    it('should unregister dynamic skill', () => {
      const skill = {
        name: 'temp_dynamic',
        execute: async () => ({ success: true })
      };

      registry.registerDynamic(skill);
      expect(registry.has('temp_dynamic')).toBe(true);

      const result = registry.unregisterDynamic('temp_dynamic');

      expect(result).toBe(true);
      expect(registry.has('temp_dynamic')).toBe(false);
    });

    it('should not unregister base skill', () => {
      const skill = {
        name: 'base_skill',
        execute: async () => ({ success: true })
      };

      registry.register(skill);
      const result = registry.unregisterDynamic('base_skill');

      expect(result).toBe(false);
      expect(registry.has('base_skill')).toBe(true);
    });
  });

  describe('should execute dynamic skill code', () => {
    it('should execute validated dynamic code', async () => {
      const code = `
        const pos = bot.position;
        return { success: true, x: pos.x };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(true);
      expect(result.result.x).toBe(100);
    });

    it('should reject unsafe dynamic code', async () => {
      const code = 'require("fs")';

      const result = await executor.executeDynamic(code, mockBot, mockState);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Safety validation failed');
    });

    it('should provide params to dynamic code', async () => {
      const code = `
        const value = params.multiplier;
        return { success: true, result: value * 2 };
      `;

      const result = await executor.executeDynamic(code, mockBot, mockState, { multiplier: 5 });

      expect(result.success).toBe(true);
      expect(result.result.result).toBe(10);
    });
  });
});

// ============================================
// Multiple Skill Execution Tests
// ============================================

describe('Multiple Skill Execution', () => {
  let registry;
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    registry = new SkillRegistry();
    executor = new SkillExecutor();

    const env = createTestEnvironment({
      bot: { position: { x: 100, y: 64, z: -200 } }
    });
    mockBot = env.bot;
    mockState = env.state;
  });

  afterEach(() => {
    resetSkillRegistry();
    resetSkillExecutor();
  });

  it('should execute multiple skills in sequence', async () => {
    const skills = [
      { name: 'skill1', execute: jest.fn().mockResolvedValue({ success: true, value: 1 }) },
      { name: 'skill2', execute: jest.fn().mockResolvedValue({ success: true, value: 2 }) },
      { name: 'skill3', execute: jest.fn().mockResolvedValue({ success: true, value: 3 }) }
    ];

    skills.forEach(s => registry.register(s));

    const results = [];
    for (const skill of skills) {
      const result = await executor.execute(registry.get(skill.name), mockBot, mockState);
      results.push(result);
    }

    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    expect(results.map(r => r.value)).toEqual([1, 2, 3]);
  });

  it('should track execution ids', async () => {
    const skill = {
      name: 'test',
      execute: jest.fn().mockResolvedValue({ success: true })
    };

    registry.register(skill);

    const results = [];
    for (let i = 0; i < 3; i++) {
      const result = await executor.execute(registry.get('test'), mockBot, mockState);
      results.push(result);
    }

    const ids = results.map(r => r.executionId);
    const uniqueIds = [...new Set(ids)];

    expect(uniqueIds.length).toBe(3);
  });

  it('should execute skills concurrently', async () => {
    const skill = {
      name: 'concurrent_test',
      execute: jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true };
      })
    };

    registry.register(skill);

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(executor.execute(registry.get('concurrent_test'), mockBot, mockState));
    }

    const results = await Promise.all(promises);

    expect(results.every(r => r.success)).toBe(true);
  });
});

// ============================================
// Cleanup
// ============================================

afterEach(async () => {
  // Clean up any test files
  const fs = await import('fs/promises');
  try {
    await fs.rm('./tests/tmp', { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
});