import { jest } from '@jest/globals';

/**
 * Stuck Detector Tests for ClawMC Robustness Layer
 */

describe('StuckDetector', () => {
  let StuckDetector;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.resetModules();

    // Mock the logger module
    jest.mock('../../../src/utils/logger.js', () => ({
      getLogger: () => ({
        module: () => ({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        })
      })
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with default options', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      expect(stuckDetector.checkInterval).toBe(5000);
      expect(stuckDetector.stuckThreshold).toBe(3);
      expect(stuckDetector.taskTimeout).toBe(1800000);
      expect(stuckDetector.minMovement).toBe(1);
    });

    it('should accept custom options', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const mockStateManager = { currentTask: null };

      const stuckDetector = new StuckDetector({
        bot: mockBot,
        stateManager: mockStateManager,
        checkInterval: 10000,
        stuckThreshold: 5,
        taskTimeout: 3600000,
        minMovement: 2
      });

      expect(stuckDetector.bot).toBe(mockBot);
      expect(stuckDetector.stateManager).toBe(mockStateManager);
      expect(stuckDetector.checkInterval).toBe(10000);
      expect(stuckDetector.stuckThreshold).toBe(5);
      expect(stuckDetector.taskTimeout).toBe(3600000);
      expect(stuckDetector.minMovement).toBe(2);
    });

    it('should have default whitelist', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();

      expect(stuckDetector.whitelist.has('crafting')).toBe(true);
      expect(stuckDetector.whitelist.has('storage')).toBe(true);
      expect(stuckDetector.whitelist.has('idle')).toBe(true);
      expect(stuckDetector.whitelist.has('furnace')).toBe(true);
    });
  });

  describe('start', () => {
    it('should start detection timer', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const stuckDetector = new StuckDetector({ bot: mockBot });
      stuckDetector.start();

      expect(stuckDetector.running).toBe(true);
      expect(stuckDetector.timer).not.toBeNull();

      stuckDetector.stop();
    });

    it('should not start twice', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.start();
      stuckDetector.start();

      expect(stuckDetector.running).toBe(true);

      stuckDetector.stop();
    });
  });

  describe('stop', () => {
    it('should stop detection timer', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.start();
      stuckDetector.stop();

      expect(stuckDetector.running).toBe(false);
      expect(stuckDetector.timer).toBeNull();
    });

    it('should reset stuck count', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.stuckCount = 5;
      stuckDetector.stop();

      expect(stuckDetector.stuckCount).toBe(0);
    });
  });

  describe('check', () => {
    it('should return running status when not running', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      const result = stuckDetector.check();

      expect(result.running).toBe(false);
    });

    it('should increment checks performed', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const stuckDetector = new StuckDetector({ bot: mockBot });
      stuckDetector.start();

      stuckDetector.check();
      stuckDetector.check();

      expect(stuckDetector.stats.checksPerformed).toBe(2);

      stuckDetector.stop();
    });

    it('should skip check for whitelisted tasks', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const mockStateManager = {
        currentTask: { type: 'crafting', started: Date.now() }
      };

      const stuckDetector = new StuckDetector({
        bot: mockBot,
        stateManager: mockStateManager
      });
      stuckDetector.start();

      const result = stuckDetector.check();

      expect(result.whitelisted).toBe(true);

      stuckDetector.stop();
    });

    it('should detect no movement and increment stuck count', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const stuckDetector = new StuckDetector({
        bot: mockBot,
        stuckThreshold: 5
      });
      stuckDetector.start();

      // Set last position to same as current
      stuckDetector.lastPosition = { x: 100, y: 64, z: -200 };

      stuckDetector.check();

      expect(stuckDetector.stuckCount).toBe(1);

      stuckDetector.stop();
    });

    it('should detect stuck when threshold reached', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = {
        entity: { position: { x: 100, y: 64, z: -200 } },
        emit: jest.fn()
      };

      const stuckDetector = new StuckDetector({
        bot: mockBot,
        stuckThreshold: 3
      });
      stuckDetector.start();

      stuckDetector.lastPosition = { x: 100, y: 64, z: -200 };
      stuckDetector.stuckCount = 2;

      const result = stuckDetector.check();

      expect(result.isStuck).toBe(true);
      expect(result.stuckReason).toBe('no_movement');
      expect(mockBot.emit).toHaveBeenCalledWith('stuck', expect.any(Object));

      stuckDetector.stop();
    });

    it('should detect task timeout', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = {
        entity: { position: { x: 100, y: 64, z: -200 } },
        emit: jest.fn()
      };

      const pastTime = Date.now() - 2000;
      const mockStateManager = {
        currentTask: { type: 'mining', started: pastTime }
      };

      const stuckDetector = new StuckDetector({
        bot: mockBot,
        stateManager: mockStateManager,
        taskTimeout: 1000
      });
      stuckDetector.start();

      stuckDetector.taskStartTime = pastTime;

      const result = stuckDetector.check();

      expect(result.isStuck).toBe(true);
      expect(result.stuckReason).toBe('task_timeout');

      stuckDetector.stop();
    });
  });

  describe('isStuck', () => {
    it('should return true when stuck count >= threshold', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector({ stuckThreshold: 3 });
      stuckDetector.stuckCount = 3;

      expect(stuckDetector.isStuck()).toBe(true);
    });

    it('should return false when stuck count < threshold', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector({ stuckThreshold: 3 });
      stuckDetector.stuckCount = 2;

      expect(stuckDetector.isStuck()).toBe(false);
    });
  });

  describe('whitelist', () => {
    it('should add task to whitelist', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.addToWhitelist('custom_task');

      expect(stuckDetector.whitelist.has('custom_task')).toBe(true);
    });

    it('should remove task from whitelist', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.addToWhitelist('test_task');
      stuckDetector.removeFromWhitelist('test_task');

      expect(stuckDetector.whitelist.has('test_task')).toBe(false);
    });
  });

  describe('_calculateDistance', () => {
    it('should calculate distance correctly', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();

      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 3, y: 4, z: 0 };

      const distance = stuckDetector._calculateDistance(pos1, pos2);

      expect(distance).toBe(5);
    });

    it('should return 0 for same positions', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      const pos = { x: 100, y: 64, z: -200 };

      expect(stuckDetector._calculateDistance(pos, pos)).toBe(0);
    });

    it('should handle null positions', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();

      expect(stuckDetector._calculateDistance(null, { x: 0, y: 0, z: 0 })).toBe(0);
      expect(stuckDetector._calculateDistance({ x: 0, y: 0, z: 0 }, null)).toBe(0);
    });
  });

  describe('resetTaskTimer', () => {
    it('should reset task timer and stuck count', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.stuckCount = 5;
      stuckDetector.taskStartTime = Date.now() - 10000;

      stuckDetector.resetTaskTimer();

      expect(stuckDetector.stuckCount).toBe(0);
    });
  });

  describe('export', () => {
    it('should export detector state', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const stuckDetector = new StuckDetector({
        bot: mockBot,
        checkInterval: 5000
      });
      stuckDetector.start();

      const state = stuckDetector.export();

      expect(state.running).toBe(true);
      expect(state.whitelist).toContain('crafting');
      expect(state.config.checkInterval).toBe(5000);

      stuckDetector.stop();
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.stats.checksPerformed = 10;
      stuckDetector.stats.stuckEvents = 2;

      const stats = stuckDetector.getStats();

      expect(stats.checksPerformed).toBe(10);
      expect(stats.stuckEvents).toBe(2);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      const module = await import('../../../src/robustness/stuckDetector.js');
      StuckDetector = module.StuckDetector;

      const stuckDetector = new StuckDetector();
      stuckDetector.stats.checksPerformed = 100;
      stuckDetector.stats.stuckEvents = 10;

      stuckDetector.resetStats();

      expect(stuckDetector.stats.checksPerformed).toBe(0);
      expect(stuckDetector.stats.stuckEvents).toBe(0);
    });
  });
});