// tests/unit/community/roles.test.js

import { jest } from '@jest/globals';
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

    it('should throw for invalid role', () => {
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

    it('should return null for invalid role', () => {
      const caps = roleManager.getCapabilities('invalid');

      expect(caps).toBeNull();
    });
  });

  describe('suggestRole', () => {
    it('should suggest role based on missing capabilities', () => {
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'explorer');

      const suggestion = roleManager.suggestRole();

      expect(['farmer', 'builder', 'defender', 'gatherer']).toContain(suggestion);
    });
  });

  describe('canPerform', () => {
    it('should check if role can perform skill', () => {
      expect(roleManager.canPerform('miner', 'mine')).toBe(true);
      expect(roleManager.canPerform('miner', 'plant')).toBe(false);
    });
  });

  describe('autoAssign', () => {
    it('should auto-assign role based on preferences', () => {
      const role = roleManager.autoAssign('TestBot', ['miner', 'explorer']);

      expect(role).toBe('miner');
    });

    it('should not assign if already assigned', () => {
      roleManager.assignRole('TestBot', 'miner');

      const role = roleManager.autoAssign('TestBot', ['farmer']);

      expect(role).toBe('miner');
    });
  });

  describe('getBotsWithRole', () => {
    it('should return all bots with role', () => {
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'farmer');
      roleManager.assignRole('Bot3', 'miner');

      const miners = roleManager.getBotsWithRole('miner');

      expect(miners).toHaveLength(2);
      expect(miners).toContain('Bot1');
      expect(miners).toContain('Bot3');
    });
  });

  describe('getDistribution', () => {
    it('should return role distribution', () => {
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'miner');
      roleManager.assignRole('Bot3', 'farmer');

      const dist = roleManager.getDistribution();

      expect(dist.miner).toBe(2);
      expect(dist.farmer).toBe(1);
    });
  });

  describe('export/import', () => {
    it('should export and import roles', () => {
      roleManager.assignRole('Bot1', 'miner');
      roleManager.assignRole('Bot2', 'farmer');

      const exported = roleManager.export();

      const newManager = new RoleManager();
      newManager.import(exported);

      expect(newManager.getRole('Bot1')).toBe('miner');
      expect(newManager.getRole('Bot2')).toBe('farmer');
    });
  });
});