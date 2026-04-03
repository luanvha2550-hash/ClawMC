// tests/mocks/database.mock.js
// Mock database and related systems for testing
//
// Provides mock implementations of SQLite database, RAG system,
// and facts manager for unit and integration testing.

import { jest } from '@jest/globals';

/**
 * Create a mock SQLite database
 * @param {Object} options - Configuration options
 * @returns {Object} Mock database instance
 */
export function createMockDatabase(options = {}) {
  // Internal data stores
  const data = {
    skills_metadata: [],
    skills_vss_local: [],
    skills_vss_api: [],
    facts: [],
    executions: [],
    checkpoints: [],
    community_peers: [],
    shared_facts: []
  };

  // Query tracking
  const queries = [];

  return {
    // Basic query methods
    run: jest.fn().mockImplementation(async (sql, params) => {
      queries.push({ sql, params, type: 'run' });
      return {
        changes: 1,
        lastInsertRowid: Date.now()
      };
    }),

    get: jest.fn().mockImplementation(async (sql, params) => {
      queries.push({ sql, params, type: 'get' });

      // Handle common queries
      if (sql.includes('SELECT 1')) {
        return { result: 1 };
      }

      // Handle fact queries
      if (sql.includes('FROM facts')) {
        return data.facts.find(f => f.key === params?.[0]) || null;
      }

      // Handle skill queries
      if (sql.includes('FROM skills_metadata')) {
        return data.skills_metadata.find(s => s.name === params?.[0]) || null;
      }

      return null;
    }),

    all: jest.fn().mockImplementation(async (sql, params) => {
      queries.push({ sql, params, type: 'all' });

      // Handle common queries
      if (sql.includes('FROM facts')) {
        return data.facts;
      }

      if (sql.includes('FROM skills_metadata')) {
        return data.skills_metadata;
      }

      if (sql.includes('FROM checkpoints')) {
        return data.checkpoints;
      }

      return [];
    }),

    // VSS query (for semantic search)
    queryVSS: jest.fn().mockImplementation(async (sql, vector, params) => {
      queries.push({ sql, vector, params, type: 'vss' });

      // Return mock semantic search results
      return data.skills_vss_local
        .map((skill, idx) => ({
          ...skill,
          distance: 0.1 * (idx + 1)
        }))
        .slice(0, 5);
    }),

    // Transaction support
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),

    transaction: jest.fn().mockImplementation(async (fn) => {
      await fn();
    }),

    // Close
    close: jest.fn().mockImplementation(() => {
      // Clear timers if any
    }),

    // Test helpers
    _data: data,
    _queries: queries,
    _reset: () => {
      for (const key in data) {
        data[key] = [];
      }
      queries.length = 0;
    },
    _addFact: (fact) => {
      data.facts.push(fact);
    },
    _addSkill: (skill) => {
      data.skills_metadata.push(skill);
    },
    _addCheckpoint: (checkpoint) => {
      data.checkpoints.push(checkpoint);
    }
  };
}

/**
 * Create a mock RAG (Retrieval-Augmented Generation) system
 * @param {Object} options - Configuration options
 * @returns {Object} Mock RAG system instance
 */
