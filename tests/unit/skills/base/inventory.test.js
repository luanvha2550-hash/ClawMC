import { jest } from '@jest/globals';
import { inventorySkill } from '../../../../src/skills/base/inventory.js';

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

describe('InventorySkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with inventory
    mockBot = {
      inventory: {
        items: jest.fn().mockReturnValue([])
      }
    };

    // Create mock state
    mockState = {};

    execute = inventorySkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.items).toEqual([]);
    });

    it('should return error when inventory is not available', async () => {
      const result = await execute({ inventory: null }, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return empty array when inventory is empty', async () => {
      mockBot.inventory.items.mockReturnValue([]);

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.filter).toBeNull();
    });

    it('should list all inventory items', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32 },
        { name: 'dirt', count: 64 },
        { name: 'iron_ingot', count: 16 }
      ]);

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(3);
      expect(result.items[0]).toEqual({ name: 'cobblestone', count: 32 });
      expect(result.items[1]).toEqual({ name: 'dirt', count: 64 });
      expect(result.items[2]).toEqual({ name: 'iron_ingot', count: 16 });
    });

    it('should group items with same name', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32 },
        { name: 'dirt', count: 64 },
        { name: 'cobblestone', count: 16 } // Second stack of same item
      ]);

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);

      // Find cobblestone in results
      const cobblestone = result.items.find(item => item.name === 'cobblestone');
      expect(cobblestone.count).toBe(48); // 32 + 16
    });

    it('should filter items by name', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32 },
        { name: 'dirt', count: 64 },
        { name: 'iron_ingot', count: 16 },
        { name: 'stone', count: 8 }
      ]);

      const result = await execute(mockBot, mockState, { filter: 'stone' });

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2); // cobblestone and stone

      // Check that filtered items contain 'stone' in name
      for (const item of result.items) {
        expect(item.name).toContain('stone');
      }
    });

    it('should be case-insensitive for filter', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'Iron_Ingot', count: 16 },
        { name: 'IRON_ORE', count: 8 }
      ]);

      const result = await execute(mockBot, mockState, { filter: 'IRON' });

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(2);
    });

    it('should return empty array when filter matches nothing', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32 },
        { name: 'dirt', count: 64 }
      ]);

      const result = await execute(mockBot, mockState, { filter: 'diamond' });

      expect(result.success).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.filter).toBe('diamond');
    });

    it('should return error when filter is not a string', async () => {
      const result = await execute(mockBot, mockState, { filter: 123 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('should sort items alphabetically by name', async () => {
      mockBot.inventory.items.mockReturnValue([
        { name: 'dirt', count: 64 },
        { name: 'cobblestone', count: 32 },
        { name: 'apple', count: 5 }
      ]);

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(true);
      expect(result.items[0].name).toBe('apple');
      expect(result.items[1].name).toBe('cobblestone');
      expect(result.items[2].name).toBe('dirt');
    });

    it('should handle inventory error gracefully', async () => {
      mockBot.inventory.items.mockImplementation(() => {
        throw new Error('Inventory error');
      });

      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Inventory error');
      expect(result.items).toEqual([]);
    });

    it('should return filter as null when not provided', async () => {
      mockBot.inventory.items.mockReturnValue([]);

      const result = await execute(mockBot, mockState, {});

      expect(result.filter).toBeNull();
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(inventorySkill.name).toBe('inventory');
    });

    it('should have description', () => {
      expect(inventorySkill.description).toBeDefined();
      expect(inventorySkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof inventorySkill.execute).toBe('function');
    });

    it('should have filter parameter as optional', () => {
      expect(inventorySkill.parameters).toBeDefined();
      expect(inventorySkill.parameters.filter).toBeDefined();
      expect(inventorySkill.parameters.filter.required).toBe(false);
    });

    it('should have returns defined', () => {
      expect(inventorySkill.returns).toBeDefined();
      expect(inventorySkill.returns.success).toBeDefined();
      expect(inventorySkill.returns.items).toBeDefined();
      expect(inventorySkill.returns.filter).toBeDefined();
    });
  });
});