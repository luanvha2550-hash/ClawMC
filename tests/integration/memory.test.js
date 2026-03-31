// tests/integration/memory.test.js
// Integration tests for Memory Layer components
//
// Note: Tests that require better-sqlite3 will be skipped if the native module
// is not available. This happens on Node 25+ without Visual Studio Build Tools.
//
// To run all tests:
// - Use Node 20 LTS (recommended)
// - Or install Visual Studio Build Tools with C++ workload

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';

// Flags to track availability
let isDatabaseAvailable = false;
let isModuleLoaded = false;

// Module imports
let initDatabase, getDatabase, closeDatabase, run, get, all, transaction;
let MigrationManager, migrations;
let EmbeddingsManager, createEmbeddingsManager, getEmbeddingsManager, clearEmbeddingsManager;
let RAGSystem, createRAGSystem, getRAGSystem, clearRAGSystem;
let FactsManager, createFactsManager, getFactsManager, clearFactsManager;
let HybridSearch, normalizeQuery, extractKeywords;
let initializeMemoryLayer, shutdownMemoryLayer;

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_memory.db');

// Load modules and check database availability
beforeAll(async () => {
  process.env.SERVER_HOST = 'localhost';
  process.env.SERVER_PORT = '25565';
  process.env.SERVER_VERSION = '1.20.4';
  process.env.BOT_NAME = 'TestBot';
  process.env.BOT_OWNER = 'TestOwner';

  try {
    const dbModule = await import('../../src/memory/database.js');
    initDatabase = dbModule.initDatabase;
    getDatabase = dbModule.getDatabase;
    closeDatabase = dbModule.closeDatabase;
    run = dbModule.run;
    get = dbModule.get;
    all = dbModule.all;
    transaction = dbModule.transaction;

    const migModule = await import('../../src/memory/migrations.js');
    MigrationManager = migModule.MigrationManager;
    migrations = migModule.migrations;

    const embModule = await import('../../src/memory/embeddings.js');
    EmbeddingsManager = embModule.EmbeddingsManager;
    createEmbeddingsManager = embModule.createEmbeddingsManager;
    getEmbeddingsManager = embModule.getEmbeddingsManager;
    clearEmbeddingsManager = embModule.clearEmbeddingsManager;

    const ragModule = await import('../../src/memory/rag.js');
    RAGSystem = ragModule.RAGSystem;
    createRAGSystem = ragModule.createRAGSystem;
    getRAGSystem = ragModule.getRAGSystem;
    clearRAGSystem = ragModule.clearRAGSystem;

    const factsModule = await import('../../src/memory/facts.js');
    FactsManager = factsModule.FactsManager;
    createFactsManager = factsModule.createFactsManager;
    getFactsManager = factsModule.getFactsManager;
    clearFactsManager = factsModule.clearFactsManager;

    const hybridModule = await import('../../src/memory/hybridSearch.js');
    HybridSearch = hybridModule.HybridSearch;
    normalizeQuery = hybridModule.normalizeQuery;
    extractKeywords = hybridModule.extractKeywords;

    const indexModule = await import('../../src/memory/index.js');
    initializeMemoryLayer = indexModule.initializeMemoryLayer;
    shutdownMemoryLayer = indexModule.shutdownMemoryLayer;

    isModuleLoaded = true;

    // Test if database actually works
    try {
      const testDb = await initDatabase(':memory:');
      if (testDb) {
        testDb.close();
        isDatabaseAvailable = true;
      }
    } catch (e) {
      console.log('Database tests skipped: better-sqlite3 not available');
      console.log('To run database tests, use Node 20 LTS or install Visual Studio Build Tools');
      isDatabaseAvailable = false;
    }
  } catch (e) {
    console.log('Module loading failed:', e.message);
    isModuleLoaded = false;
    isDatabaseAvailable = false;
  }
});

afterAll(() => {
  delete process.env.SERVER_HOST;
  delete process.env.SERVER_PORT;
  delete process.env.SERVER_VERSION;
  delete process.env.BOT_NAME;
  delete process.env.BOT_OWNER;
});

// Helper to create conditional tests
const testIf = (name, fn) => {
  if (isDatabaseAvailable) {
    it(name, fn);
  } else {
    it.skip(name, fn);
  }
};

// Helper for tests that don't need database
const testAlways = (name, fn) => {
  it(name, fn);
};

