import { jest } from '@jest/globals';
import { BotIdentity } from '../../../src/community/identity.js';

describe('BotIdentity', () => {
  let identity;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      username: 'TestBot',
      chat: jest.fn(),
      on: jest.fn(),
      players: {}
    };

    const config = {
      bot: {
        identity: {
          name: 'TestBot',
          displayName: 'Test',
          owner: 'Owner',
          ownerNickname: 'OwnerNick'
        },
        response: {
          mode: 'auto',
          defaultPrefix: '!'
        }
      }
    };

    identity = new BotIdentity(config, mockBot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config values', () => {
      expect(identity.name).toBe('TestBot');
      expect(identity.displayName).toBe('Test');
      expect(identity.owner).toBe('Owner');
      expect(identity.ownerNickname).toBe('OwnerNick');
      expect(identity.defaultPrefix).toBe('!');
      expect(identity.isMultiBotMode).toBe(false);
    });

    it('should use name as displayName if not provided', () => {
      const config = {
        bot: {
          identity: {
            name: 'BotX',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };
      const botIdentity = new BotIdentity(config, { username: 'BotX' });
      expect(botIdentity.displayName).toBe('BotX');
    });
  });

  describe('isForMe', () => {
    it('should accept commands with prefix in single mode', () => {
      identity.isMultiBotMode = false;
      const result = identity.isForMe('Player', '!mine iron');
      expect(result).toBe(true);
    });

    it('should reject commands without prefix in single mode', () => {
      identity.isMultiBotMode = false;
      const result = identity.isForMe('Player', 'mine iron');
      expect(result).toBe(false);
    });

    it('should accept commands with mention in multi mode', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('Player', '@TestBot mine iron');
      expect(result).toBe(true);
    });

    it('should accept commands with displayName mention in multi mode', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('Player', '@Test mine iron');
      expect(result).toBe(true);
    });

    it('should reject commands without mention in multi mode', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('Player', '!mine iron');
      expect(result).toBe(false);
    });

    it('should allow owner to use prefix in multi mode', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('Owner', '!mine iron');
      expect(result).toBe(true);
    });

    it('should allow owner by nickname to use prefix in multi mode', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('OwnerNick', '!mine iron');
      expect(result).toBe(true);
    });

    it('should reject owner command if mentions another bot', () => {
      identity.isMultiBotMode = true;
      // Add a known peer
      identity.knownPeers.set('OtherBot', { name: 'OtherBot', displayName: 'Other' });

      const result = identity.isForMe('Owner', '@OtherBot come here');
      expect(result).toBe(false);
    });

    it('should be case insensitive for mentions', () => {
      identity.isMultiBotMode = true;
      const result = identity.isForMe('Player', '@testbot mine iron');
      expect(result).toBe(true);
    });
  });

  describe('parseCommand', () => {
    it('should remove prefix and mention', () => {
      const result = identity.parseCommand('Player', '@TestBot !mine iron');
      expect(result).toBe('mine iron');
    });

    it('should remove only mention', () => {
      const result = identity.parseCommand('Player', '@TestBot mine iron');
      expect(result).toBe('mine iron');
    });

    it('should remove only prefix', () => {
      const result = identity.parseCommand('Player', '!mine iron');
      expect(result).toBe('mine iron');
    });

    it('should handle displayName mention', () => {
      const result = identity.parseCommand('Player', '@Test !mine iron');
      expect(result).toBe('mine iron');
    });

    it('should handle command without prefix or mention', () => {
      const result = identity.parseCommand('Player', 'mine iron');
      expect(result).toBe('mine iron');
    });
  });

  describe('detectOtherBot', () => {
    it('should detect bot from announcement', () => {
      identity.detectOtherBot('OtherBot', '[COMM:HELLO] {"name":"OtherBot","owner":"Player2"}');

      expect(identity.knownPeers.has('OtherBot')).toBe(true);
      expect(identity.isMultiBotMode).toBe(true);
    });

    it('should not detect itself', () => {
      identity.detectOtherBot('TestBot', '[COMM:HELLO] {"name":"TestBot"}');
      expect(identity.knownPeers.has('TestBot')).toBe(false);
    });

    it('should ignore non-announcement messages', () => {
      identity.detectOtherBot('Player', 'Hello everyone!');
      expect(identity.knownPeers.size).toBe(0);
    });

    it('should handle invalid JSON in announcement', () => {
      identity.detectOtherBot('OtherBot', '[COMM:HELLO] invalid json');
      expect(identity.knownPeers.size).toBe(0);
    });

    it('should store peer information', () => {
      identity.detectOtherBot('OtherBot', '[COMM:HELLO] {"name":"OtherBot","displayName":"Other","owner":"Player2","role":"miner"}');

      const peer = identity.knownPeers.get('OtherBot');
      expect(peer).toBeDefined();
      expect(peer.displayName).toBe('Other');
      expect(peer.owner).toBe('Player2');
      expect(peer.role).toBe('miner');
      expect(peer.lastSeen).toBeDefined();
    });
  });

  describe('enableMultiBotMode', () => {
    it('should set isMultiBotMode to true', () => {
      identity.enableMultiBotMode();
      expect(identity.isMultiBotMode).toBe(true);
    });

    it('should announce mode change', () => {
      identity.enableMultiBotMode();
      expect(mockBot.chat).toHaveBeenCalled();
    });

    it('should not announce if already in multi mode', () => {
      identity.isMultiBotMode = true;
      mockBot.chat.mockClear();
      identity.enableMultiBotMode();
      expect(mockBot.chat).not.toHaveBeenCalled();
    });
  });

  describe('listKnownPeers', () => {
    it('should return empty array when no peers', () => {
      const peers = identity.listKnownPeers();
      expect(peers).toEqual([]);
    });

    it('should return list of peers', () => {
      identity.knownPeers.set('Bot1', { name: 'Bot1', owner: 'Player1' });
      identity.knownPeers.set('Bot2', { name: 'Bot2', owner: 'Player2' });

      const peers = identity.listKnownPeers();
      expect(peers).toHaveLength(2);
      expect(peers.map(p => p.name)).toContain('Bot1');
      expect(peers.map(p => p.name)).toContain('Bot2');
    });
  });

  describe('isOwnerOnline', () => {
    it('should return true when owner is online', () => {
      mockBot.players = { Owner: {}, OtherPlayer: {} };
      expect(identity.isOwnerOnline()).toBe(true);
    });

    it('should return true when owner nickname is online', () => {
      mockBot.players = { OwnerNick: {}, OtherPlayer: {} };
      expect(identity.isOwnerOnline()).toBe(true);
    });

    it('should return false when owner is offline', () => {
      mockBot.players = { OtherPlayer: {} };
      expect(identity.isOwnerOnline()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = identity.getStatus();
      expect(status.name).toBe('TestBot');
      expect(status.displayName).toBe('Test');
      expect(status.owner).toBe('Owner');
      expect(status.responseMode).toBe('auto');
      expect(status.isMultiBotMode).toBe(false);
      expect(status.knownPeers).toEqual([]);
    });
  });

  describe('announcePresence', () => {
    it('should send announcement to chat', () => {
      identity.announcePresence();
      expect(mockBot.chat).toHaveBeenCalled();
      const announcement = mockBot.chat.mock.calls[0][0];
      expect(announcement).toContain('[COMM:HELLO]');
      expect(announcement).toContain('TestBot');
    });
  });

  describe('init', () => {
    it('should register chat listener', async () => {
      await identity.init();
      expect(mockBot.on).toHaveBeenCalledWith('chat', expect.any(Function));
    });

    it('should announce presence', async () => {
      await identity.init();
      expect(mockBot.chat).toHaveBeenCalled();
    });
  });

  describe('checkMultiBotMode', () => {
    it('should enable multi mode if peers detected', () => {
      identity.knownPeers.set('Bot1', { name: 'Bot1' });
      identity.checkMultiBotMode();
      expect(identity.isMultiBotMode).toBe(true);
    });

    it('should stay single mode if no peers', () => {
      identity.checkMultiBotMode();
      expect(identity.isMultiBotMode).toBe(false);
    });
  });
});