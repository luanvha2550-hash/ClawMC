import { jest } from '@jest/globals';
import { GoalNear } from 'mineflayer-pathfinder';
import { mineSkill } from '../../../../src/skills/base/mine.js';

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

describe('MineSkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with pathfinder and dig capabilities
    mockBot = {
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn()
      },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn().mockReturnValue(null),
      dig: jest.fn().mockResolvedValue(undefined),
      digTime: jest.fn().mockReturnValue(1000)
    };

    // Create mock state
    mockState = {
      getPosition: jest.fn().mockReturnValue({ x: 10, y: 64, z: 20 })
    };

    execute = mineSkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('execute', () => {
    it('should mine a single block successfully', async () => {
      // Setup block finding
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'stone',
        position: { x: 100, y: 64, z: 200 }
      });

      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: 1
      });

      expect(result.success).toBe(true);
      expect(result.mined).toBe(1);
      expect(result.block).toBe('stone');
      expect(mockBot.findBlocks).toHaveBeenCalledWith({
        matching: 'stone',
        maxDistance: 64,
        count: 1
      });
      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should mine multiple blocks', async () => {
      // Setup block finding - return different positions each call
      mockBot.findBlocks
        .mockReturnValueOnce([{ x: 100, y: 64, z: 200 }])
        .mockReturnValueOnce([{ x: 101, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({
        name: 'stone',
        position: { x: 100, y: 64, z: 200 }
      });

      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: 2
      });

      expect(result.success).toBe(true);
      expect(result.mined).toBe(2);
      expect(result.blocks).toHaveLength(2);
    });

    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, {
        block: 'stone'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.mined).toBe(0);
    });

    it('should return error when pathfinder is not available', async () => {
      const result = await execute({ pathfinder: null }, mockState, {
        block: 'stone'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when block name is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when block name is empty', async () => {
      const result = await execute(mockBot, mockState, {
        block: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when count is invalid', async () => {
      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: -1
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when count is not an integer', async () => {
      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: 1.5
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should return error when block not found', async () => {
      mockBot.findBlocks.mockReturnValue([]);

      const result = await execute(mockBot, mockState, {
        block: 'nonexistent_block'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle navigation timeout', async () => {
      jest.useFakeTimers();

      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'stone' });
      mockBot.pathfinder.goto.mockImplementation(() => new Promise(() => {}));

      const resultPromise = execute(mockBot, mockState, {
        block: 'stone',
        timeout: 1000
      });

      await jest.advanceTimersByTimeAsync(1100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.mined).toBe(0);

      jest.useRealTimers();
    });

    it('should handle dig error and continue', async () => {
      mockBot.findBlocks
        .mockReturnValueOnce([{ x: 100, y: 64, z: 200 }])
        .mockReturnValueOnce([{ x: 101, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'stone' });
      mockBot.dig
        .mockRejectedValueOnce(new Error('Dig failed'))
        .mockResolvedValueOnce(undefined);

      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: 2
      });

      // Should continue to next block after first failure
      expect(result.mined).toBe(1);
    });

    it('should use custom range parameter', async () => {
      mockBot.findBlocks.mockReturnValue([]);

      await execute(mockBot, mockState, {
        block: 'stone',
        range: 32
      });

      expect(mockBot.findBlocks).toHaveBeenCalledWith({
        matching: 'stone',
        maxDistance: 32,
        count: 1
      });
    });

    it('should use GoalNear for navigation', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue({ name: 'stone' });

      await execute(mockBot, mockState, {
        block: 'stone'
      });

      expect(GoalNear).toHaveBeenCalled();
      const call = GoalNear.mock.calls[0];
      expect(call[0]).toBe(100);
      expect(call[1]).toBe(64);
      expect(call[2]).toBe(200);
      expect(call[3]).toBe(3); // range parameter
    });

    it('should handle block not loaded at position', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 100, y: 64, z: 200 }]);
      mockBot.blockAt.mockReturnValue(null);

      const result = await execute(mockBot, mockState, {
        block: 'stone',
        count: 1
      });

      // Should return false as no blocks could be mined
      expect(result.success).toBe(false);
      expect(result.mined).toBe(0);
    });

    it('should stop pathfinder on unexpected error', async () => {
      mockBot.findBlocks.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await execute(mockBot, mockState, {
        block: 'stone'
      });

      expect(result.success).toBe(false);
      expect(mockBot.pathfinder.stop).toHaveBeenCalled();
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(mineSkill.name).toBe('mine');
    });

    it('should have description', () => {
      expect(mineSkill.description).toBeDefined();
      expect(mineSkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof mineSkill.execute).toBe('function');
    });

    it('should have required parameters defined', () => {
      expect(mineSkill.parameters).toBeDefined();
      expect(mineSkill.parameters.block).toBeDefined();
      expect(mineSkill.parameters.block.required).toBe(true);
    });

    it('should have optional parameters with defaults', () => {
      expect(mineSkill.parameters.count.default).toBe(1);
      expect(mineSkill.parameters.timeout.default).toBe(30000);
      expect(mineSkill.parameters.range.default).toBe(64);
    });

    it('should have returns defined', () => {
      expect(mineSkill.returns).toBeDefined();
      expect(mineSkill.returns.success).toBeDefined();
      expect(mineSkill.returns.mined).toBeDefined();
      expect(mineSkill.returns.block).toBeDefined();
    });
  });
});