// Helper to cleanup test database
async function cleanupTestDb() {
  try {
    await closeDatabase();
  } catch (e) {
    // Ignore if already closed
  }
  if (clearEmbeddingsManager) clearEmbeddingsManager();
  if (clearRAGSystem) clearRAGSystem();
  if (clearFactsManager) clearFactsManager();

  try {
    await fs.unlink(TEST_DB_PATH);
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await fs.unlink(`${TEST_DB_PATH}-wal`);
  } catch (e) {
    // Ignore
  }
  try {
    await fs.unlink(`${TEST_DB_PATH}-shm`);
  } catch (e) {
    // Ignore
  }
}

describe('Memory Layer - Module Exports', () => {
  testAlways('should load all modules', () => {
    expect(isModuleLoaded).toBe(true);
  });

  testAlways('should export all database functions', () => {
    expect(initDatabase).toBeDefined();
    expect(getDatabase).toBeDefined();
    expect(closeDatabase).toBeDefined();
    expect(run).toBeDefined();
    expect(get).toBeDefined();
    expect(all).toBeDefined();
    expect(transaction).toBeDefined();
  });

  testAlways('should export MigrationManager and migrations', () => {
    expect(MigrationManager).toBeDefined();
    expect(migrations).toBeDefined();
    expect(Array.isArray(migrations)).toBe(true);
  });

  testAlways('should export EmbeddingsManager and helpers', () => {
    expect(EmbeddingsManager).toBeDefined();
    expect(createEmbeddingsManager).toBeDefined();
    expect(getEmbeddingsManager).toBeDefined();
    expect(clearEmbeddingsManager).toBeDefined();
  });

  testAlways('should export RAGSystem and helpers', () => {
    expect(RAGSystem).toBeDefined();
    expect(createRAGSystem).toBeDefined();
    expect(getRAGSystem).toBeDefined();
    expect(clearRAGSystem).toBeDefined();
  });

  testAlways('should export FactsManager and helpers', () => {
    expect(FactsManager).toBeDefined();
    expect(createFactsManager).toBeDefined();
    expect(getFactsManager).toBeDefined();
    expect(clearFactsManager).toBeDefined();
  });

  testAlways('should export HybridSearch and helpers', () => {
    expect(HybridSearch).toBeDefined();
    expect(normalizeQuery).toBeDefined();
    expect(extractKeywords).toBeDefined();
  });

  testAlways('should export initializeMemoryLayer and shutdownMemoryLayer', () => {
    expect(initializeMemoryLayer).toBeDefined();
    expect(shutdownMemoryLayer).toBeDefined();
  });
});

describe('Hybrid Search Utilities', () => {
  testAlways('should normalize queries correctly', () => {
    expect(normalizeQuery('Hello World!')).toBe('hello world');
    expect(normalizeQuery('  Multiple   Spaces  ')).toBe('multiple spaces');
    expect(normalizeQuery('Special@#$Characters!')).toBe('special characters');
    expect(normalizeQuery('')).toBe('');
    expect(normalizeQuery(null)).toBe('');
  });

  testAlways('should extract keywords correctly', () => {
    expect(extractKeywords('hello world test')).toEqual(['hello', 'world', 'test']);
    expect(extractKeywords('a b c de fgh')).toEqual(['fgh']); // Only words >= 3 chars
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords(null)).toEqual([]);
  });
});

describe('Migration Definitions', () => {
  testAlways('should have 5 migrations defined', () => {
    expect(migrations).toHaveLength(5);
  });

  testAlways('should have correct migration names', () => {
    expect(migrations[0].name).toBe('initial_schema');
    expect(migrations[1].name).toBe('add_checkpoints_table');
    expect(migrations[2].name).toBe('add_death_records');
    expect(migrations[3].name).toBe('add_bot_state');
    expect(migrations[4].name).toBe('add_community_tables');
  });

  testAlways('should have sequential version numbers', () => {
    migrations.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1);
    });
  });

  testAlways('should have up and down SQL for each migration', () => {
    migrations.forEach((migration) => {
      expect(migration.up).toBeDefined();
      expect(typeof migration.up).toBe('string');
      expect(migration.down).toBeDefined();
      expect(typeof migration.down).toBe('string');
    });
  });
});

