import { jest } from '@jest/globals';

/**
 * Database Tests for ClawMC Memory Layer
 *
 * Note: Tests that require better-sqlite3 will be skipped if the native module
 * is not available. This happens on Node 25+ without Visual Studio Build Tools.
 *
 * To run all tests:
 * - Use Node 20 LTS (recommended)
 * - Or install Visual Studio Build Tools with C++ workload
 */

// Test migration definitions (no database required)
describe('Migration definitions', () => {
  let migrations;

  beforeAll(async () => {
    try {
      const migModule = await import('../../../src/memory/migrations.js');
      migrations = migModule.migrations;
    } catch (e) {
      console.log('Migration module not available:', e.message);
      migrations = null;
    }
  });

  it('should have 5 migrations defined', () => {
    expect(migrations).toBeDefined();
    expect(migrations).toHaveLength(5);
  });

  it('should have correct migration names', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].name).toBe('initial_schema');
    expect(migrations[1].name).toBe('add_checkpoints_table');
    expect(migrations[2].name).toBe('add_death_records');
    expect(migrations[3].name).toBe('add_bot_state');
    expect(migrations[4].name).toBe('add_community_tables');
  });

  it('should have sequential version numbers', () => {
    expect(migrations).toBeDefined();
    migrations.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1);
    });
  });

  it('should have up and down SQL for each migration', () => {
    expect(migrations).toBeDefined();
    migrations.forEach((migration) => {
      expect(migration.up).toBeDefined();
      expect(typeof migration.up).toBe('string');
      expect(migration.down).toBeDefined();
      expect(typeof migration.down).toBe('string');
    });
  });

  it('should have valid SQL in up migrations', () => {
    expect(migrations).toBeDefined();
    migrations.forEach((migration) => {
      // Check for CREATE statements
      expect(migration.up.length).toBeGreaterThan(50);
      expect(
        migration.up.includes('CREATE TABLE') || migration.up.includes('CREATE INDEX')
      ).toBe(true);
    });
  });

  it('should have valid SQL in down migrations', () => {
    expect(migrations).toBeDefined();
    migrations.forEach((migration) => {
      // Check for DROP statements
      expect(migration.down.length).toBeGreaterThan(10);
      expect(migration.down.includes('DROP')).toBe(true);
    });
  });

  it('should create skills_metadata table in initial migration', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].up).toContain('CREATE TABLE IF NOT EXISTS skills_metadata');
  });

  it('should create facts table in initial migration', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].up).toContain('CREATE TABLE IF NOT EXISTS facts');
  });

  it('should create executions table in initial migration', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].up).toContain('CREATE TABLE IF NOT EXISTS executions');
  });

  it('should create schema_version table in initial migration', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].up).toContain('CREATE TABLE IF NOT EXISTS schema_version');
  });

  it('should create indexes on facts table', () => {
    expect(migrations).toBeDefined();
    expect(migrations[0].up).toContain('CREATE INDEX IF NOT EXISTS idx_facts_type');
    expect(migrations[0].up).toContain('CREATE INDEX IF NOT EXISTS idx_facts_key');
  });
});

