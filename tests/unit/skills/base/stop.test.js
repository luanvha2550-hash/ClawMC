import { jest } from '@jest/globals';
import { stopSkill } from '../../../../src/skills/base/stop.js';

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

describe('StopSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder
    mockBot = {
      pathfinder: {
        stop: jest.fn(),
        setGoal: jest.fn()
      }
    };

    // Create mock state
    mockState = {
      following: null,
      followInterval: null,
      currentTask: null,
      setFollowing: jest.fn(),
      clearFollowing: jest.fn(),
      clearTask: jest.fn()
    };

    execute = stopSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    it('should stop pathfinder and return success', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
      expect(mockBot.pathfinder.setGoal).toHaveBeenCalledWith(null);
    });

    it('should clear following state when following', async () => {
      mockState.following = 'TestPlayer';

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.wasFollowing).toBe('TestPlayer');
      expect(mockState.clearFollowing).toHaveBeenCalled();
    });

    it('should clear follow interval when exists', async () => {
      const intervalId = setInterval(() => {}, 10000);
      mockState.followInterval = intervalId;

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(mockState.followInterval).toBeNull();
    });

    it('should clear current task when exists', async () => {
      mockState.currentTask = { type: 'mining' };

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.clearedTask).toBe(true);
      expect(mockState.clearTask).toHaveBeenCalled();
    });

    it('should handle bot without pathfinder', async () => {
      const result = await execute({ pathfinder: null }, mockState, {});

      expect(result.success).toBe(true);
    });

    it('should handle bot without pathfinder.stop', async () => {
      mockBot.pathfinder.stop = null;

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
    });

    it('should handle bot without pathfinder.setGoal', async () => {
      mockBot.pathfinder.setGoal = null;

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return wasFollowing as null when not following', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.wasFollowing).toBeNull();
    });

    it('should return clearedTask as false when no task', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.clearedTask).toBe(false);
    });

    it('should handle all state clearing together', async () => {
      mockState.following = 'TestPlayer';
      mockState.followInterval = setInterval(() => {}, 10000);
      mockState.currentTask = { type: 'mining' };

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.wasFollowing).toBe('TestPlayer');
      expect(result.clearedTask).toBe(true);
      expect(mockState.clearFollowing).toHaveBeenCalled();
      expect(mockState.clearTask).toHaveBeenCalled();
    });

    it('should handle errors from pathfinder.stop gracefully', async () => {
      mockBot.pathfinder.stop.mockImplementation(() => {
        throw new Error('Stop error');
      });

      // Should not throw, should handle gracefully
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
    });

    it('should handle errors from pathfinder.setGoal gracefully', async () => {
      mockBot.pathfinder.setGoal.mockImplementation(() => {
        throw new Error('SetGoal error');
      });

      // Should not throw, should handle gracefully
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
    });

    it('should work with no parameters', async () => {
      const result = await execute(mockBot, mockState);

      expect(result.success).toBe(true);
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(stopSkill.name).toBe('stop');
    });

    it('should have description', () => {
      expect(stopSkill.description).toBeDefined();
      expect(stopSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof stopSkill.execute).toBe('function');
    });

    it('should have empty parameters', () => {
      expect(stopSkill.parameters).toEqual({});
    });

    it('should have returns defined', () => {
      expect(stopSkill.returns).toBeDefined();
      expect(stopSkill.returns.success).toBeDefined();
      expect(stopSkill.returns.wasFollowing).toBeDefined();
      expect(stopSkill.returns.clearedTask).toBeDefined();
    });
  });
});