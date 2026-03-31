import { jest } from '@jest/globals';

/**
 * Facts Manager Tests for ClawMC Memory Layer
 *
 * Tests the Facts manager for persistent fact storage with embeddings.
 */

// Mock the logger
jest.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

// ============= Unit Tests (No DB required) =============

describe('FactsManager Unit Tests', () => {
  let FactsManager;
  let createFactsManager;
  let getFactsManager;
  let clearFactsManager;

  beforeAll(async () => {
    const module = await import('../../../src/memory/facts.js');
    FactsManager = module.FactsManager;
    createFactsManager = module.createFactsManager;
    getFactsManager = module.getFactsManager;
    clearFactsManager = module.clearFactsManager;
  });

  afterEach(() => {
    clearFactsManager();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      const manager = new FactsManager();

      expect(manager.config.maxFacts).toBe(1000);
      expect(manager.config.maxAge).toBe(0);
      expect(manager.config.preservedTypes).toEqual(['location', 'base', 'important']);
      expect(manager.config.autoEmbed).toBe(true);
      expect(manager.initialized).toBe(false);
    });

    it('should accept custom configuration', () => {
      const manager = new FactsManager({
        config: {
          maxFacts: 500,
          maxAge: 86400000,
          preservedTypes: ['test'],
          autoEmbed: false
        }
      });

      expect(manager.config.maxFacts).toBe(500);
      expect(manager.config.maxAge).toBe(86400000);
      expect(manager.config.preservedTypes).toEqual(['test']);
      expect(manager.config.autoEmbed).toBe(false);
    });

    it('should initialize with empty statistics', () => {
      const manager = new FactsManager();

      expect(manager.stats.factsSaved).toBe(0);
      expect(manager.stats.factsRetrieved).toBe(0);
      expect(manager.stats.factsDeleted).toBe(0);
      expect(manager.stats.cleanupsRun).toBe(0);
      expect(manager.stats.factsCleaned).toBe(0);
      expect(manager.stats.embeddingGenerated).toBe(0);
      expect(manager.stats.embeddingSkipped).toBe(0);
      expect(manager.stats.errors).toBe(0);
    });
  });

  describe('Error handling without init', () => {
    it('should throw error if saveFact before init', async () => {
      const manager = new FactsManager();

      await expect(manager.saveFact('test', 'key', 'value')).rejects.toThrow('not initialized');
    });

    it('should throw error if getFact before init', async () => {
      const manager = new FactsManager();

      await expect(manager.getFact('test', 'key')).rejects.toThrow('not initialized');
    });

    it('should throw error if getFactsByType before init', async () => {
      const manager = new FactsManager();

      await expect(manager.getFactsByType('test')).rejects.toThrow('not initialized');
    });

    it('should throw error if getAllFacts before init', async () => {
      const manager = new FactsManager();

      await expect(manager.getAllFacts()).rejects.toThrow('not initialized');
    });

    it('should throw error if deleteFact before init', async () => {
      const manager = new FactsManager();

      await expect(manager.deleteFact('test', 'key')).rejects.toThrow('not initialized');
    });

    it('should throw error if deleteFactsByType before init', async () => {
      const manager = new FactsManager();

      await expect(manager.deleteFactsByType('test')).rejects.toThrow('not initialized');
    });

    it('should throw error if cleanup before init', async () => {
      const manager = new FactsManager();

      await expect(manager.cleanup()).rejects.toThrow('not initialized');
    });

    it('should throw error if getFactCount before init', async () => {
      const manager = new FactsManager();

      await expect(manager.getFactCount()).rejects.toThrow('not initialized');
    });

    it('should throw error if getFactCountByType before init', async () => {
      const manager = new FactsManager();

      await expect(manager.getFactCountByType()).rejects.toThrow('not initialized');
    });

    it('should throw error if hasFact before init', async () => {
      const manager = new FactsManager();

      await expect(manager.hasFact('test', 'key')).rejects.toThrow('not initialized');
    });

    it('should throw error if updateEmbedding before init', async () => {
      const manager = new FactsManager();

      await expect(manager.updateEmbedding('test', 'key')).rejects.toThrow('not initialized');
    });
  });

  describe('Configuration', () => {
    it('should get configuration', () => {
      const manager = new FactsManager();

      const config = manager.getConfig();

      expect(config.maxFacts).toBe(1000);
      expect(config.maxAge).toBe(0);
    });

    it('should update configuration', () => {
      const manager = new FactsManager();

      manager.updateConfig({ maxFacts: 500, maxAge: 3600000 });

      expect(manager.config.maxFacts).toBe(500);
      expect(manager.config.maxAge).toBe(3600000);
    });
  });

  describe('Statistics', () => {
    it('should return statistics', () => {
      const manager = new FactsManager();

      const stats = manager.getStats();

      expect(stats.factsSaved).toBeDefined();
      expect(stats.factsRetrieved).toBeDefined();
      expect(stats.factsDeleted).toBeDefined();
    });

    it('should reset statistics', () => {
      const manager = new FactsManager();

      manager.stats.factsSaved = 10;
      manager.stats.factsRetrieved = 5;
      manager.resetStats();

      expect(manager.stats.factsSaved).toBe(0);
      expect(manager.stats.factsRetrieved).toBe(0);
    });
  });

  describe('Singleton Functions', () => {
    it('should create and get singleton instance', () => {
      const manager = createFactsManager();

      expect(getFactsManager()).toBe(manager);
    });

    it('should clear singleton instance', () => {
      createFactsManager();

      clearFactsManager();

      expect(getFactsManager()).toBeNull();
    });

    it('should return null if no instance', () => {
      expect(getFactsManager()).toBeNull();
    });
  });

  describe('Shutdown', () => {
    it('should cleanup resources', async () => {
      const manager = new FactsManager();
      manager.initialized = true;

      await manager.shutdown();

      expect(manager.initialized).toBe(false);
    });
  });
});

