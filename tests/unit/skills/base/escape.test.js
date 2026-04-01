import { jest } from '@jest/globals';
import { GoalBlock } from 'mineflayer-pathfinder';
import { escapeSkill } from '../../../../src/skills/base/escape.js';

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

// Mock navigation utils
jest.mock('../../../../src/skills/utils/navigation.js', () => ({
  withTimeout: jest.fn((promise) => promise),
  distanceBetween: jest.fn((pos1, pos2) => {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  })
}));

describe('EscapeSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder and entities
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      entity: {
        position: { x: 0, y: 64, z: 0 }
      },
      entities: {}
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 })
    };

    execute = escapeSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.fled).toBe(false);
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when bot position is not available', async () => {
      mockBot.entity = null;

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('position not available');
    });

    it('should return error when range is invalid', async () => {
      const result = await execute(mockBot, mockState, { range: -1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive number');
    });

    it('should return success when no hostiles nearby', async () => {
      mockBot.entities = {};

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.fled).toBe(false);
      expect(result.hostiles).toEqual([]);
      expect(result.message).toContain('No hostile entities');
    });

    it('should escape from single hostile', async () => {
      // Create hostile entity
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, { escapeDistance: 16 });

      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
      expect(result.hostiles).toHaveLength(1);
      expect(result.hostiles[0].name).toBe('zombie');
      expect(GoalBlock).toHaveBeenCalled();
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });

    it('should escape from multiple hostiles', async () => {
      // Create multiple hostile entities
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        },
        2: {
          name: 'skeleton',
          position: { x: 0, y: 64, z: 10, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, { escapeDistance: 16 });

      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
      expect(result.hostiles).toHaveLength(2);
    });

    it('should only flee from hostile mob types', async () => {
      // Mix of hostile and non-hostile entities
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        },
        2: {
          name: 'cow',
          position: { x: 5, y: 64, z: 0, distanceTo: () => 5 }
        },
        3: {
          name: 'pig',
          position: { x: -5, y: 64, z: 0, distanceTo: () => 5 }
        }
      };

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
      expect(result.hostiles).toHaveLength(1);
      expect(result.hostiles[0].name).toBe('zombie');
    });

    it('should ignore hostiles outside range', async () => {
      // Hostile outside default range (24 blocks)
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 50, y: 64, z: 0, distanceTo: () => 50 }
        }
      };

      const result = await execute(mockBot, mockState, { range: 24 });

      expect(result.success).toBe(true);
      expect(result.fled).toBe(false);
      expect(result.message).toContain('No hostile entities');
    });

    it('should use custom range parameter', async () => {
      // Hostile at 10 blocks - outside range 5
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, { range: 5 });

      expect(result.success).toBe(true);
      expect(result.fled).toBe(false);
    });

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, { timeout: 1000 });

      await jest.advanceTimersByTimeAsync(1500);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.fled).toBe(false);

      jest.useRealTimers();
    });

    it('should handle navigation error', async () => {
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };
      mockBot.pathfinder.goto.mockRejectedValue(new Error('Path not found'));

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.fled).toBe(false);
      expect(result.error).toContain('Failed to escape');
    });

    it('should stop pathfinder on unexpected error', async () => {
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };
      // Simulate an error that propagates to outer catch (not navigation error)
      const originalEntities = mockBot.entities;
      mockBot.entities = null; // This causes Object.values(null) to throw

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();

      // Restore for other tests
      mockBot.entities = originalEntities;
    });

    it('should detect various hostile mob types', async () => {
      const hostileMobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'phantom'];

      for (const mobName of hostileMobs) {
        mockBot.entities = {
          1: {
            name: mobName,
            position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
          }
        };

        const result = await execute(mockBot, mockState, {});

        expect(result.success).toBe(true);
        expect(result.fled).toBe(true);
        expect(result.hostiles).toHaveLength(1);
        expect(result.hostiles[0].name).toBe(mobName);
      }
    });

    it('should include reason in logging', async () => {
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, {
        reason: 'low_health'
      });

      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
    });

    it('should calculate escape direction opposite to hostile', async () => {
      // Hostile at positive X, should escape in negative X direction
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      await execute(mockBot, mockState, { escapeDistance: 16 });

      // GoalBlock should be called with negative X (escaping from positive X)
      expect(GoalBlock).toHaveBeenCalled();
      const call = GoalBlock.mock.calls[0];
      expect(call[0]).toBeLessThan(0); // Escape X should be negative
    });

    it('should return escape direction in result', async () => {
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.escapeDirection).toBeDefined();
      expect(typeof result.escapeDirection.x).toBe('number');
      expect(typeof result.escapeDirection.y).toBe('number');
      expect(typeof result.escapeDirection.z).toBe('number');
    });

    it('should handle hostile entities without position', async () => {
      mockBot.entities = {
        1: {
          name: 'zombie',
          position: null
        },
        2: {
          name: 'skeleton',
          position: { x: 10, y: 64, z: 0, distanceTo: () => 10 }
        }
      };

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
      expect(result.hostiles).toHaveLength(1);
      expect(result.hostiles[0].name).toBe('skeleton');
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(escapeSkill.name).toBe('escape');
    });

    it('should have description', () => {
      expect(escapeSkill.description).toBeDefined();
      expect(escapeSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof escapeSkill.execute).toBe('function');
    });

    it('should have optional parameters with defaults', () => {
      expect(escapeSkill.parameters).toBeDefined();
      expect(escapeSkill.parameters.reason.required).toBe(false);
      expect(escapeSkill.parameters.range.default).toBe(24);
      expect(escapeSkill.parameters.escapeDistance.default).toBe(16);
      expect(escapeSkill.parameters.timeout.default).toBe(15000);
    });

    it('should have returns defined', () => {
      expect(escapeSkill.returns).toBeDefined();
      expect(escapeSkill.returns.success).toBeDefined();
      expect(escapeSkill.returns.fled).toBeDefined();
      expect(escapeSkill.returns.hostiles).toBeDefined();
      expect(escapeSkill.returns.escapeDirection).toBeDefined();
    });
  });
});