describe('EmbeddingsManager Unit Tests', () => {
  afterEach(() => {
    if (clearEmbeddingsManager) clearEmbeddingsManager();
  });

  testAlways('should create instance with default configuration', () => {
    const manager = new EmbeddingsManager();
    expect(manager.mode).toBe('local');
    expect(manager.maxCacheSize).toBe(1000);
    expect(manager.dimensions).toBe(384);
  });

  testAlways('should accept custom configuration', () => {
    const manager = new EmbeddingsManager({
      mode: 'api',
      maxCacheSize: 500,
      dimensions: 768,
      apiProvider: 'google'
    });
    expect(manager.mode).toBe('api');
    expect(manager.maxCacheSize).toBe(500);
    expect(manager.dimensions).toBe(768);
  });

  testAlways('should use singleton pattern', () => {
    const manager = createEmbeddingsManager({ mode: 'local' });
    expect(getEmbeddingsManager()).toBe(manager);
  });

  testAlways('should clear singleton instance', () => {
    createEmbeddingsManager({ mode: 'local' });
    expect(getEmbeddingsManager()).not.toBeNull();
    clearEmbeddingsManager();
    expect(getEmbeddingsManager()).toBeNull();
  });

  testAlways('should initialize with empty statistics', () => {
    const manager = new EmbeddingsManager();
    expect(manager.stats.totalVectorizations).toBe(0);
    expect(manager.stats.cacheHits).toBe(0);
    expect(manager.stats.cacheMisses).toBe(0);
  });
});

describe('FactsManager Unit Tests', () => {
  afterEach(() => {
    if (clearFactsManager) clearFactsManager();
  });

  testAlways('should create instance with default configuration', () => {
    const manager = new FactsManager();
    expect(manager.config.maxFacts).toBe(1000);
    expect(manager.config.maxAge).toBe(0);
    expect(manager.config.preservedTypes).toEqual(['location', 'base', 'important']);
    expect(manager.config.autoEmbed).toBe(true);
  });

  testAlways('should throw error if operations called before init', async () => {
    const manager = new FactsManager();
    await expect(manager.saveFact('test', 'key', 'value')).rejects.toThrow('not initialized');
    await expect(manager.getFact('test', 'key')).rejects.toThrow('not initialized');
    await expect(manager.getAllFacts()).rejects.toThrow('not initialized');
  });

  testAlways('should use singleton pattern', () => {
    const manager = createFactsManager();
    expect(getFactsManager()).toBe(manager);
  });

  testAlways('should clear singleton instance', () => {
    createFactsManager();
    expect(getFactsManager()).not.toBeNull();
    clearFactsManager();
    expect(getFactsManager()).toBeNull();
  });
});

describe('RAGSystem Unit Tests', () => {
  afterEach(() => {
    if (clearRAGSystem) clearRAGSystem();
  });

  testAlways('should create instance with default configuration', () => {
    const rag = new RAGSystem();
    expect(rag.config.minSimilarity).toBe(0.5);
    expect(rag.config.maxResults).toBe(10);
    expect(rag.config.semanticWeight).toBe(0.7);
  });

  testAlways('should use singleton pattern', () => {
    const rag = createRAGSystem();
    expect(getRAGSystem()).toBe(rag);
  });

  testAlways('should clear singleton instance', () => {
    createRAGSystem();
    expect(getRAGSystem()).not.toBeNull();
    clearRAGSystem();
    expect(getRAGSystem()).toBeNull();
  });
});

// Database-dependent tests
describe('Database Integration', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  testIf('should initialize database with WAL mode', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    expect(db).toBeDefined();
    expect(getDatabase()).toBe(db);

    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    expect(foreignKeys).toBe(1);

    await closeDatabase();
  });

  testIf('should support in-memory database', async () => {
    const db = await initDatabase(':memory:');
    expect(db).toBeDefined();
    expect(getDatabase()).toBe(db);
    await closeDatabase();
  });

  testIf('should throw error when getting database before init', () => {
    expect(() => getDatabase()).toThrow('Database not initialized');
  });
});

