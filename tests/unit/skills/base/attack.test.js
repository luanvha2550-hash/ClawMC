import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { attackSkill } from '../../../../src/skills/base/attack.js';

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

describe('AttackSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  // Helper to create position with distanceTo method
  const createPosition = (x, y, z) => {
    const pos = { x, y, z };
    pos.distanceTo = (other) => {
      const dx = pos.x - other.x;
      const dy = pos.y - other.y;
      const dz = pos.z - other.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    return pos;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with entities and attack capability
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      entities: {},
      entity: {
        position: createPosition(0, 64, 0)
      },
      attack: jest.fn(),
      inventory: {
        items: jest.fn().mockReturnValue([])
      },
      equip: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 })
    };

    execute = attackSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should attack entity successfully', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(10, 64, 10)
      };

      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        count: 1
      });

      expect(result.success).toBe(true);
      expect(result.attacked).toBe(1);
      expect(result.target).toBe('zombie');
      expect(mockBot.attack).toHaveBeenCalled();
    });

    it('should attack multiple entities', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };
      mockBot.entities['zombie2'] = {
        id: 'zombie2',
        name: 'zombie',
        position: createPosition(10, 64, 10)
      };

      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        count: 2
      });

      expect(result.success).toBe(true);
      expect(result.attacked).toBe(2);
      expect(result.targets).toHaveLength(2);
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {
        target: 'zombie'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.attacked).toBe(0);
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, {
        target: 'zombie'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when target is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when target is empty', async () => {
      const result = await execute(mockBot, mockState, {
        target: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when count is invalid', async () => {
      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        count: -1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when bot position not available', async () => {
      mockBot.entity = null;

      const result = await execute(mockBot, mockState, {
        target: 'zombie'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('position');
    });

    it('should return error when no entities found', async () => {
      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        range: 10
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No');
    });

    it('should filter entities by range', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };
      mockBot.entities['zombie2'] = {
        id: 'zombie2',
        name: 'zombie',
        position: createPosition(100, 64, 100)
      };

      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        range: 10
      });

      expect(result.attacked).toBe(1);
    });

    it('should sort entities by distance', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(20, 64, 20)
      };
      mockBot.entities['zombie2'] = {
        id: 'zombie2',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };

      await execute(mockBot, mockState, {
        target: 'zombie',
        count: 2,
        range: 50
      });

      // GoalNear should be called with closer entity first
      const firstCall = GoalNear.mock.calls[0];
      expect(firstCall[0]).toBe(5);
    });

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(10, 64, 10)
      };
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        target: 'zombie',
        timeout: 1000
      });

      await jest.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.attacked).toBe(0);

      jest.useRealTimers();
    });

    it('should continue to next entity on navigation failure', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };
      mockBot.entities['zombie2'] = {
        id: 'zombie2',
        name: 'zombie',
        position: createPosition(10, 64, 10)
      };
      mockBot.pathfinder.goto
        .mockRejectedValueOnce(new Error('Navigation failed'))
        .mockResolvedValueOnce(undefined);

      const result = await execute(mockBot, mockState, {
        target: 'zombie',
        count: 2,
        range: 50
      });

      expect(result.attacked).toBe(1);
    });

    it('should equip best weapon if available', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };
      mockBot.inventory.items.mockReturnValue([
        { name: 'diamond_sword', count: 1 }
      ]);

      await execute(mockBot, mockState, {
        target: 'zombie'
      });

      expect(mockBot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'diamond_sword' }),
        'hand'
      );
    });

    it('should continue on navigation error', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(5, 64, 5)
      };
      mockBot.pathfinder.goto.mockRejectedValueOnce(new Error('Navigation failed'));

      const result = await execute(mockBot, mockState, {
        target: 'zombie'
      });

      // Should return 0 attacked since navigation failed
      expect(result.attacked).toBe(0);
      expect(result.success).toBe(false);
    });

    it('should use default range', async () => {
      mockBot.entities['zombie1'] = {
        id: 'zombie1',
        name: 'zombie',
        position: createPosition(30, 64, 30)
      };

      await execute(mockBot, mockState, {
        target: 'zombie'
      });

      // Default range is 32, entity at 30 should be found
      expect(attackSkill.parameters.range.default).toBe(32);
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(attackSkill.name).toBe('attack');
    });

    it('should have description', () => {
      expect(attackSkill.description).toBeDefined();
      expect(attackSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof attackSkill.execute).toBe('function');
    });

    it('should have required parameters defined', () => {
      expect(attackSkill.parameters).toBeDefined();
      expect(attackSkill.parameters.target.required).toBe(true);
      expect(attackSkill.parameters.count.default).toBe(1);
      expect(attackSkill.parameters.range.default).toBe(32);
      expect(attackSkill.parameters.timeout.default).toBe(10000);
    });

    it('should have returns defined', () => {
      expect(attackSkill.returns).toBeDefined();
      expect(attackSkill.returns.success).toBeDefined();
      expect(attackSkill.returns.attacked).toBeDefined();
      expect(attackSkill.returns.target).toBeDefined();
      expect(attackSkill.returns.targets).toBeDefined();
    });
  });
});