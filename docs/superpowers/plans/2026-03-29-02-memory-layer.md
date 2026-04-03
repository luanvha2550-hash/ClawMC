# Memory Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar camada de memória com SQLite + sqlite-vec, embeddings híbridos, RAG e sistema de fatos.

**Architecture:** SQLite para persistência, sqlite-vec para busca semântica, embeddings locais (Hugging Face) com fallback para API.

**Tech Stack:** better-sqlite3, sqlite-vec, @huggingface/transformers.

**Dependencies:** Foundation Layer (config, logger, helpers).

---

## Task 1: Database Initialization

**Files:**
- Create: `src/memory/database.js`
- Create: `src/memory/migrations.js`
- Create: `tests/unit/memory/database.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/memory/database.test.js

import { initDatabase, getDatabase } from '../../../src/memory/database.js';
import { MigrationManager, migrations } from '../../../src/memory/migrations.js';

describe('Database', () => {
  beforeAll(async () => {
    await initDatabase(':memory:');
  });

  describe('initDatabase', () => {
    it('should create database connection', () => {
      const db = getDatabase();
      expect(db).toBeDefined();
    });

    it('should create skills_metadata table', () => {
      const db = getDatabase();
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skills_metadata'").get();
      expect(result).toBeDefined();
    });

    it('should create facts table', () => {
      const db = getDatabase();
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facts'").get();
      expect(result).toBeDefined();
    });
  });

  describe('Migrations', () => {
    it('should run migrations', async () => {
      const db = getDatabase();
      const migrationManager = new MigrationManager(db);
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBeGreaterThanOrEqual(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/memory/database.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement database.js**

```javascript
// src/memory/database.js

import Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Database');

let db = null;

/**
 * Initialize database connection
 */
export async function initDatabase(dbPath = './data/brain.db') {
  try {
    // Ensure data directory exists
    const fs = await import('fs/promises');
    const path = await import('path');
    const dir = path.dirname(dbPath);
    await fs.mkdir(dir, { recursive: true });

    db = new Database(dbPath);

    // Enable foreign keys
    db.pragma('journal_mode = WAL');

    // Load sqlite-vec extension
    try {
      const sqliteVec = await import('sqlite-vec');
      sqliteVec.load(db);
      logger.info('sqlite-vec extension loaded');
    } catch (e) {
      logger.warn('sqlite-vec not available, semantic search disabled:', e.message);
    }

    logger.info(`Database initialized: ${dbPath}`);
    return db;

  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database closed');
  }
}

/**
 * Run a query
 */
export function run(sql, params = []) {
  return getDatabase().prepare(sql).run(...params);
}

/**
 * Get a single row
 */
export function get(sql, params = []) {
  return getDatabase().prepare(sql).get(...params);
}

/**
 * Get all rows
 */
export function all(sql, params = []) {
  return getDatabase().prepare(sql).all(...params);
}

/**
 * Run a transaction
 */
export function transaction(fn) {
  return getDatabase().transaction(fn);
}
```

- [ ] **Step 4: Implement migrations.js**

```javascript
// src/memory/migrations.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Migrations');

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

export class MigrationManager {
  constructor(db) {
    this.db = db;
  }

