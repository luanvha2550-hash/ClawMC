import { jest } from '@jest/globals';

/**
 * Death Recovery Tests for ClawMC Robustness Layer
 *
 * Tests DeathRecovery class functionality.
 */

describe('DeathRecovery', () => {
  let DeathRecovery;
  let deathRecovery;

  beforeAll(async () => {
    const module = await import('../../../src/robustness/deathRecovery.js');
    DeathRecovery = module.DeathRecovery;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      deathRecovery = new DeathRecovery();
      expect(deathRecovery.maxAttempts).toBe(3);
      expect(deathRecovery.recoveryDelay).toBe(5000);
      expect(deathRecovery.bot).toBeNull();
      expect(deathRecovery.checkpointManager).toBeNull();
    });

    it('should accept custom options', () => {
      const mockBot = { entity: {} };
      const mockCheckpointManager = {};

      deathRecovery = new DeathRecovery({
        bot: mockBot,
        checkpointManager: mockCheckpointManager,
        maxAttempts: 5,
        recoveryDelay: 10000
      });

      expect(deathRecovery.bot).toBe(mockBot);
      expect(deathRecovery.checkpointManager).toBe(mockCheckpointManager);
      expect(deathRecovery.maxAttempts).toBe(5);
      expect(deathRecovery.recoveryDelay).toBe(10000);
    });

    it('should accept partial options', () => {
      deathRecovery = new DeathRecovery({
        maxAttempts: 10
      });

      expect(deathRecovery.maxAttempts).toBe(10);
      expect(deathRecovery.recoveryDelay).toBe(5000); // default
    });
  });

  describe('_captureDeathInfo', () => {
    it('should capture death position from bot', () => {
      const mockBot = {
        entity: { position: { x: 100.5, y: 64.0, z: -200.8 } },
        game: { dimension: 'minecraft:overworld' },
        _lastInventory: [{ name: 'diamond', count: 1 }]
      };

      deathRecovery = new DeathRecovery({ bot: mockBot });
      const info = deathRecovery._captureDeathInfo();

      // Math.floor(100.5) = 100, Math.floor(64.0) = 64, Math.floor(-200.8) = -201
      expect(info.position).toEqual({ x: 100, y: 64, z: -201 });
      expect(info.dimension).toBe('minecraft:overworld');
    });

    it('should capture inventory from last stored', () => {
      const mockBot = {
        _lastInventory: [
          { name: 'diamond_pickaxe', count: 1 },
          { name: 'cobblestone', count: 32 }
        ]
      };

      deathRecovery = new DeathRecovery({ bot: mockBot });
      const info = deathRecovery._captureDeathInfo();

      expect(info.inventory).toHaveLength(2);
      expect(info.inventory[0].name).toBe('diamond_pickaxe');
    });

    it('should handle missing bot gracefully', () => {
      deathRecovery = new DeathRecovery();
      const info = deathRecovery._captureDeathInfo();

      expect(info.position).toBeNull();
      expect(info.dimension).toBeNull();
      expect(info.inventory).toEqual([]);
      expect(info.cause).toBe('unknown');
    });

    it('should handle bot without position gracefully', () => {
      const mockBot = { game: { dimension: 'minecraft:nether' } };

      deathRecovery = new DeathRecovery({ bot: mockBot });
      const info = deathRecovery._captureDeathInfo();

      expect(info.position).toBeNull();
      expect(info.dimension).toBe('minecraft:nether');
    });

    it('should handle bot without lastInventory gracefully', () => {
      const mockBot = { entity: { position: { x: 0, y: 0, z: 0 } } };

      deathRecovery = new DeathRecovery({ bot: mockBot });
      const info = deathRecovery._captureDeathInfo();

      expect(info.inventory).toEqual([]);
    });

    it('should include timestamp', () => {
      deathRecovery = new DeathRecovery();
      const info = deathRecovery._captureDeathInfo();

      expect(info.timestamp).toBeDefined();
      expect(typeof info.timestamp).toBe('string');
    });
  });

  describe('handleDeath', () => {
    it('should return null if not initialized', async () => {
      deathRecovery = new DeathRecovery();
      const result = await deathRecovery.handleDeath();

      expect(result).toBeNull();
    });

    it('should return null if already recovering', async () => {
      deathRecovery = new DeathRecovery();
      deathRecovery.initialized = true;
      deathRecovery.recovering = true;

      const result = await deathRecovery.handleDeath();

      expect(result).toBeNull();
    });
  });

  describe('canRecover', () => {
    it('should return false if not initialized', async () => {
      deathRecovery = new DeathRecovery();
      const result = await deathRecovery.canRecover();

      expect(result).toBe(false);
    });
  });

  describe('methods when not initialized', () => {
    beforeEach(() => {
      deathRecovery = new DeathRecovery();
    });

    it('should throw on attemptRecovery if not initialized', async () => {
      await expect(deathRecovery.attemptRecovery()).rejects.toThrow('not initialized');
    });

    it('should throw on export if not initialized', async () => {
      await expect(deathRecovery.export()).rejects.toThrow('not initialized');
    });

    it('should throw on getStats if not initialized', async () => {
      await expect(deathRecovery.getStats()).rejects.toThrow('not initialized');
    });

    it('should throw on clearOldRecords if not initialized', async () => {
      await expect(deathRecovery.clearOldRecords()).rejects.toThrow('not initialized');
    });
  });

  describe('recovery logic', () => {
    it('should have recovering default to false', () => {
      deathRecovery = new DeathRecovery();
      expect(deathRecovery.recovering).toBe(false);
    });

    it('should handle attemptRecovery error gracefully', async () => {
      deathRecovery = new DeathRecovery();
      deathRecovery.initialized = true;

      // attemptRecovery will fail due to database not initialized
      // but it should handle the error internally and return null
      const result = await deathRecovery.attemptRecovery();

      expect(result).toBeNull();
    });
  });
});