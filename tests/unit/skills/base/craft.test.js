import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { craftSkill } from '../../../../src/skills/base/craft.js';

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

describe('CraftSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with crafting capabilities
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      recipesFor: jest.fn().mockReturnValue([]),
      craft: jest.fn().mockResolvedValue(1),
      inventory: {
        items: jest.fn().mockReturnValue([])
      },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn().mockReturnValue(null),
      equip: jest.fn().mockResolvedValue(undefined)
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 })
    };

    execute = craftSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should craft item successfully without crafting table', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'stick_recipe',
        delta: { stick: 4, planks: -2 },
        size: 2
      }]);
      mockBot.inventory.items.mockReturnValue([
        { name: 'planks', count: 10 }
      ]);
      mockBot.craft.mockResolvedValue(4);

      const result = await execute(mockBot, mockState, {
        item: 'stick',
        count: 4
      });

      expect(result.success).toBe(true);
      expect(result.item).toBe('stick');
      expect(result.count).toBe(4);
      expect(mockBot.craft).toHaveBeenCalled();
    });

    it('should find and use crafting table when required', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'workbench_recipe',
        requiresCraftingTable: true,
        size: 3,
        delta: { workbench: 1, planks: -4 }
      }]);
      mockBot.inventory.items.mockReturnValue([
        { name: 'planks', count: 10 }
      ]);
      mockBot.findBlocks.mockReturnValue([{ x: 10, y: 64, z: 10 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'crafting_table',
        position: { x: 10, y: 64, z: 10 }
      });

      const result = await execute(mockBot, mockState, {
        item: 'workbench',
        count: 1
      });

      expect(result.success).toBe(true);
      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
      expect(GoalNear).toHaveBeenCalled();
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {
        item: 'stick'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when item name is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when item name is empty', async () => {
      const result = await execute(mockBot, mockState, {
        item: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when count is invalid', async () => {
      const result = await execute(mockBot, mockState, {
        item: 'stick',
        count: 0
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when recipe not found', async () => {
      mockBot.recipesFor.mockReturnValue([]);

      const result = await execute(mockBot, mockState, {
        item: 'nonexistent_item'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipe');
    });

    it('should return error when crafting table required but not found', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'complex_recipe',
        requiresCraftingTable: true,
        size: 3
      }]);
      mockBot.findBlocks.mockReturnValue([]);

      const result = await execute(mockBot, mockState, {
        item: 'diamond_pickaxe'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('crafting table');
    });

    it('should return error when not enough materials', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'stick_recipe',
        delta: { stick: 4, planks: -2 },
        size: 2
      }]);
      mockBot.inventory.items.mockReturnValue([
        { name: 'planks', count: 1 } // Not enough
      ]);

      const result = await execute(mockBot, mockState, {
        item: 'stick',
        count: 4
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough');
    });

    it('should handle navigation timeout for crafting table', async () => {
      jest.useFakeTimers();

      mockBot.recipesFor.mockReturnValue([{
        id: 'complex_recipe',
        requiresCraftingTable: true,
        size: 3
      }]);
      mockBot.findBlocks.mockReturnValue([{ x: 10, y: 64, z: 10 }]);
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        item: 'diamond_pickaxe',
        timeout: 1000
      });

      await jest.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');

      jest.useRealTimers();
    });

    it('should handle craft error', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'stick_recipe',
        delta: { stick: 4, planks: -2 },
        size: 2
      }]);
      mockBot.inventory.items.mockReturnValue([
        { name: 'planks', count: 10 }
      ]);
      mockBot.craft.mockRejectedValue(new Error('Crafting failed'));

      const result = await execute(mockBot, mockState, {
        item: 'stick'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Crafting failed');
    });

    it('should use default timeout', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'stick_recipe',
        size: 2
      }]);

      await execute(mockBot, mockState, {
        item: 'stick'
      });

      // Should use default timeout of 30000
      expect(craftSkill.parameters.timeout.default).toBe(30000);
    });

    it('should use default count of 1', async () => {
      mockBot.recipesFor.mockReturnValue([{
        id: 'stick_recipe',
        delta: {},
        size: 2
      }]);

      const result = await execute(mockBot, mockState, {
        item: 'stick'
      });

      expect(result.count).toBe(1);
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(craftSkill.name).toBe('craft');
    });

    it('should have description', () => {
      expect(craftSkill.description).toBeDefined();
      expect(craftSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof craftSkill.execute).toBe('function');
    });

    it('should have required parameters defined', () => {
      expect(craftSkill.parameters).toBeDefined();
      expect(craftSkill.parameters.item.required).toBe(true);
      expect(craftSkill.parameters.count.default).toBe(1);
      expect(craftSkill.parameters.timeout.default).toBe(30000);
    });

    it('should have returns defined', () => {
      expect(craftSkill.returns).toBeDefined();
      expect(craftSkill.returns.success).toBeDefined();
      expect(craftSkill.returns.item).toBeDefined();
      expect(craftSkill.returns.count).toBeDefined();
    });
  });
});