// ============= Database-dependent Tests =============

describe('FactsManager Database Tests', () => {
  let FactsManager;
  let initDatabase, closeDatabase, getDatabase;
  let isDatabaseAvailable = false;

  beforeAll(async () => {
    try {
      const module = await import('../../../src/memory/facts.js');
      FactsManager = module.FactsManager;

      const dbModule = await import('../../../src/memory/database.js');
      initDatabase = dbModule.initDatabase;
      closeDatabase = dbModule.closeDatabase;
      getDatabase = dbModule.getDatabase;

      await initDatabase(':memory:');
      isDatabaseAvailable = true;
      await closeDatabase();
    } catch (e) {
      console.log('Database tests skipped: better-sqlite3 not available');
      isDatabaseAvailable = false;
    }
  });

  const testIf = (name, fn) => {
    if (isDatabaseAvailable) {
      it(name, fn);
    } else {
      it.skip(name, fn);
    }
  };

  describe('Initialization', () => {
    testIf('should initialize successfully', async () => {
      await initDatabase(':memory:');
      const manager = new FactsManager();
      await manager.init();

      expect(manager.initialized).toBe(true);
      expect(manager.db).toBeDefined();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should not initialize twice', async () => {
      await initDatabase(':memory:');
      const manager = new FactsManager();
      await manager.init();
      await manager.init();

      expect(manager.initialized).toBe(true);

      await manager.shutdown();
      await closeDatabase();
    });
  });

  describe('CRUD Operations', () => {
    testIf('should save a new fact', async () => {
      await initDatabase(':memory:');

      // Create facts table
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      const result = await manager.saveFact('test', 'key1', { data: 'value' });

      expect(result.type).toBe('test');
      expect(result.key).toBe('key1');
      expect(result.value).toEqual({ data: 'value' });
      expect(result.hasEmbedding).toBe(false);
      expect(manager.stats.factsSaved).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should validate type parameter', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await expect(manager.saveFact('', 'key', 'value')).rejects.toThrow('Invalid type');
      await expect(manager.saveFact(null, 'key', 'value')).rejects.toThrow('Invalid type');
      await expect(manager.saveFact(123, 'key', 'value')).rejects.toThrow('Invalid type');

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should validate key parameter', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await expect(manager.saveFact('test', '', 'value')).rejects.toThrow('Invalid key');
      await expect(manager.saveFact('test', null, 'value')).rejects.toThrow('Invalid key');
      await expect(manager.saveFact('test', 123, 'value')).rejects.toThrow('Invalid key');

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should save various value types', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'str', 'hello');
      await manager.saveFact('test', 'num', 42);
      await manager.saveFact('test', 'obj', { nested: { deep: true } });
      await manager.saveFact('test', 'arr', [1, 2, 3]);
      await manager.saveFact('test', 'bool', true);
      await manager.saveFact('test', 'null', null);

      expect(manager.stats.factsSaved).toBe(6);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should get an existing fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', { data: 'value' });
      const result = await manager.getFact('test', 'key1');

      expect(result).not.toBeNull();
      expect(result.type).toBe('test');
      expect(result.key).toBe('key1');
      expect(result.value).toEqual({ data: 'value' });
      expect(manager.stats.factsRetrieved).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should return null for non-existent fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      const result = await manager.getFact('test', 'nonexistent');

      expect(result).toBeNull();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should update existing fact (upsert)', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'original');
      await manager.saveFact('test', 'key1', 'updated');

      const result = await manager.getFact('test', 'key1');

      expect(result.value).toBe('updated');
      expect(manager.stats.factsSaved).toBe(2);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should get all facts of a type', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'val1');
      await manager.saveFact('test', 'key2', 'val2');
      await manager.saveFact('other', 'key3', 'val3');

      const results = await manager.getFactsByType('test');

      expect(results).toHaveLength(2);
      expect(results.find(r => r.key === 'key1')).toBeDefined();
      expect(results.find(r => r.key === 'key2')).toBeDefined();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should get all facts', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('type1', 'key1', 'val1');
      await manager.saveFact('type2', 'key2', 'val2');

      const results = await manager.getAllFacts();

      expect(results).toHaveLength(2);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should delete a fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'value');
      const deleted = await manager.deleteFact('test', 'key1');

      expect(deleted).toBe(true);
      expect(manager.stats.factsDeleted).toBe(1);

      const result = await manager.getFact('test', 'key1');
      expect(result).toBeNull();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should return false when deleting non-existent fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      const deleted = await manager.deleteFact('test', 'nonexistent');

      expect(deleted).toBe(false);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should delete all facts of a type', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'val1');
      await manager.saveFact('test', 'key2', 'val2');
      await manager.saveFact('other', 'key3', 'val3');

      const count = await manager.deleteFactsByType('test');

      expect(count).toBe(2);

      const remaining = await manager.getAllFacts();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe('other');

      await manager.shutdown();
      await closeDatabase();
    });
  });

  describe('Count Methods', () => {
    testIf('should get total fact count', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'val1');
      await manager.saveFact('test', 'key2', 'val2');

      const count = await manager.getFactCount();

      expect(count).toBe(2);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should get fact count by type', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('location', 'key1', 'val1');
      await manager.saveFact('location', 'key2', 'val2');
      await manager.saveFact('player', 'key3', 'val3');

      const counts = await manager.getFactCountByType();

      expect(counts.location).toBe(2);
      expect(counts.player).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });
  });

  describe('hasFact', () => {
    testIf('should return true for existing fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key1', 'value');

      const exists = await manager.hasFact('test', 'key1');

      expect(exists).toBe(true);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should return false for non-existent fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      const exists = await manager.hasFact('test', 'nonexistent');

      expect(exists).toBe(false);

      await manager.shutdown();
      await closeDatabase();
    });
  });

  describe('Cleanup', () => {
    testIf('should cleanup old facts based on maxAge', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      // Insert an old fact manually
      const oldDate = new Date(Date.now() - 86400000 * 2).toISOString(); // 2 days ago
      db.prepare(`
        INSERT INTO facts (type, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('test', 'old', '"old_value"', oldDate, oldDate);

      const manager = new FactsManager({
        config: {
          maxFacts: 1000,
          maxAge: 86400000 // 1 day
        }
      });
      await manager.init();

      await manager.saveFact('test', 'new', 'new_value');

      const result = await manager.cleanup();

      expect(result.ageDeleted).toBe(1);
      expect(result.totalDeleted).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should cleanup excess facts based on maxFacts', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager({
        config: {
          maxFacts: 2,
          maxAge: 0
        }
      });
      await manager.init();

      await manager.saveFact('test', 'key1', 'val1');
      await manager.saveFact('test', 'key2', 'val2');
      await manager.saveFact('test', 'key3', 'val3');

      const result = await manager.cleanup();

      expect(result.limitDeleted).toBe(1);

      const count = await manager.getFactCount();
      expect(count).toBe(2);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should preserve specified fact types', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager({
        config: {
          maxFacts: 1,
          maxAge: 0,
          preservedTypes: ['location']
        }
      });
      await manager.init();

      await manager.saveFact('location', 'base', 'base_location');
      await manager.saveFact('test', 'key1', 'val1');

      const result = await manager.cleanup();

      // Location fact should be preserved
      const locationFact = await manager.getFact('location', 'base');
      expect(locationFact).not.toBeNull();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should not delete anything when within limits', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager({
        config: {
          maxFacts: 100,
          maxAge: 0
        }
      });
      await manager.init();

      await manager.saveFact('test', 'key1', 'val1');

      const result = await manager.cleanup();

      expect(result.totalDeleted).toBe(0);

      await manager.shutdown();
      await closeDatabase();
    });
  });

  describe('Embedding Generation', () => {
    testIf('should generate embedding when embeddings manager provided', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const mockEmbeddingsManager = {
        vectorize: jest.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3]))
      };

      const manager = new FactsManager({
        embeddingsManager: mockEmbeddingsManager
      });
      await manager.init();

      await manager.saveFact('test', 'key', 'value');

      expect(mockEmbeddingsManager.vectorize).toHaveBeenCalled();
      expect(manager.stats.embeddingGenerated).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should skip embedding when autoEmbed is false', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const mockEmbeddingsManager = {
        vectorize: jest.fn()
      };

      const manager = new FactsManager({
        embeddingsManager: mockEmbeddingsManager,
        config: { autoEmbed: false }
      });
      await manager.init();

      await manager.saveFact('test', 'key', 'value');

      expect(mockEmbeddingsManager.vectorize).not.toHaveBeenCalled();
      expect(manager.stats.embeddingSkipped).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should handle embedding generation failure', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const mockEmbeddingsManager = {
        vectorize: jest.fn().mockRejectedValue(new Error('Embedding failed'))
      };

      const manager = new FactsManager({
        embeddingsManager: mockEmbeddingsManager
      });
      await manager.init();

      const result = await manager.saveFact('test', 'key', 'value');

      // Should still save the fact even without embedding
      expect(result.hasEmbedding).toBe(false);
      expect(manager.stats.embeddingSkipped).toBe(1);

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should update embedding for existing fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const mockEmbeddingsManager = {
        vectorize: jest.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.3]))
      };

      const manager = new FactsManager({
        embeddingsManager: mockEmbeddingsManager
      });
      await manager.init();

      await manager.saveFact('test', 'key', 'value');
      mockEmbeddingsManager.vectorize.mockClear();

      const updated = await manager.updateEmbedding('test', 'key');

      expect(updated).toBe(true);
      expect(mockEmbeddingsManager.vectorize).toHaveBeenCalled();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should return false when updating non-existent fact', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const mockEmbeddingsManager = {
        vectorize: jest.fn()
      };

      const manager = new FactsManager({
        embeddingsManager: mockEmbeddingsManager
      });
      await manager.init();

      const updated = await manager.updateEmbedding('test', 'nonexistent');

      expect(updated).toBe(false);
      expect(mockEmbeddingsManager.vectorize).not.toHaveBeenCalled();

      await manager.shutdown();
      await closeDatabase();
    });

    testIf('should return false when updating without embeddings manager', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        )
      `);

      const manager = new FactsManager();
      await manager.init();

      await manager.saveFact('test', 'key', 'value');

      const updated = await manager.updateEmbedding('test', 'key');

      expect(updated).toBe(false);

      await manager.shutdown();
      await closeDatabase();
    });
  });
});