import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { comeSkill } from '../../../../src/skills/base/come.js';

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

describe('ComeSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder and players
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      players: {
        'TestPlayer': {
          entity: {
            position: { x: 100, y: 64, z: 200 }
          }
        }
      }
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 10, y: 64, z: 20 }),
      lastCaller: 'DefaultPlayer'
    };

    execute = comeSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should navigate to player by username', async () => {
      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer',
        range: 3
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('TestPlayer');
      expect(result.position).toEqual({ x: 10, y: 64, z: 20 });
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 3);
    });

    it('should use lastCaller when username not provided', async () => {
      mockBot.players.DefaultPlayer = {
        entity: {
          position: { x: 50, y: 64, z: 50 }
        }
      };

      const result = await execute(mockBot, mockState, {
        range: 5
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('DefaultPlayer');
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when player not found', async () => {
      const result = await execute(mockBot, mockState, {
        username: 'UnknownPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.target).toBe('UnknownPlayer');
    });

    it('should return error when player has no entity', async () => {
      mockBot.players.TestPlayer = { entity: null };

      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not visible');
    });

    it('should return error when no username and no lastCaller', async () => {
      mockState.lastCaller = null;

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No target player');
    });

    it('should use default range of 3', async () => {
      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(true);
      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 3);
    });

    it('should use custom range', async () => {
      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer',
        range: 10
      });

      expect(result.success).toBe(true);
      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 10);
    });

    it('should use custom timeout', async () => {
      jest.useFakeTimers();

      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        username: 'TestPlayer',
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

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        username: 'TestPlayer',
        timeout: 1000
      });

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
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Path not found');
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });

    it('should handle player with null position', async () => {
      mockBot.players.TestPlayer.entity.position = null;

      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('no position');
    });

    it('should floor coordinates to integers', async () => {
      mockBot.players.TestPlayer.entity.position = { x: 100.7, y: 64.3, z: 200.9 };

      await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 3);
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(comeSkill.name).toBe('come');
    });

    it('should have description', () => {
      expect(comeSkill.description).toBeDefined();
      expect(comeSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof comeSkill.execute).toBe('function');
    });

    it('should have parameters defined', () => {
      expect(comeSkill.parameters).toBeDefined();
      expect(comeSkill.parameters.username).toBeDefined();
      expect(comeSkill.parameters.username.required).toBe(false);
      expect(comeSkill.parameters.range).toBeDefined();
    });

    it('should have returns defined', () => {
      expect(comeSkill.returns).toBeDefined();
      expect(comeSkill.returns.success).toBeDefined();
      expect(comeSkill.returns.target).toBeDefined();
    });

    it('should have default values', () => {
      expect(comeSkill.parameters.range.default).toBe(3);
      expect(comeSkill.parameters.timeout.default).toBe(30000);
    });
  });
});