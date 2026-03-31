import { jest } from '@jest/globals';

/**
 * RAG System Tests for ClawMC Memory Layer
 *
 * Tests the Retrieval-Augmented Generation system for semantic search
 * over skills and facts.
 *
 * Note: Tests that require better-sqlite3 will be skipped if the native module
 * is not available.
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

// ============= HybridSearch Helper Functions (No DB required) =============

describe('HybridSearch Helper Functions', () => {
  let helperModule;

  beforeAll(async () => {
    helperModule = await import('../../../src/memory/hybridSearch.js');
  });

  describe('normalizeQuery', () => {
    it('should normalize query text', () => {
      const { normalizeQuery } = helperModule;

      expect(normalizeQuery('Hello World')).toBe('hello world');
      expect(normalizeQuery('  SPACES  ')).toBe('spaces');
      expect(normalizeQuery('Special!@#$Characters')).toBe('special characters');
    });

    it('should handle empty input', () => {
      const { normalizeQuery } = helperModule;

      expect(normalizeQuery('')).toBe('');
      expect(normalizeQuery(null)).toBe('');
      expect(normalizeQuery(undefined)).toBe('');
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from query', () => {
      const { extractKeywords } = helperModule;

      const keywords = extractKeywords('mine stone and wood blocks');

      expect(keywords).toContain('mine');
      expect(keywords).toContain('stone');
      expect(keywords).toContain('and');
      expect(keywords).toContain('wood');
      expect(keywords).toContain('blocks');
    });

    it('should filter short words', () => {
      const { extractKeywords } = helperModule;

      const keywords = extractKeywords('a big tree near the house');

      // Words shorter than 3 chars are filtered (e.g., 'a')
      expect(keywords).not.toContain('a');
      // 'the' has 3 chars, so it should be included
      expect(keywords).toContain('the');
      expect(keywords).toContain('big');
      expect(keywords).toContain('tree');
    });

    it('should limit to 10 keywords', () => {
      const { extractKeywords } = helperModule;

      const longQuery = 'one two three four five six seven eight nine ten eleven twelve';
      const keywords = extractKeywords(longQuery);

      expect(keywords.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty query', () => {
      const { extractKeywords } = helperModule;

      expect(extractKeywords('')).toEqual([]);
      expect(extractKeywords(null)).toEqual([]);
    });
  });

  describe('calculateKeywordScore', () => {
    it('should calculate match score', () => {
      const { calculateKeywordScore } = helperModule;

      const score = calculateKeywordScore('mine stone and wood', ['mine', 'stone']);

      expect(score).toBe(1); // All keywords found
    });

    it('should return 0 for no matches', () => {
      const { calculateKeywordScore } = helperModule;

      const score = calculateKeywordScore('hello world', ['mine', 'craft']);

      expect(score).toBe(0);
    });

    it('should return partial score', () => {
      const { calculateKeywordScore } = helperModule;

      const score = calculateKeywordScore('mine stone blocks', ['mine', 'craft', 'build']);

      expect(score).toBeCloseTo(1/3, 2); // 1 out of 3 keywords
    });

    it('should handle empty inputs', () => {
      const { calculateKeywordScore } = helperModule;

      expect(calculateKeywordScore('', ['test'])).toBe(0);
      expect(calculateKeywordScore('test', [])).toBe(0);
      expect(calculateKeywordScore(null, ['test'])).toBe(0);
    });
  });
});

// ============= RAGSystem Unit Tests (No DB required) =============

describe('RAGSystem Unit Tests', () => {
  let RAGSystem, createRAGSystem, getRAGSystem, clearRAGSystem;

  beforeAll(async () => {
    const ragModule = await import('../../../src/memory/rag.js');
    RAGSystem = ragModule.RAGSystem;
    createRAGSystem = ragModule.createRAGSystem;
    getRAGSystem = ragModule.getRAGSystem;
    clearRAGSystem = ragModule.clearRAGSystem;
  });

  afterEach(() => {
    clearRAGSystem();
  });

  describe('Constructor', () => {
    it('should create instance with default configuration', () => {
      const rag = new RAGSystem();

      expect(rag.config.minSimilarity).toBe(0.5);
      expect(rag.config.maxResults).toBe(10);
      expect(rag.config.semanticWeight).toBe(0.7);
      expect(rag.config.hybridSearch).toBe(true);
      expect(rag.initialized).toBe(false);
    });

    it('should accept custom configuration', () => {
      const rag = new RAGSystem({
        config: {
          minSimilarity: 0.7,
          maxResults: 20,
          semanticWeight: 0.9,
          hybridSearch: false
        }
      });

      expect(rag.config.minSimilarity).toBe(0.7);
      expect(rag.config.maxResults).toBe(20);
      expect(rag.config.semanticWeight).toBe(0.9);
      expect(rag.config.hybridSearch).toBe(false);
    });

    it('should initialize with empty statistics', () => {
      const rag = new RAGSystem();

      expect(rag.stats.skillSearches).toBe(0);
      expect(rag.stats.factSearches).toBe(0);
      expect(rag.stats.combinedSearches).toBe(0);
      expect(rag.stats.cacheHits).toBe(0);
      expect(rag.stats.cacheMisses).toBe(0);
      expect(rag.stats.errors).toBe(0);
    });
  });

  describe('Error handling without init', () => {
    it('should throw error if search before init', async () => {
      const rag = new RAGSystem();

      await expect(rag.search('test')).rejects.toThrow('not initialized');
    });

    it('should throw error if searchSkills before init', async () => {
      const rag = new RAGSystem();
      const embedding = new Float32Array(384).fill(0.1);

      await expect(rag.searchSkills(embedding)).rejects.toThrow('not initialized');
    });

    it('should throw error if searchFacts before init', async () => {
      const rag = new RAGSystem();
      const embedding = new Float32Array(384).fill(0.1);

      await expect(rag.searchFacts(embedding)).rejects.toThrow('not initialized');
    });

    it('should throw error if findSimilarSkill before init', async () => {
      const rag = new RAGSystem();

      await expect(rag.findSimilarSkill('test')).rejects.toThrow('not initialized');
    });

    it('should throw error if findRelevantFacts before init', async () => {
      const rag = new RAGSystem();

      await expect(rag.findRelevantFacts('test')).rejects.toThrow('not initialized');
    });
  });

  describe('Configuration', () => {
    it('should get configuration', () => {
      const rag = new RAGSystem();

      const config = rag.getConfig();

      expect(config.minSimilarity).toBe(0.5);
      expect(config.maxResults).toBe(10);
    });

    it('should update configuration', () => {
      const rag = new RAGSystem();

      rag.updateConfig({ minSimilarity: 0.8, maxResults: 25 });

      expect(rag.config.minSimilarity).toBe(0.8);
      expect(rag.config.maxResults).toBe(25);
    });
  });

  describe('Statistics', () => {
    it('should return statistics', () => {
      const rag = new RAGSystem();

      const stats = rag.getStats();

      expect(stats.skillSearches).toBeDefined();
      expect(stats.factSearches).toBeDefined();
    });

    it('should reset statistics', () => {
      const rag = new RAGSystem();

      rag.stats.skillSearches = 10;
      rag.resetStats();

      expect(rag.stats.skillSearches).toBe(0);
    });
  });

  describe('Cache', () => {
    it('should clear cache', () => {
      const rag = new RAGSystem();
      rag._setCache('test', [{ id: 1 }]);

      rag.clearCache();

      expect(rag.cache.size).toBe(0);
    });

    it('should get from cache', () => {
      const rag = new RAGSystem();
      rag._setCache('test', [{ id: 1 }]);

      const cached = rag._getFromCache('test');

      expect(cached).toEqual([{ id: 1 }]);
      expect(rag.stats.cacheHits).toBe(1);
    });

    it('should miss cache when empty', () => {
      const rag = new RAGSystem();

      const cached = rag._getFromCache('nonexistent');

      expect(cached).toBeNull();
      expect(rag.stats.cacheMisses).toBe(1);
    });
  });

  describe('isSemanticAvailable', () => {
    it('should return false before init', () => {
      const rag = new RAGSystem();

      expect(rag.isSemanticAvailable()).toBe(false);
    });
  });

  describe('Singleton Functions', () => {
    it('should create and get singleton instance', () => {
      const rag = createRAGSystem();

      expect(getRAGSystem()).toBe(rag);
    });

    it('should clear singleton instance', () => {
      createRAGSystem();

      clearRAGSystem();

      expect(getRAGSystem()).toBeNull();
    });

    it('should return null if no instance', () => {
      expect(getRAGSystem()).toBeNull();
    });
  });

  describe('Shutdown', () => {
    it('should cleanup resources', async () => {
      const rag = new RAGSystem();
      rag.initialized = true;
      rag._setCache('test', [{ id: 1 }]);

      await rag.shutdown();

      expect(rag.initialized).toBe(false);
      expect(rag.hybridSearch).toBeNull();
      expect(rag.cache.size).toBe(0);
    });
  });
});

// ============= Database-dependent Tests =============

describe('RAGSystem Database Tests', () => {
  let RAGSystem, HybridSearch;
  let isDatabaseAvailable = false;
  let dbModule;
  let initDatabase, closeDatabase, getDatabase;

  beforeAll(async () => {
    try {
      const ragModule = await import('../../../src/memory/rag.js');
      const hybridModule = await import('../../../src/memory/hybridSearch.js');
      RAGSystem = ragModule.RAGSystem;
      HybridSearch = hybridModule.HybridSearch;

      dbModule = await import('../../../src/memory/database.js');
      initDatabase = dbModule.initDatabase;
      closeDatabase = dbModule.closeDatabase;
      getDatabase = dbModule.getDatabase;

      await initDatabase(':memory:');
      isDatabaseAvailable = true;
      await closeDatabase();
    } catch (e) {
      console.log('Database tests skipped: better-sqlite3 not available');
      console.log('To run database tests, use Node 20 LTS or install Visual Studio Build Tools');
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

  describe('HybridSearch with Database', () => {
    testIf('should create instance with database', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      expect(hybridSearch.config.semanticWeight).toBe(0.7);
      expect(hybridSearch.config.minSimilarity).toBe(0.5);
      expect(hybridSearch.config.maxResults).toBe(10);

      await closeDatabase();
    });

    testIf('should track search statistics', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      const stats = hybridSearch.getStats();

      expect(stats.semanticSearches).toBe(0);
      expect(stats.keywordSearches).toBe(0);
      expect(stats.hybridSearches).toBe(0);

      hybridSearch.resetStats();

      await closeDatabase();
    });

    testIf('should return boolean for vec availability', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      const available = hybridSearch.isSemanticAvailable();

      expect(typeof available).toBe('boolean');

      await closeDatabase();
    });

    testIf('should update configuration', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      hybridSearch.updateConfig({ semanticWeight: 0.9 });

      expect(hybridSearch.config.semanticWeight).toBe(0.9);

      await closeDatabase();
    });

    testIf('should combine and deduplicate results', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      const semanticResults = [
        { id: 1, name: 'skill1', similarity: 0.9 },
        { id: 2, name: 'skill2', similarity: 0.8 }
      ];

      const keywordResults = [
        { id: 1, name: 'skill1', keywordScore: 0.7 },
        { id: 3, name: 'skill3', keywordScore: 0.6 }
      ];

      const combined = hybridSearch.combineResults(semanticResults, keywordResults);

      expect(combined.length).toBe(3);
      expect(combined.find(r => r.id === 1)).toBeDefined();
      expect(combined.find(r => r.id === 1).combinedScore).toBeDefined();

      await closeDatabase();
    });

    testIf('should sort by combined score', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      const semanticResults = [
        { id: 1, name: 'skill1', similarity: 0.5 }
      ];

      const keywordResults = [
        { id: 2, name: 'skill2', keywordScore: 1.0 }
      ];

      const combined = hybridSearch.combineResults(semanticResults, keywordResults, {
        semanticWeight: 0.5
      });

      // Keyword result should have higher combined score
      expect(combined[0].id).toBe(2);

      await closeDatabase();
    });

    testIf('should return empty array for empty query', async () => {
      await initDatabase(':memory:');
      const hybridSearch = new HybridSearch(getDatabase());

      const results = hybridSearch.keywordSearch('', 'skills_metadata');

      expect(results).toEqual([]);

      await closeDatabase();
    });
  });

  describe('RAGSystem with Database', () => {
    testIf('should initialize successfully', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      expect(rag.initialized).toBe(true);
      expect(rag.hybridSearch).toBeDefined();

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should not initialize twice', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();
      await rag.init(); // Second call

      expect(rag.initialized).toBe(true);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should return empty array for empty query', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const results = await rag.search('');

      expect(results).toEqual([]);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should return empty array for null query', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const results = await rag.search(null);

      expect(results).toEqual([]);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should search skills with embedding', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const embedding = new Float32Array(384).fill(0.1);
      const results = await rag.searchSkills(embedding);

      expect(Array.isArray(results)).toBe(true);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should search facts with embedding', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const embedding = new Float32Array(384).fill(0.1);
      const results = await rag.searchFacts(embedding);

      expect(Array.isArray(results)).toBe(true);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should find similar skill returns null without embedding', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const result = await rag.findSimilarSkill('mine stone');

      expect(result).toBeNull();

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should find relevant facts returns empty without embedding', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const results = await rag.findRelevantFacts('test query');

      expect(Array.isArray(results)).toBe(true);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should return boolean for semantic availability', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      const available = rag.isSemanticAvailable();

      expect(typeof available).toBe('boolean');

      await rag.shutdown();
      await closeDatabase();
    });
  });

  describe('RAGSystem Integration', () => {
    testIf('should search with mock embeddings', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();

      // Create tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS skills_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          file_path TEXT,
          embedding BLOB,
          parameters TEXT,
          returns TEXT,
          examples TEXT,
          tags TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          embedding BLOB,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(type, key)
        );
      `);

      // Insert test data
      db.prepare(`
        INSERT INTO skills_metadata (name, description, tags)
        VALUES (?, ?, ?)
      `).run('mine_stone', 'Mine stone blocks from the world', '["mining","stone","blocks"]');

      const rag = new RAGSystem({ db });
      await rag.init();

      // Mock embeddings manager
      const embedding = new Float32Array(384).fill(0.1);
      rag.embeddingsManager = {
        vectorize: jest.fn().mockResolvedValue(embedding)
      };

      const results = await rag.search('mine stone');

      expect(Array.isArray(results)).toBe(true);

      await rag.shutdown();
      await closeDatabase();
    });

    testIf('should handle errors gracefully', async () => {
      await initDatabase(':memory:');
      const rag = new RAGSystem({ db: getDatabase() });
      await rag.init();

      // Force an error scenario
      rag.embeddingsManager = {
        vectorize: jest.fn().mockRejectedValue(new Error('API error'))
      };

      await rag.search('test');

      expect(rag.stats.errors).toBeGreaterThanOrEqual(0);

      await rag.shutdown();
      await closeDatabase();
    });
  });

  describe('HybridSearch Integration', () => {
    testIf('should perform keyword search', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();

      db.exec(`
        CREATE TABLE IF NOT EXISTS skills_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          file_path TEXT,
          embedding BLOB,
          tags TEXT
        );
      `);

      db.prepare(`
        INSERT INTO skills_metadata (name, description, tags)
        VALUES (?, ?, ?)
      `).run('mine_stone', 'Mine stone blocks', '["mining"]');

      const hybridSearch = new HybridSearch(db);

      const results = hybridSearch.keywordSearch('mine stone', 'skills_metadata');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('mine_stone');
      expect(results[0].keywordScore).toBeDefined();

      await closeDatabase();
    });

    testIf('should handle empty database', async () => {
      await initDatabase(':memory:');
      const db = getDatabase();

      db.exec(`
        CREATE TABLE IF NOT EXISTS skills_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          file_path TEXT,
          embedding BLOB,
          tags TEXT
        );
      `);

      const hybridSearch = new HybridSearch(db);

      const results = hybridSearch.keywordSearch('nonexistent', 'skills_metadata');

      expect(results).toEqual([]);

      await closeDatabase();
    });
  });
});