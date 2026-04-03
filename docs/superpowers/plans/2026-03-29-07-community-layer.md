# Community Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar Community Layer para cooperação multi-bot com detecção de peers, protocolo de comunicação, sistema de papéis e sincronização de conhecimento.

**Architecture:** Node.js com protocolo baseado em chat Minecraft, sistema de roles (miner, farmer, builder, etc), sincronização de fatos entre bots.

**Tech Stack:** Node.js 18+, sistema de mensagens via chat, SQLite para persistência de peers.

---

## Task 1: Protocol and Communication

**Files:**
- Create: `src/community/protocol.js`
- Create: `tests/unit/community/protocol.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/community/protocol.test.js

import { CommunicationProtocol } from '../../../src/community/protocol.js';

describe('CommunicationProtocol', () => {
  let protocol;

  beforeEach(() => {
    protocol = new CommunicationProtocol({
      name: 'TestBot',
      sharedSecret: 'test-secret-min-32-chars-long!'
    });
  });

  describe('encode', () => {
    it('should encode HELLO message', () => {
      const message = protocol.encode('HELLO', {
        name: 'TestBot',
        owner: 'TestOwner',
        role: 'miner'
      });

      expect(message).toContain('[COMM:HELLO]');
      expect(message.length).toBeLessThan(256);
    });

    it('should encode STATUS message', () => {
      const message = protocol.encode('STATUS', {
        pos: { x: 100, y: 64, z: -200 },
        task: 'mining'
      });

      expect(message).toContain('[COMM:STATUS]');
    });

    it('should encode SYNC message', () => {
      const message = protocol.encode('SYNC', {
        facts: [{ key: 'chest_iron', value: { x: 150, y: 63, z: 100 } }]
      });

      expect(message).toContain('[COMM:SYNC]');
    });

    it('should add authentication signature', () => {
      const message = protocol.encode('HELLO', { name: 'TestBot' });

      expect(protocol.verify(message)).toBe(true);
    });
  });

  describe('decode', () => {
    it('should decode valid message', () => {
      const encoded = protocol.encode('HELLO', { name: 'TestBot', owner: 'Owner' });
      const decoded = protocol.decode(encoded);

      expect(decoded.type).toBe('HELLO');
      expect(decoded.data.name).toBe('TestBot');
    });

    it('should reject invalid message', () => {
      const result = protocol.decode('invalid message');

      expect(result).toBeNull();
    });

    it('should reject message without signature', () => {
      const result = protocol.decode('[COMM:HELLO] {"name":"FakeBot"}');

      expect(result).toBeNull();
    });
  });

  describe('verify', () => {
    it('should verify valid signature', () => {
      const message = protocol.encode('HELLO', { name: 'TestBot' });

      expect(protocol.verify(message)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const message = '[COMM:HELLO] {"name":"TestBot"}';

      expect(protocol.verify(message)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/community/protocol.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement protocol**

```javascript
// src/community/protocol.js

import { createHmac, createHash } from 'crypto';
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
      logger.warn(`Message too long (${encoded.length} chars), truncating`);
      return encoded.slice(0, 256);
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/community/protocol.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/community/protocol.js tests/unit/community/protocol.test.js
git commit -m "feat(community): add communication protocol

- Implement message encoding/decoding
- Add HMAC signature for authentication
- Support HELLO, STATUS, SYNC, BYE messages
- Add tests"
```

---

## Task 2: Peer Manager

**Files:**
- Create: `src/community/manager.js`
- Create: `tests/unit/community/manager.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/community/manager.test.js

import { PeerManager } from '../../../src/community/manager.js';