describe('Migrations', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  testIf('should create all tables on first migration', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();

    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('schema_version');
    expect(tableNames).toContain('skills_metadata');
    expect(tableNames).toContain('facts');
    expect(tableNames).toContain('executions');
    expect(tableNames).toContain('checkpoints');
    expect(tableNames).toContain('death_records');
    expect(tableNames).toContain('bot_state');
    expect(tableNames).toContain('community_peers');
    expect(tableNames).toContain('shared_facts');

    await closeDatabase();
  });

  testIf('should track schema version correctly', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const version = await manager.getCurrentVersion();
    expect(version).toBe(migrations.length);

    await closeDatabase();
  });

  testIf('should not re-run completed migrations', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);

    await manager.migrate();
    const version1 = await manager.getCurrentVersion();

    await manager.migrate();
    const version2 = await manager.getCurrentVersion();

    expect(version1).toBe(version2);

    await closeDatabase();
  });

  testIf('should create proper indexes', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all();

    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain('idx_facts_type');
    expect(indexNames).toContain('idx_facts_key');
    expect(indexNames).toContain('idx_executions_timestamp');
    expect(indexNames).toContain('idx_checkpoints_timestamp');
    expect(indexNames).toContain('idx_checkpoints_type');
    expect(indexNames).toContain('idx_death_records_timestamp');

    await closeDatabase();
  });
});

describe('Facts Manager Database Tests', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  testIf('should save and retrieve a fact', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({
      db,
      embeddingsManager: null,
      config: { autoEmbed: false }
    });
    await factsManager.init();

    const saved = await factsManager.saveFact('location', 'base', { x: 100, y: 64, z: -200 });

    expect(saved.id).toBeDefined();
    expect(saved.type).toBe('location');
    expect(saved.key).toBe('base');
    expect(saved.value).toEqual({ x: 100, y: 64, z: -200 });
    expect(saved.hasEmbedding).toBe(false);

    const retrieved = await factsManager.getFact('location', 'base');

    expect(retrieved).not.toBeNull();
    expect(retrieved.type).toBe('location');
    expect(retrieved.key).toBe('base');
    expect(retrieved.value).toEqual({ x: 100, y: 64, z: -200 });

    await closeDatabase();
    clearFactsManager();
  });

  testIf('should update existing fact (upsert)', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({
      db,
      config: { autoEmbed: false }
    });
    await factsManager.init();

    await factsManager.saveFact('test', 'key1', 'value1');
    await factsManager.saveFact('test', 'key1', 'value2');

    const fact = await factsManager.getFact('test', 'key1');
    expect(fact.value).toBe('value2');

    const count = await factsManager.getFactCount();
    expect(count).toBe(1);

    await closeDatabase();
    clearFactsManager();
  });

  testIf('should get facts by type', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({ db, config: { autoEmbed: false } });
    await factsManager.init();

    await factsManager.saveFact('typeA', 'key1', 'value1');
    await factsManager.saveFact('typeA', 'key2', 'value2');
    await factsManager.saveFact('typeB', 'key3', 'value3');

    const typeAFacts = await factsManager.getFactsByType('typeA');

    expect(typeAFacts.length).toBe(2);
    expect(typeAFacts.map(f => f.key)).toContain('key1');
    expect(typeAFacts.map(f => f.key)).toContain('key2');

    await closeDatabase();
    clearFactsManager();
  });

  testIf('should delete a fact', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({ db, config: { autoEmbed: false } });
    await factsManager.init();

    await factsManager.saveFact('test', 'key1', 'value1');

    const deleted = await factsManager.deleteFact('test', 'key1');
    expect(deleted).toBe(true);

    const fact = await factsManager.getFact('test', 'key1');
    expect(fact).toBeNull();

    await closeDatabase();
    clearFactsManager();
  });

  testIf('should count facts by type', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({ db, config: { autoEmbed: false } });
    await factsManager.init();

    await factsManager.saveFact('typeA', 'key1', 'value1');
    await factsManager.saveFact('typeA', 'key2', 'value2');
    await factsManager.saveFact('typeB', 'key3', 'value3');

    const counts = await factsManager.getFactCountByType();

    expect(counts['typeA']).toBe(2);
    expect(counts['typeB']).toBe(1);

    await closeDatabase();
    clearFactsManager();
  });

  testIf('should cleanup excess facts', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const factsManager = createFactsManager({
      db,
      config: {
        maxFacts: 3,
        preservedTypes: ['important']
      }
    });
    await factsManager.init();

    // Add facts beyond limit
    for (let i = 0; i < 5; i++) {
      await factsManager.saveFact('test', `key${i}`, `value${i}`);
    }

    // Add an important fact
    await factsManager.saveFact('important', 'important_key', 'important_value');

    const result = await factsManager.cleanup();
    expect(result.totalDeleted).toBeGreaterThan(0);

    const remaining = await factsManager.getAllFacts();
    expect(remaining.length).toBeLessThanOrEqual(3);

    // Important fact should still exist
    const importantFact = await factsManager.getFact('important', 'important_key');
    expect(importantFact).not.toBeNull();

    await closeDatabase();
    clearFactsManager();
  });
});