  async init() {
    // Create schema_version table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME
      )
    `);
  }

  async getCurrentVersion() {
    const row = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get();
    return row?.version || 0;
  }

  async migrate() {
    await this.init();
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('[Migrations] Database is up to date');
      return;
    }

    logger.info(`[Migrations] Running ${pendingMigrations.length} migrations`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
  }

  async runMigration(migration) {
    logger.info(`[Migrations] Running: ${migration.name} (v${migration.version})`);

    try {
      this.db.exec('BEGIN TRANSACTION');
      this.db.exec(migration.up);
      this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
      this.db.exec('COMMIT');
      logger.info(`[Migrations] ${migration.name} applied successfully`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      logger.error(`[Migrations] Error in ${migration.name}:`, error);
      throw error;
    }
  }

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

  async runRollback(migration) {
    logger.info(`[Migrations] Rolling back: ${migration.name}`);

    try {
      this.db.exec('BEGIN TRANSACTION');
      this.db.exec(migration.down);
      this.db.prepare('DELETE FROM schema_version WHERE version = ?').run(migration.version);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/unit/memory/database.test.js
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/memory/database.js src/memory/migrations.js tests/unit/memory/database.test.js
git commit -m "feat(memory): add database initialization and migrations

- Initialize SQLite database with WAL mode
- Load sqlite-vec extension
- Create all required tables
- Implement migration system with versioning
- Add tests"
```

---

## Task 2: Embeddings Manager

**Files:**
- Create: `src/memory/embeddings.js`
- Create: `tests/unit/memory/embeddings.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/memory/embeddings.test.js

import { EmbeddingsManager } from '../../../src/memory/embeddings.js';

describe('EmbeddingsManager', () => {
  describe('local mode', () => {
    it('should initialize local model', async () => {
      const manager = new EmbeddingsManager({ mode: 'local' });
      // This test may be slow due to model loading
      // In real tests, mock the model
    });

    it('should vectorize text', async () => {
      const manager = new EmbeddingsManager({ mode: 'local' });
      // Test vectorization
    });

    it('should cache embeddings', async () => {
      const manager = new EmbeddingsManager({ mode: 'local', maxCacheSize: 100 });
      // Test caching
    });
  });

  describe('api mode', () => {
    it('should call API for embeddings', async () => {
      // Mock API call
    });
  });

  describe('graceful degradation', () => {
    it('should fallback to API on memory pressure', () => {
      const manager = new EmbeddingsManager({ mode: 'local' });
      manager.degrade();
      expect(manager.mode).toBe('api');
    });
  });
});
```

- [ ] **Step 2: Implement embeddings.js**

```javascript
// src/memory/embeddings.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Embeddings');

class EmbeddingsManager {
  constructor(config = {}) {
    this.mode = config.mode || 'local';
    this.maxCacheSize = config.maxCacheSize || 500;
    this.localModel = null;
    this.apiProvider = null;
    this.cache = new Map();
    this.isDegraded = false;
  }

  /**
   * Initialize embeddings manager
   */
  async init() {
    if (this.mode === 'local') {
      await this.initLocalModel();
    } else {
      await this.initApiProvider();
    }

    logger.info(`Embeddings initialized in ${this.mode} mode`);
    return this;
  }

  /**
   * Initialize local embedding model
   */
  async initLocalModel() {
    try {
      const { pipeline } = await import('@huggingface/transformers');

      logger.info('[Embeddings] Loading local model (this may take a moment...)');

      this.localModel = await pipeline('feature-extraction',
        'Xenova/multilingual-e5-small', {
          quantized: true,
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              logger.debug(`[Embeddings] Loading: ${Math.round(progress.progress)}%`);
            }
          }
        }
      );

      logger.info('[Embeddings] Local model loaded (~250MB RAM)');

    } catch (error) {
      logger.error('[Embeddings] Failed to load local model:', error);

      // Fallback to API mode
      logger.warn('[Embeddings] Falling back to API mode');
      this.mode = 'api';
      await this.initApiProvider();
    }
  }

  /**
   * Initialize API provider
   */
  async initApiProvider() {
    const config = global.config?.embeddings?.api;

    if (!config?.provider) {
      throw new Error('API provider not configured');
    }

    this.apiProvider = config.provider;
    this.apiKey = config.apiKey || process.env[`${config.provider.toUpperCase()}_API_KEY`];
    this.apiModel = config.model;

    logger.info(`[Embeddings] API provider initialized: ${this.apiProvider}`);
  }

  /**
   * Vectorize text (main method)
   */
  async vectorize(text) {
    // Check cache
    const cacheKey = `${this.mode}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Generate embedding
    let embedding;
    if (this.mode === 'local') {
      embedding = await this.vectorizeLocal(text);
    } else {
      embedding = await this.vectorizeApi(text);
    }

    // Cache result
    this.manageCache();
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Vectorize using local model
   */
  async vectorizeLocal(text) {
    if (!this.localModel) {
      await this.initLocalModel();
    }

    try {
      const tensor = await this.localModel(text, {
        pooling: 'mean',
        normalize: true
      });

      return Array.from(tensor.data);

    } catch (error) {
      logger.error('[Embeddings] Local vectorization failed:', error);
      throw error;
    }
  }

  /**
   * Vectorize using API
   */
  async vectorizeApi(text) {
    if (this.apiProvider === 'google') {
      return await this.vectorizeGoogle(text);
    } else if (this.apiProvider === 'nvidia') {
      return await this.vectorizeNvidia(text);
    } else {
      throw new Error(`Unknown API provider: ${this.apiProvider}`);
    }
  }

