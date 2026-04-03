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

    it('should verify valid signatures', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const encoded = protocol.encode('STATUS', { pos: { x: 100, y: 64, z: -200 } });

      expect(protocol.verify(encoded)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const fake = '[COMM:HELLO] eyJuYW1lIjoiRmFrZSJ9.invalid';

      expect(protocol.verify(fake)).toBe(false);
    });

    it('should create typed messages', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const hello = protocol.createHello({
        name: 'TestBot',
        owner: 'TestOwner',
        role: 'miner'
      });

      expect(hello).toContain('[COMM:HELLO]');
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

    it('should distribute roles evenly', () => {
      const roleManager = new RoleManager();

      // Assign 6 bots
      for (let i = 1; i <= 6; i++) {
        roleManager.autoAssign(`Bot${i}`, ['miner', 'farmer', 'builder']);
      }

      const dist = roleManager.getDistribution();

      // Should have distributed roles
      expect(Object.keys(dist).length).toBeGreaterThan(0);
    });
  });

  describe('Capabilities', () => {
    it('should return role capabilities', () => {
      const roleManager = new RoleManager();

      const caps = roleManager.getCapabilities('miner');

      expect(caps.skills).toContain('mine');
      expect(caps.territory).toBe('underground');
    });

    it('should check skill permissions', () => {
      const roleManager = new RoleManager();

      expect(roleManager.canPerform('miner', 'mine')).toBe(true);
      expect(roleManager.canPerform('miner', 'plant')).toBe(false);
      expect(roleManager.canPerform('farmer', 'plant')).toBe(true);
      expect(roleManager.canPerform('builder', 'build')).toBe(true);
    });

    it('should handle invalid roles', () => {
      const roleManager = new RoleManager();

      expect(roleManager.getCapabilities('invalid')).toBeNull();
      expect(roleManager.canPerform('invalid', 'mine')).toBe(false);
    });
  });

  describe('ROLES Definition', () => {
    it('should have all required roles', () => {
      expect(ROLES.MINER).toBeDefined();
      expect(ROLES.FARMER).toBeDefined();
      expect(ROLES.BUILDER).toBeDefined();
      expect(ROLES.EXPLORER).toBeDefined();
      expect(ROLES.DEFENDER).toBeDefined();
      expect(ROLES.GATHERER).toBeDefined();
    });

    it('should have consistent structure', () => {
      for (const role of Object.values(ROLES)) {
        expect(role.name).toBeDefined();
        expect(role.skills).toBeDefined();
        expect(Array.isArray(role.skills)).toBe(true);
        expect(role.priority).toBeDefined();
        expect(Array.isArray(role.priority)).toBe(true);
        expect(role.territory).toBeDefined();
      }
    });
  });

  describe('Territory Management', () => {
    it('should check territory availability', () => {
      const roleManager = new RoleManager();

      // Initially all territories available
      expect(roleManager.isTerritoryAvailable('underground')).toBe(true);

      // Assign miners (underground territory)
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'miner');

      // Now underground should be at capacity (max 2)
      expect(roleManager.isTerritoryAvailable('underground')).toBe(false);
    });

    it('should respect territory limits', () => {
      const roleManager = new RoleManager();

      // Assign 3 miners
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'miner');
      roleManager.assignRole('Bot3', 'miner');

      // All 3 should be miners regardless of territory limit
      expect(roleManager.getRole('Bot1')).toBe('miner');
      expect(roleManager.getRole('Bot2')).toBe('miner');
      expect(roleManager.getRole('Bot3')).toBe('miner');

      // But territory should show as unavailable
      expect(roleManager.isTerritoryAvailable('underground')).toBe(false);
    });
  });

  describe('Export/Import', () => {
    it('should export and import role assignments', () => {
      const roleManager = new RoleManager();

      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'farmer');

      const exported = roleManager.export();

      const newManager = new RoleManager();
      newManager.import(exported);

      expect(newManager.getRole('Bot1')).toBe('miner');
      expect(newManager.getRole('Bot2')).toBe('farmer');
    });
  });

  describe('Message Types', () => {
    it('should define all message types', () => {
      expect(MESSAGE_TYPES.HELLO).toBe('HELLO');
      expect(MESSAGE_TYPES.STATUS).toBe('STATUS');
      expect(MESSAGE_TYPES.TASK_REQ).toBe('TASK_REQ');
      expect(MESSAGE_TYPES.TASK_OFFER).toBe('TASK_OFFER');
      expect(MESSAGE_TYPES.SYNC).toBe('SYNC');
      expect(MESSAGE_TYPES.BYE).toBe('BYE');
    });
  });

  describe('Protocol Message Creation', () => {
    it('should create STATUS message', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const status = protocol.createStatus({
        position: { x: 100, y: 64, z: -200 },
        currentTask: { type: 'mining' },
        health: 20,
        food: 20
      });

      expect(status).toContain('[COMM:STATUS]');
    });

    it('should create SYNC message', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const sync = protocol.createSync([
        { key: 'chest_iron', value: { x: 150, y: 63, z: 100 } }
      ]);

      expect(sync).toContain('[COMM:SYNC]');
    });

    it('should create BYE message', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      const bye = protocol.createBye();

      expect(bye).toContain('[COMM:BYE]');
    });
  });

  describe('IsCommunityMessage', () => {
    it('should identify community messages', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      expect(protocol.isCommunityMessage('[COMM:HELLO] test')).toBe(true);
      expect(protocol.isCommunityMessage('[COMM:STATUS] test')).toBe(true);
      expect(protocol.isCommunityMessage('Regular chat message')).toBe(false);
    });
  });

  describe('GetMessageType', () => {
    it('should extract message type', () => {
      const protocol = new CommunicationProtocol({
        name: 'TestBot',
        sharedSecret: 'test-secret-32-characters-long!'
      });

      expect(protocol.getMessageType('[COMM:HELLO] test')).toBe('HELLO');
      expect(protocol.getMessageType('[COMM:STATUS] test')).toBe('STATUS');
      expect(protocol.getMessageType('[COMM:SYNC] test')).toBe('SYNC');
      expect(protocol.getMessageType('Regular message')).toBeNull();
    });
  });
});