describe('PeerManager', () => {
  let manager;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      username: 'TestBot',
      chat: jest.fn(),
      on: jest.fn(),
      players: {}
    };

    manager = new PeerManager(mockBot, {
      discoveryTimeout: 30000
    });
  });

  describe('handleHello', () => {
    it('should register new peer', () => {
      manager.handleHello('OtherBot', {
        name: 'OtherBot',
        owner: 'OtherOwner',
        role: 'farmer'
      });

      expect(manager.hasPeer('OtherBot')).toBe(true);
      expect(manager.getPeer('OtherBot').role).toBe('farmer');
    });

    it('should update existing peer', () => {
      manager.handleHello('OtherBot', { name: 'OtherBot', role: 'miner' });
      manager.handleHello('OtherBot', { name: 'OtherBot', role: 'builder' });

      expect(manager.getPeer('OtherBot').role).toBe('builder');
    });
  });

  describe('handleBye', () => {
    it('should remove peer', () => {
      manager.handleHello('OtherBot', { name: 'OtherBot' });
      manager.handleBye('OtherBot');

      expect(manager.hasPeer('OtherBot')).toBe(false);
    });
  });

  describe('getPeers', () => {
    it('should list all peers', () => {
      manager.handleHello('Bot1', { name: 'Bot1' });
      manager.handleHello('Bot2', { name: 'Bot2' });

      const peers = manager.getPeers();

      expect(peers).toHaveLength(2);
    });

    it('should filter expired peers', () => {
      manager.handleHello('Bot1', { name: 'Bot1', timestamp: Date.now() - 60000 });
      manager.handleHello('Bot2', { name: 'Bot2', timestamp: Date.now() });

      // Set short timeout
      manager.discoveryTimeout = 30000;

      const peers = manager.getActivePeers();

      expect(peers).toHaveLength(1);
      expect(peers[0].name).toBe('Bot2');
    });
  });

  describe('broadcast', () => {
    it('should send message to all peers', () => {
      manager.handleHello('Bot1', { name: 'Bot1' });
      manager.handleHello('Bot2', { name: 'Bot2' });

      manager.broadcast('Test message');

      expect(mockBot.chat).toHaveBeenCalledTimes(1); // Single broadcast
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/community/manager.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement peer manager**

```javascript
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
  }

  /**
   * Initialize and start discovery
   */
  async init(protocol) {
    this.protocol = protocol;

    // Listen for chat messages
    this.bot.on('chat', (username, message) => {
      this.handleMessage(username, message);
    });

    // Announce presence
    this.announce();

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000);

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
    if (!this.protocol.isCommunityMessage(message)) return;

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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/community/manager.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/community/manager.js tests/unit/community/manager.test.js
git commit -m "feat(community): add peer manager

- Implement peer discovery and registration
- Handle HELLO, STATUS, SYNC, BYE messages
- Add peer expiration cleanup
- Add role-based filtering
- Add tests"
```

---

## Task 3: Role System

**Files:**
- Create: `src/community/roles.js`
- Create: `tests/unit/community/roles.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/community/roles.test.js

import { RoleManager, ROLES } from '../../../src/community/roles.js';

describe('RoleManager', () => {
  let roleManager;

  beforeEach(() => {
    roleManager = new RoleManager();
  });

  describe('ROLES definition', () => {
    it('should have predefined roles', () => {
      expect(ROLES.MINER).toBeDefined();
      expect(ROLES.FARMER).toBeDefined();
      expect(ROLES.BUILDER).toBeDefined();
      expect(ROLES.EXPLORER).toBeDefined();
    });

    it('should have skills for each role', () => {
      expect(ROLES.MINER.skills).toContain('mine');
      expect(ROLES.FARMER.skills).toContain('plant');
      expect(ROLES.BUILDER.skills).toContain('build');
    });
  });

  describe('assignRole', () => {
    it('should assign role to bot', () => {
      roleManager.assignRole('TestBot', 'miner');

      expect(roleManager.getRole('TestBot')).toBe('miner');
    });

    it('should validate role', () => {
      expect(() => {
        roleManager.assignRole('TestBot', 'invalid');
      }).toThrow('Invalid role');
    });
  });

  describe('getCapabilities', () => {
    it('should return capabilities for role', () => {
      const caps = roleManager.getCapabilities('miner');

      expect(caps.skills).toContain('mine');
      expect(caps.priority).toContain('iron');
    });
  });

  describe('suggestRole', () => {
    it('should suggest role based on missing capabilities', () => {
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'explorer');

      const suggestion = roleManager.suggestRole();

      expect(['farmer', 'builder']).toContain(suggestion);
    });
  });

  describe('canPerform', () => {
    it('should check if role can perform skill', () => {
      expect(roleManager.canPerform('miner', 'mine')).toBe(true);
      expect(roleManager.canPerform('miner', 'plant')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/community/roles.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement roles**

```javascript
// src/community/roles.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Roles');

/**
 * Predefined roles with capabilities
 */
const ROLES = {
  MINER: {
    name: 'miner',
    skills: ['mine', 'explore', 'store', 'craft'],
    priority: ['iron', 'diamond', 'redstone', 'coal'],
    territory: 'underground'
  },
  FARMER: {
    name: 'farmer',
    skills: ['plant', 'harvest', 'breed', 'collect'],
    priority: ['wheat', 'carrot', 'potato', 'animals'],
    territory: 'surface'
  },
  BUILDER: {
    name: 'builder',
    skills: ['build', 'craft', 'place', 'design'],
    priority: ['structures', 'defenses', 'farms'],
    territory: 'base'
  },
  EXPLORER: {
    name: 'explorer',
    skills: ['explore', 'map', 'scout', 'collect'],
    priority: ['new_chunks', 'villages', 'biomes'],
    territory: 'world'
  },
  DEFENDER: {
    name: 'defender',
    skills: ['fight', 'guard', 'patrol', 'protect'],
    priority: ['mobs', 'threats'],
    territory: 'perimeter'
  },
  GATHERER: {
    name: 'gatherer',
    skills: ['collect', 'chop', 'store'],
    priority: ['wood', 'stone', 'food'],
    territory: 'surface'
  }
};

/**
 * Role Manager - Assigns and manages bot roles
 */
class RoleManager {
  constructor() {
    this.roles = new Map(); // botName -> role
    this.validRoles = new Set(Object.values(ROLES).map(r => r.name));
  }

  /**
   * Assign role to bot
   */
  assignRole(botName, roleName) {
    if (!this.validRoles.has(roleName)) {
      throw new Error(`Invalid role: ${roleName}`);
    }

    this.roles.set(botName, roleName);
    logger.info(`[Roles] Assigned ${roleName} to ${botName}`);
  }

  /**
   * Get role for bot
   */
  getRole(botName) {
    return this.roles.get(botName);
  }

  /**
   * Get role capabilities
   */
  getCapabilities(roleName) {
    const role = Object.values(ROLES).find(r => r.name === roleName);

    if (!role) {
      return null;
    }

    return {
      skills: [...role.skills],
      priority: [...role.priority],
      territory: role.territory
    };
  }

  /**
   * Check if role can perform skill
   */
  canPerform(roleName, skillName) {
    const caps = this.getCapabilities(roleName);
    if (!caps) return false;

    return caps.skills.includes(skillName);
  }

  /**
   * Suggest role based on current community composition
   */
  suggestRole(assignedRoles = this.roles) {
    const counts = {};

    // Count roles
    for (const role of assignedRoles.values()) {
      counts[role] = (counts[role] || 0) + 1;
    }

    // Find missing or under-represented roles
    const allRoles = Object.values(ROLES).map(r => r.name);
    const missing = allRoles.filter(r => !counts[r]);
    const underRepresented = allRoles.filter(r => counts[r] < 2);

    // Prefer missing roles
    if (missing.length > 0) {
      return missing[0];
    }

    // Then under-represented
    if (underRepresented.length > 0) {
      return underRepresented[Math.floor(Math.random() * underRepresented.length)];
    }

    // Default to gatherer
    return 'gatherer';
  }

  /**
   * Auto-assign role based on preferences
   */
  autoAssign(botName, preferredRoles = []) {
    // Check if already assigned
    if (this.roles.has(botName)) {
      return this.roles.get(botName);
    }

    // Try preferred roles first
    for (const pref of preferredRoles) {
      if (this.validRoles.has(pref)) {
        const count = this.countRole(pref);
        if (count < 2) { // Max 2 of each role
          this.assignRole(botName, pref);
          return pref;
        }
      }
    }

    // Suggest based on current composition
    const suggested = this.suggestRole();
    this.assignRole(botName, suggested);
    return suggested;
  }

  /**
   * Count bots with specific role
   */
  countRole(roleName) {
    let count = 0;
    for (const role of this.roles.values()) {
      if (role === roleName) count++;
    }
    return count;
  }

  /**
   * Get all bots with role
   */
  getBotsWithRole(roleName) {
    const bots = [];
    for (const [botName, role] of this.roles) {
      if (role === roleName) {
        bots.push(botName);
      }
    }
    return bots;
  }

  /**
   * Get role distribution
   */
  getDistribution() {
    const dist = {};
    for (const role of this.roles.values()) {
      dist[role] = (dist[role] || 0) + 1;
    }
    return dist;
  }

  /**
   * Check if territory is available
   */
  isTerritoryAvailable(territory) {
    // Count bots in territory
    let count = 0;
    for (const [_, role] of this.roles) {
      const caps = this.getCapabilities(role);
      if (caps?.territory === territory) {
        count++;
      }
    }
    return count < 2; // Max 2 bots per territory
  }

  /**
   * Export for checkpoint
   */
  export() {
    return {
      roles: Array.from(this.roles.entries())
    };
  }

  /**
   * Import from checkpoint
   */
  import(data) {
    if (data.roles) {
      this.roles = new Map(data.roles);
    }
  }
}

export { RoleManager, ROLES };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/community/roles.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/community/roles.js tests/unit/community/roles.test.js
git commit -m "feat(community): add role system

- Define roles (miner, farmer, builder, explorer, defender, gatherer)
- Add role assignment and capabilities
- Add auto-assignment based on composition
- Add territory management
- Add tests"
```

---

## Task 4: Shared Facts Synchronization

**Files:**
- Create: `src/community/sharedFacts.js`
- Create: `tests/unit/community/sharedFacts.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/community/sharedFacts.test.js

import { SharedFacts } from '../../../src/community/sharedFacts.js';

describe('SharedFacts', () => {
  let sharedFacts;
  let mockDb;
  let mockProtocol;

  beforeEach(() => {
    mockDb = {
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn()
    };

    mockProtocol = {
      encode: jest.fn().mockReturnValue('[COMM:SYNC] test'),
      decode: jest.fn()
    };

    sharedFacts = new SharedFacts(mockDb, mockProtocol, {
      syncInterval: 60000
    });
  });

  describe('shareFact', () => {
    it('should share fact with peers', () => {
      sharedFacts.shareFact('chest_iron', { x: 150, y: 63, z: 100 });

      expect(mockProtocol.encode).toHaveBeenCalledWith('SYNC', expect.anything());
    });

    it('should store shared fact locally', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.shareFact('chest_iron', { x: 150, y: 63, z: 100 });

      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('receiveFact', () => {
    it('should store received fact', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.receiveFact('OtherBot', 'chest_iron', { x: 150, y: 63, z: 100 });

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should not overwrite newer facts', async () => {
      mockDb.get.mockResolvedValue({
        key: 'chest_iron',
        updated_at: Date.now()
      });

      await sharedFacts.receiveFact('OtherBot', 'chest_iron', { x: 200, y: 63, z: 200 });

      // Should not insert because newer exists
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('getFacts', () => {
    it('should return facts by type', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'chest_iron', value: '{"x":150}' },
        { key: 'chest_gold', value: '{"x":200}' }
      ]);

      const facts = await sharedFacts.getFacts('chest');

      expect(facts).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/community/sharedFacts.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement shared facts**

```javascript
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
      'SELECT key, updated_at FROM shared_facts WHERE key = ?',
      [key]
    );

    if (existing && existing.updated_at >= timestamp) {
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
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/community/sharedFacts.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/community/sharedFacts.js tests/unit/community/sharedFacts.test.js
git commit -m "feat(community): add shared facts synchronization

- Implement fact sharing between bots
- Add timestamp-based conflict resolution
- Add periodic sync
- Add fact type filtering
- Add tests"
```

---

## Task 5: Community Integration

**Files:**
- Create: `src/community/index.js`
- Create: `tests/integration/community.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration/community.test.js

import { CommunicationProtocol, MESSAGE_TYPES } from '../../src/community/protocol.js';
import { PeerManager } from '../../src/community/manager.js';
import { RoleManager, ROLES } from '../../src/community/roles.js';
import { SharedFacts } from '../../src/community/sharedFacts.js';

describe('Community Layer Integration', () => {
  describe('Protocol', () => {
    it('should encode and decode messages', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const encoded = protocol.encode('HELLO', { name: 'TestBot' });
      const decoded = protocol.decode(encoded);

      expect(decoded.type).toBe('HELLO');
      expect(decoded.data.name).toBe('TestBot');
    });
  });

  describe('Role Assignment', () => {
    it('should auto-assign roles', () => {
      const roleManager = new RoleManager();

      const role1 = roleManager.autoAssign('Bot1', ['miner', 'explorer']);
      const role2 = roleManager.autoAssign('Bot2', ['miner', 'explorer']);

      expect(role1).toBeDefined();
      expect(role2).toBeDefined();
    });

    it('should suggest missing roles', () => {
      const roleManager = new RoleManager();

      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'miner');

      const suggestion = roleManager.suggestRole();

      expect(['farmer', 'builder', 'explorer', 'defender', 'gatherer']).toContain(suggestion);
    });
  });

  describe('Capabilities', () => {
    it('should return role capabilities', () => {
      const roleManager = new RoleManager();

      const caps = roleManager.getCapabilities('miner');

      expect(caps.skills).toContain('mine');
      expect(caps.territory).toBe('underground');
    });
  });
});
```

- [ ] **Step 2: Create community index**

```javascript
// src/community/index.js

export { CommunicationProtocol, MESSAGE_TYPES } from './protocol.js';
export { PeerManager } from './manager.js';
export { RoleManager, ROLES } from './roles.js';
export { SharedFacts } from './sharedFacts.js';
```

- [ ] **Step 3: Run integration test**

```bash
npm test -- tests/integration/community.test.js
# Expected: PASS
```

- [ ] **Step 4: Final commit for Community Layer**

```bash
git add src/community/index.js tests/integration/community.test.js
git commit -m "test(community): add integration tests

- Test protocol encoding/decoding
- Test role auto-assignment
- Test capability system"
```

---

## Completion Checklist

- [ ] All tests passing
- [ ] All files created
- [ ] All commits made
- [ ] No linting errors (`npm run lint`)
- [ ] Integration test passes

---

**Next Plan:** [08-integration.md](./2026-03-29-08-integration.md)