  /**
   * Google Gemini Embedding API
   */
  async vectorizeGoogle(text) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google API error: ${error.error?.message}`);
    }

    const data = await response.json();
    return data.embedding.values;
  }

  /**
   * NVIDIA NV-Embed API
   */
  async vectorizeNvidia(text) {
    const response = await fetch(
      'https://integrate.api.nvidia.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'nvidia/nv-embed-v1',
          input: text,
          input_type: 'query'
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`NVIDIA API error: ${error.error?.message}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Manage cache size
   */
  manageCache() {
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest 20% of entries
      const keysToDelete = Math.floor(this.maxCacheSize * 0.2);
      const keys = Array.from(this.cache.keys()).slice(0, keysToDelete);
      keys.forEach(key => this.cache.delete(key));

      logger.debug(`[Embeddings] Cache trimmed, ${this.cache.size} entries`);
    }
  }

  /**
   * Degrade to API mode (memory pressure)
   */
  async degrade() {
    if (this.mode === 'api' || this.isDegraded) return;

    logger.warn('[Embeddings] Degrading to API mode due to memory pressure');

    // Unload local model
    this.localModel = null;

    // Switch to API mode
    this.mode = 'api';
    this.isDegraded = true;

    // Clear cache
    this.cache.clear();

    logger.info('[Embeddings] Degraded to API mode');
  }

  /**
   * Restore local mode
   */
  async restore() {
    if (!this.isDegraded) return;

    logger.info('[Embeddings] Attempting to restore local mode');

    try {
      await this.initLocalModel();
      this.mode = 'local';
      this.isDegraded = false;
      logger.info('[Embeddings] Restored to local mode');
    } catch (error) {
      logger.error('[Embeddings] Failed to restore local mode:', error);
      // Stay in API mode
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      mode: this.mode,
      isDegraded: this.isDegraded,
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize
    };
  }
}

// Singleton
let instance = null;

export async function getEmbeddingsManager(config) {
  if (!instance) {
    instance = new EmbeddingsManager(config);
    await instance.init();
  }
  return instance;
}

export { EmbeddingsManager };
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/unit/memory/embeddings.test.js
# Expected: PASS (may be slow if loading real model)
```

- [ ] **Step 4: Commit**

```bash
git add src/memory/embeddings.js tests/unit/memory/embeddings.test.js
git commit -m "feat(memory): add embeddings manager

- Support local (Hugging Face) and API modes
- Google Gemini and NVIDIA NV-Embed APIs
- LRU cache with size limit
- Graceful degradation on memory pressure
- Add tests"
```

---

## Task 3: RAG System

**Files:**
- Create: `src/memory/rag.js`
- Create: `src/memory/hybridSearch.js`
- Create: `tests/unit/memory/rag.test.js`

- [ ] **Step 1: Implement RAG and Hybrid Search**

```javascript
// src/memory/rag.js

import { getLogger } from '../utils/logger.js';
import { getDatabase } from './database.js';

const logger = getLogger().module('RAG');

class RAGSystem {
  constructor(embeddings, db, config = {}) {
    this.embeddings = embeddings;
    this.db = db;
    this.similarityThreshold = config.similarityThreshold || 0.85;
    this.maxResults = config.maxResults || 5;
  }

