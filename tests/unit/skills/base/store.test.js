import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { storeSkill } from '../../../../src/skills/base/store.js';

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
  withTimeout: jest.fn((promise) => promise)
}));

describe('StoreSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder and chest capabilities
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn().mockReturnValue(null),
      openChest: jest.fn().mockResolvedValue(null),
      inventory: {
        items: jest.fn().mockReturnValue([])
      }
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 10, y: 64, z: 20 })
    };

    execute = storeSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.stored).toBe(0);
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when item name is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
      expect(result.stored).toBe(0);
    });

    it('should return error when item name is empty', async () => {
      const result = await execute(mockBot, mockState, { item: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when count is invalid', async () => {
      const result = await execute(mockBot, mockState, {
        item: 'cobblestone',
        count: -1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when count is not an integer', async () => {
      const result = await execute(mockBot, mockState, {
        item: 'cobblestone',
        count: 1.5
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when no chest found', async () => {
      mockBot.findBlocks.mockReturnValue([]);

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No chest found');
      expect(mockBot.findBlocks).toHaveBeenCalled();
    });

    it('should return error when chest block not loaded', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue(null);

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not loaded');
    });

    it('should return error when item not in inventory', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'chest',
        position: { x: 100, y: 64, z: 200 }
      });
      mockBot.inventory.items.mockReturnValue([]);

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('found in inventory');
    });

    it('should store items successfully', async () => {
      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'chest',
        position: { x: 100, y: 64, z: 200 }
      });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32, type: 1 }
      ]);

      const result = await execute(mockBot, mockState, {
        item: 'cobblestone',
        count: 10
      });

      expect(result.success).toBe(true);
      expect(result.stored).toBe(10);
      expect(result.item).toBe('cobblestone');
      expect(mockChest.deposit).toHaveBeenCalledWith(1, null, 10);
      expect(mockChest.close).toHaveBeenCalled();
    });

    it('should store all items when count not specified', async () => {
      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'chest',
        position: { x: 100, y: 64, z: 200 }
      });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32, type: 1 }
      ]);

      const result = await execute(mockBot, mockState, {
        item: 'cobblestone'
      });

      expect(result.success).toBe(true);
      expect(result.stored).toBe(32);
      expect(mockChest.deposit).toHaveBeenCalledWith(1, null, 32);
    });

    it('should store partial items when count exceeds available', async () => {
      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'chest',
        position: { x: 100, y: 64, z: 200 }
      });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 10, type: 1 }
      ]);

      const result = await execute(mockBot, mockState, {
        item: 'cobblestone',
        count: 50
      });

      expect(result.success).toBe(true);
      expect(result.stored).toBe(10);
    });

    it('should use GoalNear for navigation', async () => {
      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'chest' });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 10, type: 1 }
      ]);

      await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(GoalNear).toHaveBeenCalled();
      const call = GoalNear.mock.calls[0];
      expect(call[0]).toBe(100);
      expect(call[1]).toBe(64);
      expect(call[2]).toBe(200);
      expect(call[3]).toBe(2); // range parameter
    });

    it('should handle navigation error', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'chest' });
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32, type: 1 }
      ]);
      mockBot.pathfinder.goto.mockRejectedValue(new Error('Path not found'));

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to reach chest');
    });

    it('should handle chest open error', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'chest' });
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32, type: 1 }
      ]);
      mockBot.openChest.mockRejectedValue(new Error('Chest blocked'));

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to open chest');
    });

    it('should handle deposit error', async () => {
      const mockChest = {
        deposit: jest.fn().mockRejectedValue(new Error('Chest full')),
        close: jest.fn()
      };

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'chest' });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 32, type: 1 }
      ]);

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      // Should still close chest even after error
      expect(mockChest.close).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('should handle trapped_chest as valid chest', async () => {
      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };

      mockBot.findBlocks.mockImplementation(({ matching }) => {
        // Test that the matching function accepts trapped_chest
        const result = matching({ name: 'trapped_chest' });
        return result ? [{ x: 100, y: 64, z: 200 }] : [];
      });
      mockBot.blockAt.mockReturnValue({
        name: 'trapped_chest',
        position: { x: 100, y: 64, z: 200 }
      });
      mockBot.openChest.mockResolvedValue(mockChest);
      mockBot.inventory.items.mockReturnValue([
        { name: 'cobblestone', count: 10, type: 1 }
      ]);

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(true);
      expect(result.stored).toBe(10);
    });

    it('should use custom range parameter', async () => {
      mockBot.findBlocks.mockReturnValue([]);

      await execute(mockBot, mockState, {
        item: 'cobblestone',
        range: 16
      });

      expect(mockBot.findBlocks).toHaveBeenCalledWith({
        matching: expect.any(Function),
        maxDistance: 16,
        count: 1
      });
    });

    it('should stop pathfinder on unexpected error', async () => {
      mockBot.findBlocks.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await execute(mockBot, mockState, { item: 'cobblestone' });

      expect(result.success).toBe(false);
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(storeSkill.name).toBe('store');
    });

    it('should have description', () => {
      expect(storeSkill.description).toBeDefined();
      expect(storeSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof storeSkill.execute).toBe('function');
    });

    it('should have required parameters defined', () => {
      expect(storeSkill.parameters).toBeDefined();
      expect(storeSkill.parameters.item).toBeDefined();
      expect(storeSkill.parameters.item.required).toBe(true);
    });

    it('should have optional parameters with defaults', () => {
      expect(storeSkill.parameters.range.default).toBe(32);
      expect(storeSkill.parameters.timeout.default).toBe(30000);
    });

    it('should have returns defined', () => {
      expect(storeSkill.returns).toBeDefined();
      expect(storeSkill.returns.success).toBeDefined();
      expect(storeSkill.returns.stored).toBeDefined();
      expect(storeSkill.returns.item).toBeDefined();
      expect(storeSkill.returns.chest).toBeDefined();
    });
  });
});