// tests/unit/community/sharedFacts.test.js

import { jest } from '@jest/globals';
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
    it('should queue fact for sync', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.shareFact('chest_iron', { x: 150, y: 63, z: 100 });

      expect(sharedFacts.pendingSync).toHaveLength(1);
      expect(sharedFacts.pendingSync[0].key).toBe('chest_iron');
    });

    it('should store shared fact locally', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.shareFact('chest_iron', { x: 150, y: 63, z: 100 });

      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('receiveFact', () => {
    it('should store received fact', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.receiveFact('OtherBot', 'chest_iron', { x: 150, y: 63, z: 100 }, Date.now());

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should not overwrite newer facts', async () => {
      mockDb.get.mockResolvedValue({
        key: 'chest_iron',
        created_at: Date.now()
      });

      await sharedFacts.receiveFact('OtherBot', 'chest_iron', { x: 200, y: 63, z: 200 }, Date.now() - 1000);

      // Should not insert because newer exists
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('getFacts', () => {
    it('should return facts by type', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'chest_iron', value: '{"x":150}', source_peer: 'Bot1', created_at: 1000 },
        { key: 'chest_gold', value: '{"x":200}', source_peer: 'Bot2', created_at: 2000 }
      ]);

      const facts = await sharedFacts.getFacts('chest');

      expect(facts).toHaveLength(2);
    });
  });

  describe('getAllFacts', () => {
    it('should return all facts', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'chest_iron', value: '{"x":150}', source_peer: 'Bot1', created_at: 1000 }
      ]);

      const facts = await sharedFacts.getAllFacts();

      expect(facts).toHaveLength(1);
      expect(facts[0].key).toBe('chest_iron');
    });
  });

  describe('deleteFact', () => {
    it('should delete fact', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.deleteFact('chest_iron');

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        ['chest_iron']
      );
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old facts', async () => {
      mockDb.run.mockResolvedValue({ changes: 5 });

      const deleted = await sharedFacts.deleteOlderThan(60000);

      expect(deleted).toBe(5);
    });
  });

  describe('createSyncMessage', () => {
    it('should create sync message from pending facts', () => {
      sharedFacts.pendingSync = [
        { key: 'fact1', value: { x: 1 }, timestamp: 1000 },
        { key: 'fact2', value: { x: 2 }, timestamp: 2000 }
      ];

      const message = sharedFacts.createSyncMessage();

      expect(message).toBe('[COMM:SYNC] test');
      expect(mockProtocol.encode).toHaveBeenCalled();
    });

    it('should return null if no pending facts', () => {
      sharedFacts.pendingSync = [];

      const message = sharedFacts.createSyncMessage();

      expect(message).toBeNull();
    });
  });

  describe('handleSync', () => {
    it('should process incoming sync', async () => {
      mockDb.get.mockResolvedValue(null);
      mockDb.run.mockResolvedValue({ changes: 1 });

      await sharedFacts.handleSync('OtherBot', {
        facts: [
          { key: 'fact1', value: { x: 1 }, timestamp: 1000 }
        ]
      });

      expect(mockDb.run).toHaveBeenCalled();
    });

    it('should ignore invalid sync', async () => {
      await sharedFacts.handleSync('OtherBot', {});

      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('startSync/stopSync', () => {
    it('should start sync timer', () => {
      const callback = jest.fn();
      sharedFacts.pendingSync = [{ key: 'test', value: {}, timestamp: 1 }];

      sharedFacts.startSync(callback);

      expect(sharedFacts.syncTimer).toBeDefined();
      sharedFacts.stopSync();
    });

    it('should stop sync timer', () => {
      sharedFacts.syncTimer = setInterval(() => {}, 1000);

      sharedFacts.stopSync();

      expect(sharedFacts.syncTimer).toBeNull();
    });
  });

  describe('export', () => {
    it('should export facts', async () => {
      mockDb.all.mockResolvedValue([
        { key: 'fact1', value: '{"x":1}', source_peer: 'Bot1', created_at: 1000 }
      ]);

      const exported = await sharedFacts.export();

      expect(exported.facts).toHaveLength(1);
    });
  });
});