export function createMockRAG(options = {}) {
  const {
    defaultThreshold = 0.85,
    defaultLimit = 5
  } = options;

  const skills = new Map();
  const facts = new Map();

  return {
    // Initialize
    init: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),

    // Skill operations
    addSkill: jest.fn().mockImplementation(async (skill) => {
      skills.set(skill.name, skill);
      return skill.name;
    }),

    searchSkills: jest.fn().mockImplementation(async (query, threshold = defaultThreshold, limit = defaultLimit) => {
      const results = [];

      for (const [name, skill] of skills) {
        // Simple matching for mock
        const score = skill.name?.toLowerCase().includes(query.toLowerCase()) ? 0.95 : 0.5;
        if (score >= threshold) {
          results.push({ skill, score });
        }
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }),

    getSkill: jest.fn().mockImplementation(async (name) => {
      return skills.get(name) || null;
    }),

    // Fact operations
    addFact: jest.fn().mockImplementation(async (type, key, value) => {
      facts.set(`${type}:${key}`, { type, key, value });
      return { type, key, value };
    }),

    searchFacts: jest.fn().mockImplementation(async (query, threshold = defaultThreshold, limit = defaultLimit) => {
      const results = [];

      for (const [fullKey, fact] of facts) {
        const score = fact.key?.toLowerCase().includes(query.toLowerCase()) ? 0.95 : 0.5;
        if (score >= threshold) {
          results.push({ fact, score });
        }
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }),

    // Combined search
    search: jest.fn().mockImplementation(async (query, options = {}) => {
      const {
        skillThreshold = defaultThreshold,
        factThreshold = defaultThreshold,
        skillLimit = defaultLimit,
        factLimit = defaultLimit
      } = options;

      const skillResults = await createMockRAG().searchSkills(query, skillThreshold, skillLimit);
      const factResults = await createMockRAG().searchFacts(query, factThreshold, factLimit);

      return {
        skills: skillResults,
        facts: factResults,
        confidence: skillResults.length > 0 || factResults.length > 0 ? 0.8 : 0.0
      };
    }),

    // Context building
    buildContext: jest.fn().mockImplementation(async (query, maxTokens = 1000) => {
      const skillResults = [];
      const factResults = [];

      for (const [name, skill] of skills) {
        skillResults.push(skill);
      }

      for (const [fullKey, fact] of facts) {
        factResults.push(fact);
      }

      return {
        context: JSON.stringify({ skills: skillResults, facts: factResults }),
        tokens: 100,
        sources: {
          skills: skillResults.length,
          facts: factResults.length
        }
      };
    }),

    // Export
    export: jest.fn().mockReturnValue({
      skills: Array.from(skills.entries()),
      facts: Array.from(facts.entries())
    }),

    // Test helpers
    _skills: skills,
    _facts: facts,
    _clear: () => {
      skills.clear();
      facts.clear();
    }
  };
}

/**
 * Create a mock facts manager
 * @param {Object} options - Configuration options
 * @returns {Object} Mock facts manager instance
 */
export function createMockFacts(options = {}) {
  const facts = new Map();

  return {
    // Initialize
    init: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),

    // CRUD operations
    save: jest.fn().mockImplementation(async (type, key, value, metadata = {}) => {
      const fact = {
        type,
        key,
        value,
        metadata,
        timestamp: Date.now()
      };
      facts.set(`${type}:${key}`, fact);
      return fact;
    }),

    get: jest.fn().mockImplementation(async (key, type = null) => {
      // If type is provided, look for type:key
      if (type) {
        return facts.get(`${type}:${key}`) || null;
      }
      // Otherwise, search by key
      for (const [fullKey, fact] of facts) {
        if (fact.key === key) {
          return fact;
        }
      }
      return null;
    }),

    getAll: jest.fn().mockImplementation(async (type = null) => {
      if (type) {
        return Array.from(facts.values()).filter(f => f.type === type);
      }
      return Array.from(facts.values());
    }),

    delete: jest.fn().mockImplementation(async (key, type = null) => {
      if (type) {
        return facts.delete(`${type}:${key}`);
      }
      // Delete by key only
      for (const [fullKey, fact] of facts) {
        if (fact.key === key) {
          facts.delete(fullKey);
          return true;
        }
      }
      return false;
    }),

    // Query operations
    query: jest.fn().mockImplementation(async (query) => {
      const results = [];
      const queryLower = query.toLowerCase();

      for (const fact of facts.values()) {
        if (fact.key?.toLowerCase().includes(queryLower) ||
            JSON.stringify(fact.value)?.toLowerCase().includes(queryLower)) {
          results.push(fact);
        }
      }

      return results;
    }),

    // Type-specific methods
    getByType: jest.fn().mockImplementation(async (type) => {
      return Array.from(facts.values()).filter(f => f.type === type);
    }),

    getTypes: jest.fn().mockReturnValue(new Set(Array.from(facts.values()).map(f => f.type))),

    // Memory-specific helpers
    remember: jest.fn().mockImplementation(async (key, value) => {
      return createMockFacts().save('memory', key, value);
    }),

    recall: jest.fn().mockImplementation(async (key) => {
      return createMockFacts().get(key, 'memory');
    }),

    // Location helpers
    setLocation: jest.fn().mockImplementation(async (name, position) => {
      return createMockFacts().save('location', name, position);
    }),

    getLocation: jest.fn().mockImplementation(async (name) => {
      return createMockFacts().get(name, 'location');
    }),

    // Entity helpers
    trackEntity: jest.fn().mockImplementation(async (entityId, data) => {
      return createMockFacts().save('entity', entityId, data);
    }),

    getEntity: jest.fn().mockImplementation(async (entityId) => {
      return createMockFacts().get(entityId, 'entity');
    }),

    // Export/Import
    export: jest.fn().mockReturnValue(Array.from(facts.values())),
    import: jest.fn().mockImplementation(async (factsArray) => {
      for (const fact of factsArray) {
        facts.set(`${fact.type}:${fact.key}`, fact);
      }
    }),

    // Test helpers
    _facts: facts,
    _clear: () => facts.clear(),
    _size: () => facts.size
  };
}