// Database integration tests - require better-sqlite3
describe('Database Integration', () => {
  let database;
  let migrations;
  let dbModule;
  let initDatabase, getDatabase, closeDatabase, run, get, all, transaction;
  let MigrationManager;
  let isDatabaseAvailable = false;

  beforeAll(async () => {
    try {
      // Import modules
      dbModule = await import('../../../src/memory/database.js');
      const migModule = await import('../../../src/memory/migrations.js');

      initDatabase = dbModule.initDatabase;
      getDatabase = dbModule.getDatabase;
      closeDatabase = dbModule.closeDatabase;
      run = dbModule.run;
      get = dbModule.get;
      all = dbModule.all;
      transaction = dbModule.transaction;
      MigrationManager = migModule.MigrationManager;
      migrations = migModule.migrations;

      // Test if database actually works
      const testDb = initDatabase(':memory:');
      if (testDb) {
        testDb.close();
        isDatabaseAvailable = true;
      }
    } catch (e) {
      console.log('Database tests skipped: better-sqlite3 not available');
      console.log('To run database tests, use Node 20 LTS or install Visual Studio Build Tools');
      isDatabaseAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDatabaseAvailable) {
      try {
        await closeDatabase();
      } catch (e) {
        // Ignore
      }
    }
  });

  describe('initDatabase', () => {
    const testIf = (name, fn) => {
      if (isDatabaseAvailable) {
        it(name, fn);
      } else {
        it.skip(name, fn);
      }
    };

    testIf('should create database connection', async () => {
      await initDatabase(':memory:');
      const database = getDatabase();
      expect(database).toBeDefined();
    });

    testIf('should enable foreign keys', async () => {
      await initDatabase(':memory:');
      const database = getDatabase();
      const result = database.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    });
  });

  describe('Helper functions', () => {
    const testIf = (name, fn) => {
      if (isDatabaseAvailable) {
        it(name, fn);
      } else {
        it.skip(name, fn);
      }
    };

    beforeEach(async () => {
      if (isDatabaseAvailable) {
        await initDatabase(':memory:');
      }
    });

    afterEach(async () => {
      if (isDatabaseAvailable) {
        await closeDatabase();
      }
    });

    testIf('should run SQL statements', async () => {
      run('CREATE TABLE test_run (id INTEGER PRIMARY KEY, name TEXT)');
      const result = run('INSERT INTO test_run (name) VALUES (?)', ['test']);
      expect(result.changes).toBe(1);
    });

    testIf('should get single row', async () => {
      run('CREATE TABLE test_get (id INTEGER PRIMARY KEY, name TEXT)');
      run('INSERT INTO test_get (name) VALUES (?)', ['test']);

      const row = get('SELECT * FROM test_get WHERE name = ?', ['test']);
      expect(row).toBeDefined();
      expect(row.name).toBe('test');
    });

    testIf('should get all rows', async () => {
      run('CREATE TABLE test_all (id INTEGER PRIMARY KEY, name TEXT)');
      run('INSERT INTO test_all (name) VALUES (?)', ['test1']);
      run('INSERT INTO test_all (name) VALUES (?)', ['test2']);

      const rows = all('SELECT * FROM test_all ORDER BY name');
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('test1');
      expect(rows[1].name).toBe('test2');
    });

    testIf('should run transactions', async () => {
      run('CREATE TABLE test_txn (id INTEGER PRIMARY KEY, value INTEGER)');

      const insertMultiple = transaction((values) => {
        for (const v of values) {
          run('INSERT INTO test_txn (value) VALUES (?)', [v]);
        }
      });

      insertMultiple([1, 2, 3]);

      const rows = all('SELECT * FROM test_txn');
      expect(rows).toHaveLength(3);
    });
  });

  describe('Error handling', () => {
    const testIf = (name, fn) => {
      if (isDatabaseAvailable) {
        it(name, fn);
      } else {
        it.skip(name, fn);
      }
    };

    testIf('should throw error if getDatabase called before init', async () => {
      await closeDatabase();
      expect(() => getDatabase()).toThrow('Database not initialized');
    });
  });
});

describe('Migrations Integration', () => {
  let migrations;
  let MigrationManager;
  let initDatabase, getDatabase, closeDatabase;
  let isDatabaseAvailable = false;

  beforeAll(async () => {
    try {
      const dbModule = await import('../../../src/memory/database.js');
      const migModule = await import('../../../src/memory/migrations.js');

      initDatabase = dbModule.initDatabase;
      getDatabase = dbModule.getDatabase;
      closeDatabase = dbModule.closeDatabase;
      MigrationManager = migModule.MigrationManager;
      migrations = migModule.migrations;

      // Test if database actually works
      const testDb = initDatabase(':memory:');
      if (testDb) {
        testDb.close();
        isDatabaseAvailable = true;
      }
    } catch (e) {
      console.log('Migration tests skipped: better-sqlite3 not available');
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

  describe('MigrationManager', () => {
    let migrationManager;

    beforeEach(async () => {
      if (isDatabaseAvailable) {
        await initDatabase(':memory:');
        migrationManager = new MigrationManager(getDatabase());
      }
    });

    afterEach(async () => {
      if (isDatabaseAvailable) {
        await closeDatabase();
      }
    });

    testIf('should start at version 0', async () => {
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe(0);
    });

    testIf('should run all migrations', async () => {
      await migrationManager.migrate();

      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe(5);
    });

    testIf('should create skills_metadata table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills_metadata'").get();
      expect(result).toBeDefined();
    });

    testIf('should create facts table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'").get();
      expect(result).toBeDefined();
    });

    testIf('should create executions table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='executions'").get();
      expect(result).toBeDefined();
    });

    testIf('should create checkpoints table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'").get();
      expect(result).toBeDefined();
    });

    testIf('should create death_records table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='death_records'").get();
      expect(result).toBeDefined();
    });

    testIf('should create bot_state table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bot_state'").get();
      expect(result).toBeDefined();
    });

    testIf('should create community_peers table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='community_peers'").get();
      expect(result).toBeDefined();
    });

    testIf('should create shared_facts table after migration', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_facts'").get();
      expect(result).toBeDefined();
    });

    testIf('should not run migrations twice', async () => {
      await migrationManager.migrate();
      const version1 = await migrationManager.getCurrentVersion();

      await migrationManager.migrate();
      const version2 = await migrationManager.getCurrentVersion();

      expect(version1).toBe(version2);
    });

    testIf('should rollback to previous version', async () => {
      await migrationManager.migrate();
      expect(await migrationManager.getCurrentVersion()).toBe(5);

      await migrationManager.rollback(3);
      expect(await migrationManager.getCurrentVersion()).toBe(3);
    });

    testIf('should throw error when rollback to higher version', async () => {
      await migrationManager.migrate();

      await expect(migrationManager.rollback(10)).rejects.toThrow('Target version must be less than current');
    });

    testIf('should create indexes on facts table', async () => {
      await migrationManager.migrate();
      const db = getDatabase();

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='facts'").all();
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_facts_type');
      expect(indexNames).toContain('idx_facts_key');
    });
  });
});