describe('RAG System Database Tests', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  testIf('should initialize successfully', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const ragSystem = createRAGSystem({
      db,
      embeddingsManager: null,
      config: {
        minSimilarity: 0.3,
        maxResults: 10,
        hybridSearch: true
      }
    });
    await ragSystem.init();

    expect(ragSystem.initialized).toBe(true);
    expect(ragSystem.hybridSearch).toBeDefined();

    await closeDatabase();
    clearRAGSystem();
  });

  testIf('should return empty results for empty query', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const ragSystem = createRAGSystem({ db, embeddingsManager: null });
    await ragSystem.init();

    const results = await ragSystem.search('');
    expect(results).toEqual([]);

    const results2 = await ragSystem.search(null);
    expect(results2).toEqual([]);

    await closeDatabase();
    clearRAGSystem();
  });

  testIf('should get and update config', async () => {
    const db = await initDatabase(TEST_DB_PATH);
    const manager = new MigrationManager(db);
    await manager.migrate();

    const ragSystem = createRAGSystem({
      db,
      embeddingsManager: null,
      config: { minSimilarity: 0.3, maxResults: 10 }
    });
    await ragSystem.init();

    const config = ragSystem.getConfig();
    expect(config.minSimilarity).toBe(0.3);
    expect(config.maxResults).toBe(10);

    ragSystem.updateConfig({ minSimilarity: 0.5 });

    const updatedConfig = ragSystem.getConfig();
    expect(updatedConfig.minSimilarity).toBe(0.5);

    await closeDatabase();
    clearRAGSystem();
  });
});

describe('Memory Layer Full Initialization', () => {
  beforeEach(async () => {
    await cleanupTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  testIf('should initialize all components with default config', async () => {
    const components = await initializeMemoryLayer({
      dbPath: TEST_DB_PATH,
      embeddingsConfig: { mode: 'local' },
      factsConfig: { autoEmbed: false }
    });

    expect(components.db).toBeDefined();
    expect(components.embeddingsManager).toBeDefined();
    expect(components.ragSystem).toBeDefined();
    expect(components.factsManager).toBeDefined();
    expect(components.migrationManager).toBeDefined();

    // Verify all components are initialized
    expect(components.embeddingsManager.initialized).toBe(true);
    expect(components.ragSystem.initialized).toBe(true);
    expect(components.factsManager.initialized).toBe(true);

    await shutdownMemoryLayer();
  });

  testIf('should persist data between sessions', async () => {
    // First session
    const session1 = await initializeMemoryLayer({
      dbPath: TEST_DB_PATH,
      factsConfig: { autoEmbed: false }
    });

    await session1.factsManager.saveFact('persistent', 'data', { value: 'should persist' });
    await shutdownMemoryLayer();

    // Second session
    const session2 = await initializeMemoryLayer({
      dbPath: TEST_DB_PATH,
      factsConfig: { autoEmbed: false }
    });

    const fact = await session2.factsManager.getFact('persistent', 'data');

    expect(fact).not.toBeNull();
    expect(fact.value).toEqual({ value: 'should persist' });

    await shutdownMemoryLayer();
  });

  testIf('should handle cleanup of facts correctly', async () => {
    const components = await initializeMemoryLayer({
      dbPath: TEST_DB_PATH,
      factsConfig: {
        maxFacts: 5,
        maxAge: 0,
        preservedTypes: ['important'],
        autoEmbed: false
      }
    });

    const { factsManager } = components;

    // Add facts beyond limit
    for (let i = 0; i < 10; i++) {
      await factsManager.saveFact('test', `key${i}`, `value${i}`);
    }

    // Add important fact
    await factsManager.saveFact('important', 'protected', 'should not be deleted');

    // Run cleanup
    const result = await factsManager.cleanup();

    // Should have cleaned up excess facts
    expect(result.totalDeleted).toBeGreaterThan(0);

    // Important fact should still exist
    const importantFact = await factsManager.getFact('important', 'protected');
    expect(importantFact).not.toBeNull();

    // Total should be within limit
    const count = await factsManager.getFactCount();
    expect(count).toBeLessThanOrEqual(6); // 5 max + 1 preserved

    await shutdownMemoryLayer();
  });
});