/**
 * Database migrations for ClawMC
 * Handles schema versioning and migrations
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Migrations');

/**
 * Array of migration definitions
 * Each migration has version, name, up SQL, and down SQL
 */
export const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS skills_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        file_path TEXT,
        embedding_source TEXT DEFAULT 'local',
        parameters TEXT,
        returns TEXT,
        examples TEXT,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(type, key)
      );

      CREATE TABLE IF NOT EXISTS executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT,
        skill_used TEXT,
        success BOOLEAN,
        duration_ms INTEGER,
        error TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_facts_type ON facts(type);
      CREATE INDEX IF NOT EXISTS idx_facts_key ON facts(key);
      CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS schema_version;
      DROP TABLE IF EXISTS skills_metadata;
      DROP TABLE IF EXISTS facts;
      DROP TABLE IF EXISTS executions;
    `
  },
  {
    version: 2,
    name: 'add_checkpoints_table',
    up: `
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        data TEXT,
        task_type TEXT,
        task_progress REAL,
        position TEXT,
        inventory TEXT,
        recovered BOOLEAN DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON checkpoints(type);
    `,
    down: `
      DROP TABLE IF EXISTS checkpoints;
    `
  },
  {
    version: 3,
    name: 'add_death_records',
    up: `
      CREATE TABLE IF NOT EXISTS death_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        position TEXT,
        cause TEXT,
        inventory TEXT,
        dimension TEXT,
        recovery_attempts INTEGER DEFAULT 0,
        recovered BOOLEAN DEFAULT 0,
        recovered_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_death_records_timestamp ON death_records(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS death_records;
    `
  },
  {
    version: 4,
    name: 'add_bot_state',
    up: `
      CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS bot_state;
    `
  },
  {
    version: 5,
    name: 'add_community_tables',
    up: `
      CREATE TABLE IF NOT EXISTS community_peers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        owner TEXT,
        role TEXT,
        capabilities TEXT,
        position TEXT,
        last_seen DATETIME
      );

      CREATE TABLE IF NOT EXISTS shared_facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        source_peer TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS community_peers;
      DROP TABLE IF EXISTS shared_facts;
    `
  }
];

/**
 * Migration Manager class
 * Handles running and rolling back migrations
 */
export class MigrationManager {
  /**
   * Create a MigrationManager
   * @param {Database} db - Database instance
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Initialize schema_version table if not exists
   */
  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME
      )
    `);
  }

  /**
   * Get current schema version
   * @returns {Promise<number>} Current version (0 if no migrations applied)
   */
  async getCurrentVersion() {
    await this.init();
    const row = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    return row?.version || 0;
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    await this.init();
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('Database is up to date');
      return;
    }

    logger.info(`Running ${pendingMigrations.length} migrations`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
  }

  /**
   * Run a single migration
   * @param {Object} migration - Migration object
   */
  async runMigration(migration) {
    logger.info(`Running: ${migration.name} (v${migration.version})`);

    try {
      this.db.exec('BEGIN TRANSACTION');
      this.db.exec(migration.up);
      this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
      this.db.exec('COMMIT');
      logger.info(`${migration.name} applied successfully`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      logger.error(`Error in ${migration.name}:`, error);
      throw error;
    }
  }

  /**
   * Rollback to a target version
   * @param {number} targetVersion - Version to rollback to
   */
  async rollback(targetVersion) {
    const currentVersion = await this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      throw new Error('Target version must be less than current');
    }

    const rollbackMigrations = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    for (const migration of rollbackMigrations) {
      await this.runRollback(migration);
    }
  }

  /**
   * Run a single rollback
   * @param {Object} migration - Migration object
   */
  async runRollback(migration) {
    logger.info(`Rolling back: ${migration.name}`);

    try {
      this.db.exec('BEGIN TRANSACTION');
      this.db.exec(migration.down);
      this.db.prepare('DELETE FROM schema_version WHERE version = ?').run(migration.version);
      this.db.exec('COMMIT');
      logger.info(`${migration.name} rolled back successfully`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      logger.error(`Error rolling back ${migration.name}:`, error);
      throw error;
    }
  }
}