import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { collectSkill } from '../../../../src/skills/base/collect.js';

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

describe('CollectSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with entities
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      entities: {},
      entity: {
        position: { x: 0, y: 64, z: 0 }
      }
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 })
    };

    execute = collectSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
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

    it('should collect dropped items successfully', async () => {
      // Add a dropped item entity
      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(10, 64, 10),
        metadata: [{ blockId: 3, name: 'dirt' }]
      };

      const result = await execute(mockBot, mockState, {
        range: 20
      });

      expect(result.success).toBe(true);
      expect(result.collected).toBe(1);
      expect(GoalNear).toHaveBeenCalled();
    });

    it('should filter items by name when specified', async () => {
      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(5, 64, 5),
        metadata: [{ blockId: 3, name: 'dirt' }]
      };
      mockBot.entities['item2'] = {
        id: 'item2',
        name: 'item',
        position: createPosition(6, 64, 6),
        metadata: [{ blockId: 1, name: 'stone' }]
      };

      const result = await execute(mockBot, mockState, {
        item: 'dirt',
        range: 20
      });

      expect(result.collected).toBe(1);
      expect(result.items[0].name).toBe('dirt');
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.collected).toBe(0);
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
      expect(result.error).toContain('position');
    });

    it('should return error with invalid range', async () => {
      const result = await execute(mockBot, mockState, {
        range: -1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive');
    });

    it('should return error when no items found', async () => {
      const result = await execute(mockBot, mockState, {
        range: 10
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No');
    });

    it('should return error when specific item not found', async () => {
      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(5, 64, 5),
        metadata: [{ blockId: 3, name: 'dirt' }]
      };

      const result = await execute(mockBot, mockState, {
        item: 'stone',
        range: 10
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('stone');
    });

    it('should sort items by distance', async () => {
      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(20, 64, 20),
        metadata: [{ blockId: 3, name: 'dirt' }]
      };
      mockBot.entities['item2'] = {
        id: 'item2',
        name: 'item',
        position: createPosition(5, 64, 5),
        metadata: [{ blockId: 3, name: 'dirt' }]
      };

      await execute(mockBot, mockState, { range: 50 });

      // GoalNear should be called with closer item first
      const firstCall = GoalNear.mock.calls[0];
      expect(firstCall[0]).toBe(5);
      expect(firstCall[1]).toBe(64);
      expect(firstCall[2]).toBe(5);
    });

    it('should respect maxItems parameter', async () => {
      // Add multiple items
      for (let i = 0; i < 10; i++) {
        mockBot.entities[`item${i}`] = {
          id: `item${i}`,
          name: 'item',
          position: createPosition(i, 64, i),
          metadata: [{ blockId: 3, name: 'dirt' }]
        };
      }

      const result = await execute(mockBot, mockState, {
        maxItems: 3,
        range: 50
      });

      expect(result.collected).toBe(3);
    });

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(10, 64, 10)
      };
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        timeout: 1000,
        range: 20
      });

      await jest.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.collected).toBe(0);

      jest.useRealTimers();
    });

    it('should continue on navigation error', async () => {
      mockBot.pathfinder.goto.mockRejectedValueOnce(new Error('Navigation failed'));

      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(10, 64, 10)
      };

      const result = await execute(mockBot, mockState, { range: 20 });

      // Should return 0 collected since navigation failed
      expect(result.collected).toBe(0);
      expect(result.success).toBe(false);
    });

    it('should use default range when not specified', async () => {
      // Position within default range (16) - use position (10, 64, 10) which is ~14.1 blocks away
      mockBot.entities['item1'] = {
        id: 'item1',
        name: 'item',
        position: createPosition(10, 64, 10)
      };

      const result = await execute(mockBot, mockState, {});

      expect(result.collected).toBe(1);
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(collectSkill.name).toBe('collect');
    });

    it('should have description', () => {
      expect(collectSkill.description).toBeDefined();
      expect(collectSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof collectSkill.execute).toBe('function');
    });

    it('should have parameters defined', () => {
      expect(collectSkill.parameters).toBeDefined();
      expect(collectSkill.parameters.item.required).toBe(false);
      expect(collectSkill.parameters.range.default).toBe(16);
      expect(collectSkill.parameters.timeout.default).toBe(10000);
      expect(collectSkill.parameters.maxItems.default).toBe(64);
    });

    it('should have returns defined', () => {
      expect(collectSkill.returns).toBeDefined();
      expect(collectSkill.returns.success).toBeDefined();
      expect(collectSkill.returns.collected).toBeDefined();
      expect(collectSkill.returns.items).toBeDefined();
    });
  });
});