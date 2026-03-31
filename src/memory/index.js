/**
 * Memory Layer - Main Entry Point for ClawMC
 *
 * Exports all memory components for unified access:
 * - Database initialization and operations
 * - Migration management
 * - Embeddings generation (local/API)
 * - RAG (Retrieval-Augmented Generation) system
 * - Facts management
 * - Hybrid search (semantic + keyword)
 */

// Database
export {
  initDatabase,
  getDatabase,
  closeDatabase,
  run,
  get,
  all,
  transaction
} from './database.js';

// Migrations
export { MigrationManager, migrations } from './migrations.js';

// Embeddings
export {
  EmbeddingsManager,
  createEmbeddingsManager,
  getEmbeddingsManager,
  clearEmbeddingsManager
} from './embeddings.js';

// RAG System
export {
  RAGSystem,
  createRAGSystem,
  getRAGSystem,
  clearRAGSystem
} from './rag.js';

// Facts Manager
export {
  FactsManager,
  createFactsManager,
  getFactsManager,
  clearFactsManager
} from './facts.js';

// Hybrid Search
export {
  HybridSearch,
  normalizeQuery,
  extractKeywords
} from './hybridSearch.js';

/**
 * Initialize the complete memory layer
 * @param {Object} options - Initialization options
 * @param {string} options.dbPath - Database file path (default: './data/brain.db')
 * @param {Object} options.embeddingsConfig - Embeddings configuration
 * @param {Object} options.ragConfig - RAG configuration
 * @param {Object} options.factsConfig - Facts manager configuration
 * @returns {Promise<Object>} Initialized memory components
 */
export async function initializeMemoryLayer(options = {}) {
  const { initDatabase } = await import('./database.js');
  const { MigrationManager } = await import('./migrations.js');
  const { createEmbeddingsManager } = await import('./embeddings.js');
  const { createRAGSystem } = await import('./rag.js');
  const { createFactsManager } = await import('./facts.js');

  const dbPath = options.dbPath || './data/brain.db';

  // Initialize database
  const db = await initDatabase(dbPath);

  // Run migrations
  const migrationManager = new MigrationManager(db);
  await migrationManager.migrate();

  // Initialize embeddings manager
  const embeddingsManager = createEmbeddingsManager(options.embeddingsConfig || {});
  await embeddingsManager.init();

  // Initialize RAG system
  const ragSystem = createRAGSystem({
    db,
    embeddingsManager,
    config: options.ragConfig || {}
  });
  await ragSystem.init();

  // Initialize facts manager
  const factsManager = createFactsManager({
    db,
    embeddingsManager,
    config: options.factsConfig || {}
  });
  await factsManager.init();

  return {
    db,
    embeddingsManager,
    ragSystem,
    factsManager,
    migrationManager
  };
}

/**
 * Shutdown the memory layer
 * @returns {Promise<void>}
 */
export async function shutdownMemoryLayer() {
  const { getEmbeddingsManager, clearEmbeddingsManager } = await import('./embeddings.js');
  const { getRAGSystem, clearRAGSystem } = await import('./rag.js');
  const { getFactsManager, clearFactsManager } = await import('./facts.js');
  const { closeDatabase } = await import('./database.js');

  // Shutdown components in reverse order
  const factsManager = getFactsManager();
  if (factsManager) {
    await factsManager.shutdown();
    clearFactsManager();
  }

  const ragSystem = getRAGSystem();
  if (ragSystem) {
    await ragSystem.shutdown();
    clearRAGSystem();
  }

  const embeddingsManager = getEmbeddingsManager();
  if (embeddingsManager) {
    await embeddingsManager.shutdown();
    clearEmbeddingsManager();
  }

  // Close database last
  await closeDatabase();
}