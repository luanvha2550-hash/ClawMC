/**
 * Database module for ClawMC
 * Handles SQLite initialization with WAL mode and sqlite-vec extension
 */

import Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Database');

let db = null;

/**
 * Initialize database connection
 * @param {string} dbPath - Path to database file (default: './data/brain.db')
 * @returns {Promise<Database>} Database instance
 */
export async function initDatabase(dbPath = './data/brain.db') {
  try {
    // Ensure data directory exists for file-based databases
    if (dbPath !== ':memory:') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = path.dirname(dbPath);
      await fs.mkdir(dir, { recursive: true });
    }

    db = new Database(dbPath);

    // Enable WAL mode for better performance (except for in-memory databases)
    if (dbPath !== ':memory:') {
      db.pragma('journal_mode = WAL');
    }

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

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
 * @returns {Database} Database instance
 * @throws {Error} If database not initialized
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
 * Run a SQL statement
 * @param {string} sql - SQL statement
 * @param {Array} params - Parameters
 * @returns {Object} Result with changes and lastInsertRowid
 */
export function run(sql, params = []) {
  return getDatabase().prepare(sql).run(...params);
}

/**
 * Get a single row
 * @param {string} sql - SQL query
 * @param {Array} params - Parameters
 * @returns {Object|null} Row or null
 */
export function get(sql, params = []) {
  return getDatabase().prepare(sql).get(...params);
}

/**
 * Get all rows
 * @param {string} sql - SQL query
 * @param {Array} params - Parameters
 * @returns {Array} Array of rows
 */
export function all(sql, params = []) {
  return getDatabase().prepare(sql).all(...params);
}

/**
 * Run a transaction
 * @param {Function} fn - Function to run in transaction
 * @returns {*} Result of the transaction
 */
export function transaction(fn) {
  return getDatabase().transaction(fn);
}