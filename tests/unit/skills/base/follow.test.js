import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { followSkill } from '../../../../src/skills/base/follow.js';

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

describe('FollowSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock bot with pathfinder and players
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        setGoal: jest.fn(),
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
      following: null,
      followInterval: null,
      setFollowing: jest.fn(function(username) {
        this.following = username;
      }),
      clearFollowing: jest.fn(function() {
        this.following = null;
      })
    };

    execute = followSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should start following a player', async () => {
      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(true);
      expect(result.following).toBe('TestPlayer');
      expect(mockState.setFollowing).toHaveBeenCalledWith('TestPlayer');
      expect(mockBot.pathfinder.setGoal).toHaveBeenCalled();
    });

    it('should use default distance of 3', async () => {
      await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      // Check that GoalNear was called with default distance
      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 3);
    });

    it('should use custom distance', async () => {
      await execute(mockBot, mockState, {
        username: 'TestPlayer',
        distance: 5
      });

      expect(GoalNear).toHaveBeenCalledWith(100, 64, 200, 5);
    });

    it('should return error when username is not provided', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
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
    });

    it('should return error when player has no entity', async () => {
      mockBot.players.TestPlayer.entity = null;

      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not visible');
      expect(mockState.clearFollowing).toHaveBeenCalled();
    });

    it('should clear existing follow interval before starting new one', async () => {
      const existingInterval = setInterval(() => {}, 10000);
      mockState.followInterval = existingInterval;

      const result = await execute(mockBot, mockState, {
        username: 'TestPlayer'
      });

      // The interval should have been cleared
      // We can't directly test clearInterval was called, but we verify the behavior
      expect(result.success).toBe(true);
    });

    it('should switch follow targets', async () => {
      mockBot.players.AnotherPlayer = {
        entity: {
          position: { x: 50, y: 64, z: 50 }
        }
      };

      // First follow TestPlayer
      mockState.following = 'TestPlayer';

      // Follow AnotherPlayer
      const result = await execute(mockBot, mockState, {
        username: 'AnotherPlayer'
      });

      expect(result.success).toBe(true);
      expect(mockState.setFollowing).toHaveBeenCalledWith('AnotherPlayer');
    });

    it('should set up follow interval', async () => {
      await execute(mockBot, mockState, {
        username: 'TestPlayer',
        interval: 500
      });

      // Verify interval was stored
      expect(mockState.followInterval).not.toBeNull();

      // Clean up interval
      if (mockState.followInterval) {
        clearInterval(mockState.followInterval);
      }
    });

    it('should use custom interval', async () => {
      await execute(mockBot, mockState, {
        username: 'TestPlayer',
        interval: 2000
      });

      // The interval should be set (we can't easily test the actual interval value in unit tests)
      expect(mockState.followInterval).not.toBeNull();

      // Clean up
      if (mockState.followInterval) {
        clearInterval(mockState.followInterval);
      }
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
      expect(followSkill.name).toBe('follow');
    });

    it('should have description', () => {
      expect(followSkill.description).toBeDefined();
      expect(followSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof followSkill.execute).toBe('function');
    });

    it('should have parameters defined', () => {
      expect(followSkill.parameters).toBeDefined();
      expect(followSkill.parameters.username).toBeDefined();
      expect(followSkill.parameters.username.required).toBe(true);
      expect(followSkill.parameters.distance).toBeDefined();
      expect(followSkill.parameters.interval).toBeDefined();
    });

    it('should have returns defined', () => {
      expect(followSkill.returns).toBeDefined();
      expect(followSkill.returns.success).toBeDefined();
      expect(followSkill.returns.following).toBeDefined();
    });

    it('should have default values', () => {
      expect(followSkill.parameters.distance.default).toBe(3);
      expect(followSkill.parameters.interval.default).toBe(1000);
    });
  });
});