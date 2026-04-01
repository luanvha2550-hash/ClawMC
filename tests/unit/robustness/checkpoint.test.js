import { jest } from '@jest/globals';

/**
 * Checkpoint Manager Tests for ClawMC Robustness Layer
 *
 * Tests CheckpointManager class functionality.
 */

describe('CheckpointManager', () => {
  let CheckpointManager;
  let checkpointManager;

  beforeAll(async () => {
    const module = await import('../../../src/robustness/checkpoint.js');
    CheckpointManager = module.CheckpointManager;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      checkpointManager = new CheckpointManager();
      expect(checkpointManager.interval).toBe(300000); // 5 minutes
      expect(checkpointManager.maxCheckpoints).toBe(10);
      expect(checkpointManager.bot).toBeNull();
      expect(checkpointManager.stateManager).toBeNull();
    });

    it('should accept custom options', () => {
      const mockBot = { entity: { position: { x: 100, y: 64, z: -200 } } };
      const mockStateManager = { currentTask: { type: 'mining' } };

      checkpointManager = new CheckpointManager({
        bot: mockBot,
        stateManager: mockStateManager,
        interval: 60000,
        maxCheckpoints: 20
      });

      expect(checkpointManager.bot).toBe(mockBot);
      expect(checkpointManager.stateManager).toBe(mockStateManager);
      expect(checkpointManager.interval).toBe(60000);
      expect(checkpointManager.maxCheckpoints).toBe(20);
    });

    it('should accept partial options', () => {
      checkpointManager = new CheckpointManager({
        interval: 120000
      });

      expect(checkpointManager.interval).toBe(120000);
      expect(checkpointManager.maxCheckpoints).toBe(10); // default
    });
  });

  describe('_buildCheckpoint', () => {
    beforeEach(() => {
      checkpointManager = new CheckpointManager();
    });

    it('should build checkpoint with timestamp', () => {
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.timestamp).toBeDefined();
      expect(checkpoint.type).toBe('manual');
    });

    it('should build checkpoint with bot position', () => {
      const mockBot = {
        entity: { position: { x: 100.5, y: 64.7, z: -200.8 } },
        game: { dimension: 'minecraft:overworld' },
        health: 18,
        food: 16,
        inventory: {
          items: () => [
            { name: 'diamond_pickaxe', count: 1, slot: 0 },
            { name: 'cobblestone', count: 32, slot: 1 }
          ]
        }
      };

      checkpointManager = new CheckpointManager({ bot: mockBot });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      // Math.floor(100.5) = 100, Math.floor(64.7) = 64, Math.floor(-200.8) = -201
      expect(checkpoint.position).toEqual({
        x: 100,
        y: 64,
        z: -201,
        dimension: 'minecraft:overworld'
      });
    });

    it('should build checkpoint with bot vitals', () => {
      const mockBot = {
        health: 15,
        food: 12
      };

      checkpointManager = new CheckpointManager({ bot: mockBot });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.vitals).toEqual({ health: 15, food: 12 });
    });

    it('should build checkpoint with bot inventory', () => {
      const mockBot = {
        inventory: {
          items: () => [
            { name: 'diamond_pickaxe', count: 1, slot: 0 },
            { name: 'cobblestone', count: 32, slot: 1 }
          ]
        }
      };

      checkpointManager = new CheckpointManager({ bot: mockBot });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.inventory).toHaveLength(2);
      expect(checkpoint.inventory[0]).toEqual({
        name: 'diamond_pickaxe',
        count: 1,
        slot: 0
      });
      expect(checkpoint.inventory[1]).toEqual({
        name: 'cobblestone',
        count: 32,
        slot: 1
      });
    });

    it('should include state manager task data', () => {
      const mockStateManager = {
        currentTask: { type: 'mining', progress: 0.5, timeout: 30000 },
        following: 'Player1',
        curriculumPhase: 'gathering',
        learnedSkills: new Set(['mining', 'crafting'])
      };

      checkpointManager = new CheckpointManager({ stateManager: mockStateManager });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.task_type).toBe('mining');
      expect(checkpoint.task_progress).toBe(0.5);
      expect(checkpoint.data.following).toBe('Player1');
      expect(checkpoint.data.curriculumPhase).toBe('gathering');
      expect(checkpoint.data.learnedSkills).toContain('mining');
      expect(checkpoint.data.learnedSkills).toContain('crafting');
    });

    it('should handle missing bot gracefully', () => {
      checkpointManager = new CheckpointManager();
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.position).toBeNull();
      expect(checkpoint.vitals).toEqual({ health: 20, food: 20 }); // defaults
      expect(checkpoint.inventory).toEqual([]);
    });

    it('should handle missing state manager gracefully', () => {
      checkpointManager = new CheckpointManager();
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.task_type).toBeNull();
      expect(checkpoint.task_progress).toBeNull();
      expect(checkpoint.data).toEqual({});
    });

    it('should include additional data', () => {
      checkpointManager = new CheckpointManager();
      const checkpoint = checkpointManager._buildCheckpoint('manual', {
        customField: 'customValue',
        number: 42
      });

      expect(checkpoint.data.customField).toBe('customValue');
      expect(checkpoint.data.number).toBe(42);
    });

    it('should handle bot without position gracefully', () => {
      const mockBot = { health: 20, food: 20 };

      checkpointManager = new CheckpointManager({ bot: mockBot });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.position).toBeNull();
    });

    it('should handle bot without inventory gracefully', () => {
      const mockBot = { entity: { position: { x: 0, y: 0, z: 0 } } };

      checkpointManager = new CheckpointManager({ bot: mockBot });
      const checkpoint = checkpointManager._buildCheckpoint('manual');

      expect(checkpoint.inventory).toEqual([]);
    });
  });

  describe('_rowToCheckpoint', () => {
    beforeEach(() => {
      checkpointManager = new CheckpointManager();
    });

    it('should parse JSON fields', () => {
      const row = {
        id: 1,
        timestamp: '2026-03-31T10:00:00Z',
        type: 'auto',
        data: '{"key": "value"}',
        task_type: 'mining',
        task_progress: 0.5,
        position: '{"x": 100, "y": 64, "z": -200}',
        inventory: '[{"name": "diamond", "count": 1}]',
        recovered: 0
      };

      const result = checkpointManager._rowToCheckpoint(row);

      expect(result.id).toBe(1);
      expect(result.data).toEqual({ key: 'value' });
      expect(result.position).toEqual({ x: 100, y: 64, z: -200 });
      expect(result.inventory).toEqual([{ name: 'diamond', count: 1 }]);
      expect(result.recovered).toBe(false);
    });

    it('should handle null JSON fields', () => {
      const row = {
        id: 1,
        timestamp: '2026-03-31T10:00:00Z',
        type: 'auto',
        data: null,
        task_type: null,
        task_progress: null,
        position: null,
        inventory: null,
        recovered: 1
      };

      const result = checkpointManager._rowToCheckpoint(row);

      expect(result.data).toEqual({});
      expect(result.position).toBeNull();
      expect(result.inventory).toEqual([]);
      expect(result.recovered).toBe(true);
    });

    it('should convert recovered boolean correctly', () => {
      const row1 = { recovered: 0 };
      const row2 = { recovered: 1 };

      expect(checkpointManager._rowToCheckpoint(row1).recovered).toBe(false);
      expect(checkpointManager._rowToCheckpoint(row2).recovered).toBe(true);
    });
  });

  describe('close', () => {
    it('should stop timer and reset state', () => {
      checkpointManager = new CheckpointManager();
      checkpointManager.timer = setInterval(() => {}, 10000);
      checkpointManager.initialized = true;

      checkpointManager.close();

      expect(checkpointManager.timer).toBeNull();
      expect(checkpointManager.initialized).toBe(false);
    });

    it('should handle close without timer', () => {
      checkpointManager = new CheckpointManager();
      checkpointManager.initialized = true;

      checkpointManager.close();

      expect(checkpointManager.initialized).toBe(false);
    });
  });

  describe('methods when not initialized', () => {
    beforeEach(() => {
      checkpointManager = new CheckpointManager();
    });

    it('should throw on save if not initialized', async () => {
      await expect(checkpointManager.save('manual')).rejects.toThrow('not initialized');
    });

    it('should throw on loadLatest if not initialized', async () => {
      await expect(checkpointManager.loadLatest()).rejects.toThrow('not initialized');
    });

    it('should throw on restore if not initialized', async () => {
      await expect(checkpointManager.restore(1)).rejects.toThrow('not initialized');
    });

    it('should throw on list if not initialized', async () => {
      await expect(checkpointManager.list()).rejects.toThrow('not initialized');
    });

    it('should throw on clear if not initialized', async () => {
      await expect(checkpointManager.clear()).rejects.toThrow('not initialized');
    });

    it('should throw on export if not initialized', async () => {
      await expect(checkpointManager.export(1)).rejects.toThrow('not initialized');
    });

    it('should throw on exportAll if not initialized', async () => {
      await expect(checkpointManager.exportAll()).rejects.toThrow('not initialized');
    });
  });

  describe('auto checkpoint timer', () => {
    it('should start timer on init', async () => {
      checkpointManager = new CheckpointManager();
      checkpointManager.initialized = true;

      checkpointManager._startAutoCheckpoint();

      expect(checkpointManager.timer).not.toBeNull();

      checkpointManager._stopAutoCheckpoint();
    });

    it('should stop timer on stop', () => {
      checkpointManager = new CheckpointManager();
      checkpointManager.timer = setInterval(() => {}, 10000);

      checkpointManager._stopAutoCheckpoint();

      expect(checkpointManager.timer).toBeNull();
    });

    it('should handle stopping null timer', () => {
      checkpointManager = new CheckpointManager();

      checkpointManager._stopAutoCheckpoint();

      expect(checkpointManager.timer).toBeNull();
    });
  });
});