/**
 * Create a mock checkpoint manager
 * @param {Object} options - Configuration options
 * @returns {Object} Mock checkpoint manager instance
 */
export function createMockCheckpoint(options = {}) {
  const checkpoints = new Map();
  let lastCheckpoint = null;

  return {
    // Initialize
    init: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),

    // Save checkpoint
    save: jest.fn().mockImplementation(async (type, data = {}) => {
      const id = Date.now();
      const checkpoint = {
        id,
        type,
        data,
        timestamp: new Date().toISOString()
      };
      checkpoints.set(id, checkpoint);
      lastCheckpoint = checkpoint;
      return id;
    }),

    // Load checkpoint
    load: jest.fn().mockImplementation(async (id) => {
      return checkpoints.get(id) || null;
    }),

    loadLatest: jest.fn().mockImplementation(async () => {
      return lastCheckpoint;
    }),

    // Restore from checkpoint
    restore: jest.fn().mockImplementation(async (id) => {
      const checkpoint = checkpoints.get(id);
      if (!checkpoint) return false;
      return checkpoint;
    }),

    // List checkpoints
    list: jest.fn().mockReturnValue(Array.from(checkpoints.values())),

    // Delete checkpoint
    delete: jest.fn().mockImplementation(async (id) => {
      return checkpoints.delete(id);
    }),

    // Cleanup old checkpoints
    cleanup: jest.fn().mockImplementation(async (maxAge = 86400000) => {
      const cutoff = Date.now() - maxAge;
      for (const [id, checkpoint] of checkpoints) {
        if (new Date(checkpoint.timestamp).getTime() < cutoff) {
          checkpoints.delete(id);
        }
      }
    }),

    // Properties
    lastCheckpoint,

    // Test helpers
    _checkpoints: checkpoints,
    _clear: () => {
      checkpoints.clear();
      lastCheckpoint = null;
    }
  };
}

/**
 * Create a complete mock database environment
 * @param {Object} options - Configuration options
 * @returns {Object} Mock environment with db, rag, facts
 */
export function createMockDatabaseEnvironment(options = {}) {
  const db = createMockDatabase(options.db);
  const rag = createMockRAG(options.rag);
  const facts = createMockFacts(options.facts);
  const checkpoint = createMockCheckpoint(options.checkpoint);

  return {
    db,
    rag,
    facts,
    checkpoint,

    // Convenience method to reset all
    reset: () => {
      db._reset();
      rag._clear();
      facts._clear();
      checkpoint._clear();
    }
  };
}

export default {
  createMockDatabase,
  createMockRAG,
  createMockFacts,
  createMockCheckpoint,
  createMockDatabaseEnvironment
};