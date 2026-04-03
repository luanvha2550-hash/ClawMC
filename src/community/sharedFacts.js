// src/community/sharedFacts.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('SharedFacts');

/**
 * Shared Facts - Synchronizes knowledge between bots
 */
class SharedFacts {
  constructor(db, protocol, config = {}) {
    this.db = db;
    this.protocol = protocol;
    this.config = config;
    this.syncInterval = config.syncInterval || 60000; // 1 minute

    this.pendingSync = [];
    this.lastSync = 0;
    this.syncTimer = null;
  }

  /**
   * Share a fact with other bots
   */
  async shareFact(key, value) {
    const now = Date.now();

    // Store locally
    await this.storeFact(key, value, now);

    // Queue for sync
    this.pendingSync.push({ key, value, timestamp: now });

    // Create sync message for immediate use
    if (this.protocol) {
      this.protocol.encode('SYNC', { facts: this.pendingSync.slice(-10) });
    }

    logger.debug(`[SharedFacts] Queued fact: ${key}`);
  }

  /**
   * Store fact in database
   */
  async storeFact(key, value, timestamp, source = 'local') {
    const valueStr = JSON.stringify(value);

    await this.db.run(`
      INSERT OR REPLACE INTO shared_facts (key, value, source_peer, created_at)
      VALUES (?, ?, ?, ?)
    `, [key, valueStr, source, timestamp || Date.now()]);

    logger.debug(`[SharedFacts] Stored fact: ${key}`);
  }

  /**
   * Receive fact from peer
   */
  async receiveFact(sourcePeer, key, value, timestamp) {
    // Check if we have newer version
    const existing = await this.db.get(
      'SELECT key, created_at FROM shared_facts WHERE key = ?',
      [key]
    );

    if (existing && existing.created_at >= timestamp) {
      logger.debug(`[SharedFacts] Ignoring older fact: ${key}`);
      return;
    }

    // Store received fact
    await this.storeFact(key, value, timestamp, sourcePeer);

    logger.info(`[SharedFacts] Received fact from ${sourcePeer}: ${key}`);
  }

  /**
   * Get facts by type prefix
   */
  async getFacts(typePrefix) {
    const rows = await this.db.all(
      'SELECT key, value, source_peer, created_at FROM shared_facts WHERE key LIKE ?',
      [`${typePrefix}%`]
    );

    return rows.map(row => ({
      key: row.key,
      value: JSON.parse(row.value),
      source: row.source_peer,
      timestamp: row.created_at
    }));
  }

  /**
   * Get all facts
   */
  async getAllFacts() {
    const rows = await this.db.all(
      'SELECT key, value, source_peer, created_at FROM shared_facts'
    );

    return rows.map(row => ({
      key: row.key,
      value: JSON.parse(row.value),
      source: row.source_peer,
      timestamp: row.created_at
    }));
  }

  /**
   * Create sync message
   */
  createSyncMessage() {
    // Get recent facts
    const facts = this.pendingSync.splice(0, 10); // Max 10 facts per sync

    if (facts.length === 0) {
      return null;
    }

    return this.protocol.encode('SYNC', { facts });
  }

  /**
   * Handle incoming sync message
   */
  async handleSync(sourcePeer, data) {
    if (!data.facts || !Array.isArray(data.facts)) {
      logger.warn('[SharedFacts] Invalid sync message');
      return;
    }

    for (const fact of data.facts) {
      await this.receiveFact(sourcePeer, fact.key, fact.value, fact.timestamp);
    }
  }

  /**
   * Start periodic sync
   */
  startSync(callback) {
    this.syncTimer = setInterval(async () => {
      const message = this.createSyncMessage();
      if (message) {
        callback(message);
        this.lastSync = Date.now();
      }
    }, this.syncInterval);

    logger.info(`[SharedFacts] Started sync with ${this.syncInterval}ms interval`);
  }

  /**
   * Stop sync
   */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    logger.info('[SharedFacts] Stopped sync');
  }

  /**
   * Delete fact
   */
  async deleteFact(key) {
    await this.db.run('DELETE FROM shared_facts WHERE key = ?', [key]);
    logger.debug(`[SharedFacts] Deleted fact: ${key}`);
  }

  /**
   * Delete facts older than
   */
  async deleteOlderThan(maxAge) {
    const cutoff = Date.now() - maxAge;
    const result = await this.db.run(
      'DELETE FROM shared_facts WHERE created_at < ?',
      [cutoff]
    );
    logger.debug(`[SharedFacts] Deleted ${result.changes} old facts`);
    return result.changes;
  }

  /**
   * Export for checkpoint
   */
  async export() {
    const facts = await this.getAllFacts();
    return { facts };
  }
}

export { SharedFacts };