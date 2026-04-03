// tests/unit/community/protocol.test.js

import { jest } from '@jest/globals';
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

  describe('createHello', () => {
    it('should create HELLO message', () => {
      const message = protocol.createHello({
        name: 'TestBot',
        displayName: 'Test Bot',
        owner: 'Owner',
        role: 'miner'
      });

      expect(message).toContain('[COMM:HELLO]');
    });
  });

  describe('createStatus', () => {
    it('should create STATUS message', () => {
      const message = protocol.createStatus({
        position: { x: 100, y: 64, z: 200 },
        currentTask: { type: 'mining' },
        health: 20,
        food: 20
      });

      expect(message).toContain('[COMM:STATUS]');
    });
  });

  describe('createBye', () => {
    it('should create BYE message', () => {
      const message = protocol.createBye();

      expect(message).toContain('[COMM:BYE]');
    });
  });

  describe('isCommunityMessage', () => {
    it('should detect community messages', () => {
      const message = protocol.encode('HELLO', { name: 'TestBot' });

      expect(protocol.isCommunityMessage(message)).toBe(true);
    });

    it('should reject non-community messages', () => {
      expect(protocol.isCommunityMessage('Hello world')).toBe(false);
    });
  });

  describe('getMessageType', () => {
    it('should extract message type', () => {
      const message = protocol.encode('HELLO', { name: 'TestBot' });

      expect(protocol.getMessageType(message)).toBe('HELLO');
    });
  });
});