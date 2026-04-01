import { jest } from '@jest/globals';
import { GoalBlock, GoalNear } from 'mineflayer-pathfinder';
import { walkSkill } from '../../../../src/skills/base/walk.js';

// Mock logger
jest.mock('../../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

describe('WalkSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      }
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 10, y: 64, z: 20 })
    };

    execute = walkSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should navigate to coordinates using GoalBlock by default', async () => {
      const result = await execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 }
      });

      expect(result.success).toBe(true);
      expect(result.position).toEqual({ x: 10, y: 64, z: 20 });
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();

      // Verify GoalBlock was constructed with correct values
      expect(GoalBlock).toHaveBeenCalledWith(100, 64, 200);
    });

    it('should use GoalNear when range > 0', async () => {
      const result = await execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 },
        range: 5
      });

      expect(result.success).toBe(true);
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();

      // Verify GoalNear was used
      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 5);
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {
        target: { x: 100, y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, {
        target: { x: 100, y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when target is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when target has non-numeric coordinates', async () => {
      const result = await execute(mockBot, mockState, {
        target: { x: 'invalid', y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('numeric');
    });

    it('should return error when coordinates are not finite', async () => {
      const result = await execute(mockBot, mockState, {
        target: { x: Infinity, y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('finite');
    });

    it('should return error when target is null', async () => {
      const result = await execute(mockBot, mockState, {
        target: null
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should floor coordinates to integers', async () => {
      await execute(mockBot, mockState, {
        target: { x: 100.7, y: 64.3, z: 200.9 }
      });

      // The GoalBlock mock should have been called with floored values
      expect(GoalBlock).toHaveBeenCalledWith(100, 64, 200);
    });

    it('should handle negative coordinates', async () => {
      const result = await execute(mockBot, mockState, {
        target: { x: -100, y: -64, z: -200 }
      });

      expect(result.success).toBe(true);
      expect(GoalBlock).toHaveBeenCalledWith(-100, -64, -200);
    });

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      // Mock goto that never resolves
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 },
        timeout: 1000
      });

      // Advance timers to trigger timeout
      await jest.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle navigation error', async () => {
      mockBot.pathfinder.goto.mockRejectedValue(new Error('Path not found'));

      const result = await execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path not found');
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });

    it('should use custom timeout', async () => {
      jest.useFakeTimers();

      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 },
        timeout: 5000
      });

      // Timeout shouldn't trigger yet at 1000ms
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockBot.pathfinder.stop).not.toHaveBeenCalled();

      // Trigger timeout
      await jest.advanceTimersByTimeAsync(4500);

      const result = await resultPromise;
      expect(result.success).toBe(false);

      jest.useRealTimers();
    });

    it('should include position in error response', async () => {
      mockBot.pathfinder.goto.mockRejectedValue(new Error('Failed'));

      const result = await execute(mockBot, mockState, {
        target: { x: 100, y: 64, z: 200 }
      });

      expect(result.success).toBe(false);
      expect(result.position).toEqual({ x: 10, y: 64, z: 20 });
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(walkSkill.name).toBe('walk');
    });

    it('should have description', () => {
      expect(walkSkill.description).toBeDefined();
      expect(walkSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof walkSkill.execute).toBe('function');
    });

    it('should have parameters defined', () => {
      expect(walkSkill.parameters).toBeDefined();
      expect(walkSkill.parameters.target).toBeDefined();
      expect(walkSkill.parameters.target.required).toBe(true);
    });

    it('should have returns defined', () => {
      expect(walkSkill.returns).toBeDefined();
      expect(walkSkill.returns.success).toBeDefined();
      expect(walkSkill.returns.position).toBeDefined();
    });

    it('should have default values for optional parameters', () => {
      expect(walkSkill.parameters.timeout.default).toBe(30000);
      expect(walkSkill.parameters.range.default).toBe(0);
    });
  });
});