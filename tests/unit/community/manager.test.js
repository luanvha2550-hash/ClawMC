// tests/unit/community/manager.test.js

import { jest } from '@jest/globals';
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
      manager.handleHello('Bot1', { name: 'Bot1' });
      manager.handleHello('Bot2', { name: 'Bot2' });

      // Manually set lastSeen to simulate expired peer
      manager.peers.get('Bot1').lastSeen = Date.now() - 60000;

      // Set short timeout
      manager.discoveryTimeout = 30000;

      const peers = manager.getActivePeers();

      expect(peers).toHaveLength(1);
      expect(peers[0].name).toBe('Bot2');
    });
  });

  describe('getPeersByRole', () => {
    it('should filter peers by role', () => {
      manager.handleHello('Bot1', { name: 'Bot1', role: 'miner' });
      manager.handleHello('Bot2', { name: 'Bot2', role: 'farmer' });
      manager.handleHello('Bot3', { name: 'Bot3', role: 'miner' });

      const miners = manager.getPeersByRole('miner');

      expect(miners).toHaveLength(2);
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

  describe('export/import', () => {
    it('should export and import peers', () => {
      manager.handleHello('Bot1', { name: 'Bot1', role: 'miner' });
      manager.handleHello('Bot2', { name: 'Bot2', role: 'farmer' });

      const exported = manager.export();

      const newManager = new PeerManager(mockBot, {});
      newManager.import(exported);

      expect(newManager.hasPeer('Bot1')).toBe(true);
      expect(newManager.hasPeer('Bot2')).toBe(true);
    });
  });
});