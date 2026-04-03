// src/community/manager.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('PeerManager');

/**
 * Peer Manager - Manages known peers and their status
 */
class PeerManager {
  constructor(bot, config = {}) {
    this.bot = bot;
    this.config = config;

    this.peers = new Map();
    this.discoveryTimeout = config.discoveryTimeout || 120000; // 2 minutes
    this.protocol = null;
  }

  /**
   * Initialize and start discovery
   */
  async init(protocol) {
    this.protocol = protocol;

    // Listen for chat messages
    if (this.bot.on) {
      this.bot.on('chat', (username, message) => {
        this.handleMessage(username, message);
      });
    }

    // Announce presence
    this.announce();

    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);

    logger.info('[PeerManager] Initialized');
  }

  /**
   * Announce presence
   */
  announce() {
    if (!this.protocol) return;

    const hello = this.protocol.createHello({
      name: this.bot.username,
      role: this.config.role || 'assistant'
    });

    this.bot.chat(hello);
    logger.debug('[PeerManager] Announced presence');
  }

  /**
   * Handle incoming message
   */
  handleMessage(username, message) {
    if (username === this.bot.username) return;
    if (!this.protocol || !this.protocol.isCommunityMessage(message)) return;

    const decoded = this.protocol.decode(message);
    if (!decoded) return;

    switch (decoded.type) {
      case 'HELLO':
        this.handleHello(username, decoded.data);
        break;
      case 'STATUS':
        this.handleStatus(username, decoded.data);
        break;
      case 'SYNC':
        this.handleSync(username, decoded.data);
        break;
      case 'BYE':
        this.handleBye(username);
        break;
    }
  }

  /**
   * Handle HELLO message
   */
  handleHello(username, data) {
    this.peers.set(username, {
      name: data.name || username,
      owner: data.owner,
      role: data.role || 'assistant',
      lastSeen: Date.now(),
      position: null,
      task: null
    });

    logger.info(`[PeerManager] Discovered peer: ${data.name} (${data.role})`);
  }

  /**
   * Handle STATUS message
   */
  handleStatus(username, data) {
    if (!this.peers.has(username)) return;

    const peer = this.peers.get(username);
    peer.position = data.pos;
    peer.task = data.task;
    peer.lastSeen = Date.now();
  }

  /**
   * Handle SYNC message
   */
  handleSync(username, data) {
    if (!this.peers.has(username)) return;

    const peer = this.peers.get(username);
    peer.facts = data.facts;
    peer.lastSeen = Date.now();

    logger.debug(`[PeerManager] Synced ${data.facts?.length || 0} facts from ${username}`);
  }

  /**
   * Handle BYE message
   */
  handleBye(username) {
    this.peers.delete(username);
    logger.info(`[PeerManager] Peer left: ${username}`);
  }

  /**
   * Check if peer exists
   */
  hasPeer(name) {
    return this.peers.has(name);
  }

  /**
   * Get peer by name
   */
  getPeer(name) {
    return this.peers.get(name);
  }

  /**
   * Get all peers
   */
  getPeers() {
    return Array.from(this.peers.values());
  }

  /**
   * Get active peers (seen within timeout)
   */
  getActivePeers() {
    const now = Date.now();
    return this.getPeers().filter(p =>
      now - p.lastSeen < this.discoveryTimeout
    );
  }

  /**
   * Get peers by role
   */
  getPeersByRole(role) {
    return this.getPeers().filter(p => p.role === role);
  }

  /**
   * Broadcast message
   */
  broadcast(message) {
    this.bot.chat(message);
  }

  /**
   * Send direct message
   */
  sendTo(peerName, message) {
    // Would use whisper if available
    this.bot.chat(`@${peerName} ${message}`);
  }

  /**
   * Cleanup expired peers
   */
  cleanup() {
    const now = Date.now();
    const expired = [];

    for (const [name, peer] of this.peers) {
      if (now - peer.lastSeen > this.discoveryTimeout) {
        expired.push(name);
      }
    }

    for (const name of expired) {
      this.peers.delete(name);
      logger.debug(`[PeerManager] Expired peer: ${name}`);
    }

    if (expired.length > 0) {
      logger.info(`[PeerManager] Cleaned up ${expired.length} expired peers`);
    }
  }

  /**
   * Stop cleanup interval
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('[PeerManager] Stopped');
  }

  /**
   * Export for checkpoint
   */
  export() {
    return {
      peers: Array.from(this.peers.entries())
    };
  }

  /**
   * Import from checkpoint
   */
  import(data) {
    if (data.peers) {
      this.peers = new Map(data.peers);
    }
  }
}

export { PeerManager };