import { jest } from '@jest/globals';
import { CommandParser } from '../../../src/core/commands.js';

describe('CommandParser', () => {
  let parser;
  let mockIdentity;

  beforeEach(() => {
    mockIdentity = {
      name: 'TestBot',
      isForMe: jest.fn((username, message) => {
        return message.startsWith('!') || message.includes('@TestBot');
      }),
      parseCommand: jest.fn((username, message) => {
        let cmd = message;
        cmd = cmd.replace(/@TestBot/gi, '').trim();
        if (cmd.startsWith('!')) cmd = cmd.slice(1);
        return cmd.trim();
      })
    };
    parser = new CommandParser(mockIdentity);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parse', () => {
    it('should parse simple command', () => {
      const result = parser.parse('Player', '!mine iron 64');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('mine');
      expect(result.args).toEqual(['iron', '64']);
    });

    it('should parse multi-word intent', () => {
      const result = parser.parse('Player', '!construa casa pedra');
      expect(result.intent).toBe('construa');
      expect(result.args).toEqual(['casa', 'pedra']);
    });

    it('should return null for non-matching command', () => {
      mockIdentity.isForMe.mockReturnValue(false);
      const result = parser.parse('Player', 'mine iron');
      expect(result).toBeNull();
    });

    it('should handle mention', () => {
      const result = parser.parse('Player', '@TestBot mine iron');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('mine');
    });

    it('should include raw message and username in result', () => {
      const result = parser.parse('Player', '!mine iron');
      expect(result.raw).toBe('!mine iron');
      expect(result.username).toBe('Player');
      expect(result.timestamp).toBeDefined();
    });

    it('should extract coordinates from command', () => {
      const result = parser.parse('Player', '!walk 100 64 -200');
      expect(result.coordinates).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('should extract material from command', () => {
      const result = parser.parse('Player', '!construa casa de pedra');
      expect(result.material).toBe('pedra');
    });

    it('should extract count from command', () => {
      const result = parser.parse('Player', '!mine 64 iron');
      expect(result.count).toBe(64);
    });

    it('should extract nearby hint', () => {
      const result = parser.parse('Player', '!mine iron aqui');
      expect(result.nearby).toBe(true);
    });

    it('should extract direction', () => {
      const result = parser.parse('Player', '!walk norte');
      expect(result.direction).toBe('norte');
    });
  });

  describe('extractIntent', () => {
    it('should extract verb as intent', () => {
      const result = parser.extractIntent('construa uma casa de pedra');
      expect(result).toBe('construa');
    });

    it('should handle empty string', () => {
      const result = parser.extractIntent('');
      expect(result).toBe('');
    });

    it('should handle single word', () => {
      const result = parser.extractIntent('stop');
      expect(result).toBe('stop');
    });
  });

  describe('extractArgs', () => {
    it('should extract arguments after intent', () => {
      const args = parser.extractArgs('mine iron 64', 'mine');
      expect(args).toEqual(['iron', '64']);
    });

    it('should handle no arguments', () => {
      const args = parser.extractArgs('stop', 'stop');
      expect(args).toEqual([]);
    });

    it('should handle multiple arguments', () => {
      const args = parser.extractArgs('walk to the north corner', 'walk');
      expect(args).toEqual(['to', 'the', 'north', 'corner']);
    });
  });

  describe('isHighPriority', () => {
    it('should return true for stop command', () => {
      expect(parser.isHighPriority('stop')).toBe(true);
    });

    it('should return true for pare command', () => {
      expect(parser.isHighPriority('pare')).toBe(true);
    });

    it('should return true for fuja command', () => {
      expect(parser.isHighPriority('fuja')).toBe(true);
    });

    it('should return true for escape command', () => {
      expect(parser.isHighPriority('escape')).toBe(true);
    });

    it('should return true for socorro command', () => {
      expect(parser.isHighPriority('socorro')).toBe(true);
    });

    it('should return false for normal commands', () => {
      expect(parser.isHighPriority('mine')).toBe(false);
      expect(parser.isHighPriority('walk')).toBe(false);
      expect(parser.isHighPriority('craft')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(parser.isHighPriority('STOP')).toBe(true);
      expect(parser.isHighPriority('Pare')).toBe(true);
    });
  });

  describe('getAliases', () => {
    it('should return aliases for mine command', () => {
      const aliases = parser.getAliases('mine');
      expect(aliases).toContain('minerar');
      expect(aliases).toContain('mine');
      expect(aliases).toContain('picareta');
    });

    it('should return aliases for walk command', () => {
      const aliases = parser.getAliases('walk');
      expect(aliases).toContain('andar');
      expect(aliases).toContain('ir');
      expect(aliases).toContain('walk');
    });

    it('should return aliases for stop command', () => {
      const aliases = parser.getAliases('stop');
      expect(aliases).toContain('pare');
      expect(aliases).toContain('stop');
      expect(aliases).toContain('pause');
    });

    it('should return single element array for unknown command', () => {
      const aliases = parser.getAliases('unknown');
      expect(aliases).toEqual(['unknown']);
    });

    it('should be case insensitive', () => {
      const aliases = parser.getAliases('MINE');
      expect(aliases).toContain('minerar');
    });
  });
});