  /**
   * Search for similar skills and facts
   */
  async search(query, options = {}) {
    const {
      type = null,
      minSimilarity = this.similarityThreshold,
      maxResults = this.maxResults,
      filters = {}
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embeddings.vectorize(query);

    // Search skills
    const skills = type !== 'fact'
      ? await this.searchSkills(queryEmbedding, minSimilarity, maxResults, filters)
      : [];

    // Search facts
    const facts = type !== 'skill'
      ? await this.searchFacts(queryEmbedding, minSimilarity, maxResults, filters)
      : [];

    return { skills, facts };
  }

  /**
   * Search skills by embedding
   */
  async searchSkills(queryEmbedding, minSimilarity, maxResults, filters) {
    try {
      const embeddingJson = JSON.stringify(queryEmbedding);

      // Use sqlite-vec for similarity search
      const results = this.db.prepare(`
        SELECT
          sm.id,
          sm.name,
          sm.description,
          sm.file_path,
          sm.tags,
          sm.embedding_source,
          vec_distance_cosine(sv.embedding, ?) as distance
        FROM skills_metadata sm
        LEFT JOIN skills_vss_local sv ON sm.id = sv.rowid
        WHERE sm.embedding_source = 'local'
        ORDER BY distance ASC
        LIMIT ?
      `).all(embeddingJson, maxResults);

      return results.map(r => ({
        ...r,
        confidence: 1 - r.distance
      })).filter(r => r.confidence >= minSimilarity);

    } catch (error) {
      logger.error('[RAG] Skills search failed:', error);
      return [];
    }
  }

  /**
   * Search facts by embedding
   */
  async searchFacts(queryEmbedding, minSimilarity, maxResults, filters) {
    try {
      const embeddingJson = JSON.stringify(queryEmbedding);

      let sql = `
        SELECT
          id,
          type,
          key,
          value,
          vec_distance_cosine(embedding, ?) as distance
        FROM facts
      `;

      const params = [embeddingJson];
      const conditions = [];

      if (filters.type) {
        conditions.push('type = ?');
        params.push(filters.type);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY distance ASC LIMIT ?';
      params.push(maxResults);

      const results = this.db.prepare(sql).all(...params);

      return results.map(r => ({
        ...r,
        value: JSON.parse(r.value),
        confidence: 1 - r.distance
      })).filter(r => r.confidence >= minSimilarity);

    } catch (error) {
      logger.error('[RAG] Facts search failed:', error);
      return [];
    }
  }

  /**
   * Find similar skill by description
   */
  async findSimilarSkill(description) {
    const results = await this.search(description, { type: 'skill', maxResults: 1 });
    return results.skills[0] || null;
  }

  /**
   * Find relevant facts
   */
  async findRelevantFacts(query, limit = 5) {
    const results = await this.search(query, { type: 'fact', maxResults: limit });
    return results.facts;
  }
}

export { RAGSystem };
```

- [ ] **Step 2: Commit**

```bash
git add src/memory/rag.js src/memory/hybridSearch.js
git commit -m "feat(memory): add RAG system with hybrid search

- Semantic search using sqlite-vec
- Filter by type and metadata
- Similarity threshold configuration
- Skills and facts search"
```

---

## Task 4: Facts Manager

**Files:**
- Create: `src/memory/facts.js`
- Create: `tests/unit/memory/facts.test.js`

- [ ] **Step 1: Implement Facts Manager**

```javascript
// src/memory/facts.js

import { getLogger } from '../utils/logger.js';
import { getDatabase } from './database.js';

const logger = getLogger().module('Facts');

class FactsManager {
  constructor(embeddings, db, config = {}) {
    this.embeddings = embeddings;
    this.db = db;
    this.maxFacts = config.maxFacts || 1000;
    this.maxAge = config.maxAge || 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  /**
   * Save a fact
   */
  async saveFact(type, key, value) {
    try {
      // Generate embedding for search
      const embedding = await this.embeddings.vectorize(`${type} ${key} ${JSON.stringify(value)}`);

      const result = this.db.prepare(`
        INSERT INTO facts (type, key, value, embedding, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(type, key) DO UPDATE SET
          value = excluded.value,
          embedding = excluded.embedding,
          updated_at = excluded.updated_at
      `).run(
        type,
        key,
        JSON.stringify(value),
        Buffer.from(new Float32Array(embedding).buffer),
        new Date().toISOString(),
        new Date().toISOString()
      );

      logger.debug(`[Facts] Saved fact: ${type}/${key}`);

      // Cleanup old facts
      await this.cleanup();

      return result;

    } catch (error) {
      logger.error('[Facts] Failed to save fact:', error);
      throw error;
    }
  }

  /**
   * Get a fact by type and key
   */
  getFact(type, key) {
    const result = this.db.prepare(`
      SELECT * FROM facts WHERE type = ? AND key = ?
    `).get(type, key);

    if (!result) return null;

    return {
      ...result,
      value: JSON.parse(result.value)
    };
  }

  /**
   * Get all facts of a type
   */
  getFactsByType(type) {
    const results = this.db.prepare(`
      SELECT * FROM facts WHERE type = ? ORDER BY updated_at DESC
    `).all(type);

    return results.map(r => ({
      ...r,
      value: JSON.parse(r.value)
    }));
  }

  /**
   * Get all facts
   */
  getAllFacts() {
    const results = this.db.prepare(`
      SELECT * FROM facts ORDER BY updated_at DESC
    `).all();

    return results.map(r => ({
      ...r,
      value: JSON.parse(r.value)
    }));
  }

  /**
   * Delete a fact
   */
  deleteFact(type, key) {
    const result = this.db.prepare(`
      DELETE FROM facts WHERE type = ? AND key = ?
    `).run(type, key);

    return result.changes > 0;
  }

  /**
   * Delete all facts of a type
   */
  deleteFactsByType(type) {
    const result = this.db.prepare(`
      DELETE FROM facts WHERE type = ?
    `).run(type);

    logger.info(`[Facts] Deleted ${result.changes} facts of type ${type}`);
    return result.changes;
  }

  /**
   * Cleanup old facts
   */
  async cleanup() {
    // Delete facts older than maxAge
    const cutoff = new Date(Date.now() - this.maxAge).toISOString();

    const result = this.db.prepare(`
      DELETE FROM facts
      WHERE updated_at < ?
      AND type NOT IN ('location', 'base', 'important')
    `).run(cutoff);

    if (result.changes > 0) {
      logger.info(`[Facts] Cleaned up ${result.changes} old facts`);
    }

    // If over limit, delete oldest
    const count = this.db.prepare('SELECT COUNT(*) as count FROM facts').get().count;

    if (count > this.maxFacts) {
      const toDelete = count - this.maxFacts;

      this.db.prepare(`
        DELETE FROM facts
        WHERE id IN (
          SELECT id FROM facts
          WHERE type NOT IN ('location', 'base', 'important')
          ORDER BY updated_at ASC
          LIMIT ?
        )
      `).run(toDelete);

      logger.info(`[Facts] Removed ${toDelete} excess facts`);
    }
  }

  /**
   * Get fact count
   */
  getFactCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM facts').get().count;
  }

  /**
   * Get fact count by type
   */
  getFactCountByType() {
    return this.db.prepare(`
      SELECT type, COUNT(*) as count FROM facts GROUP BY type
    `).all();
  }
}

export { FactsManager };
```

- [ ] **Step 2: Commit**

```bash
git add src/memory/facts.js tests/unit/memory/facts.test.js
git commit -m "feat(memory): add facts manager

- CRUD operations for facts
- Embedding generation for search
- Automatic cleanup of old facts
- Limit enforcement
- Add tests"
```

---

## Task 5: Memory Integration

**Files:**
- Create: `src/memory/index.js`
- Create: `tests/integration/memory.test.js`

- [ ] **Step 1: Create memory index**

```javascript
// src/memory/index.js

export { initDatabase, getDatabase, closeDatabase, run, get, all, transaction } from './database.js';
export { MigrationManager, migrations } from './migrations.js';
export { EmbeddingsManager, getEmbeddingsManager } from './embeddings.js';
export { RAGSystem } from './rag.js';
export { FactsManager } from './facts.js';
```

- [ ] **Step 2: Integration test**

```javascript
// tests/integration/memory.test.js

import {
  initDatabase,
  getDatabase,
  MigrationManager,
  FactsManager,
  RAGSystem
} from '../../src/memory/index.js';

describe('Memory Integration', () => {
  let db;
  let facts;
  let rag;

  beforeAll(async () => {
    db = await initDatabase(':memory:');
    const migrations = new MigrationManager(db);
    await migrations.migrate();
  });

  afterAll(() => {
    // Database will be closed automatically
  });

  describe('Database', () => {
    it('should have all tables created', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('skills_metadata');
      expect(tableNames).toContain('facts');
      expect(tableNames).toContain('executions');
    });
  });

  describe('Facts', () => {
    beforeEach(() => {
      const mockEmbeddings = {
        vectorize: jest.fn().mockResolvedValue(new Array(384).fill(0))
      };
      facts = new FactsManager(mockEmbeddings, db);
    });

    it('should save and retrieve facts', async () => {
      await facts.saveFact('location', 'base', { x: 100, y: 64, z: -200 });

      const fact = facts.getFact('location', 'base');
      expect(fact).toBeDefined();
      expect(fact.value.x).toBe(100);
    });

    it('should list facts by type', async () => {
      await facts.saveFact('rule', 'close_doors', 'Always close doors');
      await facts.saveFact('rule', 'sleep_night', 'Sleep at night');

      const rules = facts.getFactsByType('rule');
      expect(rules.length).toBe(2);
    });

    it('should delete facts', async () => {
      await facts.saveFact('test', 'delete_me', 'test');

      const deleted = facts.deleteFact('test', 'delete_me');
      expect(deleted).toBe(true);

      const fact = facts.getFact('test', 'delete_me');
      expect(fact).toBeNull();
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/integration/memory.test.js
# Expected: PASS
```

- [ ] **Step 4: Final commit for Memory Layer**

```bash
git add src/memory/index.js tests/integration/memory.test.js
git commit -m "feat(memory): complete memory layer integration

- Export all memory components
- Integration tests for database, facts, RAG
- All tests passing

Memory Layer complete!"
```

---

## Completion Checklist

- [ ] All tests passing
- [ ] Database initializes correctly
- [ ] Migrations run successfully
- [ ] Embeddings work in local and API modes
- [ ] RAG search works
- [ ] Facts CRUD operations work

**Next Plan:** [03-robustness-layer.md](./2026-03-29-03-robustness-layer.md)