// src/community/protocol.js

import { createHmac } from 'crypto';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Protocol');

/**
 * Message types for community communication
 */
const MESSAGE_TYPES = {
  HELLO: 'HELLO',           // Announce presence
  STATUS: 'STATUS',         // Update status
  TASK_REQ: 'TASK_REQ',    // Request task assignment
  TASK_OFFER: 'TASK_OFFER', // Offer to do task
  SYNC: 'SYNC',             // Sync shared data
  BYE: 'BYE'               // Leaving
};

/**
 * Communication Protocol for multi-bot coordination
 */
class CommunicationProtocol {
  constructor(config) {
    this.name = config.name;
    this.sharedSecret = config.sharedSecret;
    this.algorithm = 'sha256';
  }

  /**
   * Encode message for transmission
   */
  encode(type, data) {
    const payload = JSON.stringify(data);
    const signature = this.sign(payload);

    // Format: [COMM:TYPE] base64(payload).signature
    const encoded = `[COMM:${type}] ${Buffer.from(payload).toString('base64')}.${signature}`;

    // Limit message length (Minecraft chat limit)
    if (encoded.length > 256) {
      logger.warn(`Message too long (${encoded.length} chars), rejecting`);
      throw new Error(`Message exceeds 256 character limit (${encoded.length} chars)`);
    }

    return encoded;
  }

  /**
   * Decode received message
   */
  decode(message) {
    // Check format
    const match = message.match(/^\[COMM:(\w+)\]\s+([A-Za-z0-9+/=]+)\.([a-f0-9]+)$/);

    if (!match) {
      logger.debug(`Invalid message format: ${message.slice(0, 50)}`);
      return null;
    }

    const [, type, payloadBase64, signature] = match;

    // Verify signature
    const payload = Buffer.from(payloadBase64, 'base64').toString();

    if (!this.verifyPayload(payload, signature)) {
      logger.warn(`Invalid signature for message type: ${type}`);
      return null;
    }

    try {
      const data = JSON.parse(payload);
      return { type, data };
    } catch (e) {
      logger.error(`Failed to parse payload: ${e.message}`);
      return null;
    }
  }

  /**
   * Sign payload
   */
  sign(payload) {
    return createHmac(this.algorithm, this.sharedSecret)
      .update(payload)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Verify message signature
   */
  verify(message) {
    const decoded = this.decode(message);
    return decoded !== null;
  }

  /**
   * Verify payload signature
   */
  verifyPayload(payload, signature) {
    const expected = this.sign(payload);
    return signature === expected;
  }

  /**
   * Create HELLO message
   */
  createHello(identity) {
    return this.encode('HELLO', {
      name: identity.name,
      displayName: identity.displayName,
      owner: identity.owner,
      role: identity.role,
      timestamp: Date.now()
    });
  }

  /**
   * Create STATUS message
   */
  createStatus(state) {
    return this.encode('STATUS', {
      pos: state.position,
      task: state.currentTask?.type || null,
      health: state.health,
      food: state.food,
      timestamp: Date.now()
    });
  }

  /**
   * Create SYNC message
   */
  createSync(facts) {
    return this.encode('SYNC', {
      facts: facts.slice(0, 5), // Limit to 5 facts per message
      timestamp: Date.now()
    });
  }

  /**
   * Create BYE message
   */
  createBye() {
    return this.encode('BYE', {
      name: this.name,
      timestamp: Date.now()
    });
  }

  /**
   * Check if message is community message
   */
  isCommunityMessage(message) {
    return message.startsWith('[COMM:');
  }

  /**
   * Get message type
   */
  getMessageType(message) {
    const match = message.match(/^\[COMM:(\w+)\]/);
    return match ? match[1] : null;
  }
}

export { CommunicationProtocol, MESSAGE_TYPES };