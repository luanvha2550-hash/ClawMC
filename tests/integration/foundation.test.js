// tests/integration/foundation.test.js
// Integration tests for Foundation Layer components

import { jest } from '@jest/globals';
import { loadConfig, validateConfig, clearConfigCache } from '../../src/utils/config.js';
import { createLogger, getLogger } from '../../src/utils/logger.js';
import { StateManager } from '../../src/core/state.js';
import { CommandParser } from '../../src/core/commands.js';
import { BotIdentity } from '../../src/community/identity.js';
import { TimeoutManager, getTimeoutManager, resetTimeoutManager } from '../../src/utils/timeoutManager.js';

describe('Foundation Integration', () => {
  // Set required env vars for all tests
  beforeAll(() => {
    process.env.SERVER_HOST = 'localhost';
    process.env.SERVER_PORT = '25565';
    process.env.SERVER_VERSION = '1.20.4';
    process.env.BOT_NAME = 'TestBot';
    process.env.BOT_OWNER = 'TestOwner';
  });

  afterAll(() => {
    delete process.env.SERVER_HOST;
    delete process.env.SERVER_PORT;
    delete process.env.SERVER_VERSION;
    delete process.env.BOT_NAME;
    delete process.env.BOT_OWNER;
  });

  beforeEach(() => {
    clearConfigCache();
    resetTimeoutManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Config Loading', () => {
    it('should load and validate config', () => {
      const config = loadConfig('./config.json');
      const validated = validateConfig(config);

      expect(validated).toBeDefined();
      expect(validated.server).toBeDefined();
      expect(validated.bot).toBeDefined();
      expect(validated.server.host).toBe('localhost');
      expect(validated.server.port).toBe(25565);
    });

    it('should apply defaults for missing optional fields', () => {
      const minimalConfig = {
        bot: {
          identity: {
            name: 'TestBot',
            owner: 'Owner'
          }
        }
      };

      const validated = validateConfig(minimalConfig);

      // Server defaults
      expect(validated.server).toBeDefined();
      expect(validated.server.host).toBe('localhost');
      expect(validated.server.port).toBe(25565);
      expect(validated.server.version).toBe('1.20.4');
      expect(validated.server.auth).toBe('offline');

      // Bot defaults
      expect(validated.bot.taskTimeout).toBe(1800000);
      expect(validated.bot.reconnectDelay).toBe(5000);
      expect(validated.bot.maxReconnectAttempts).toBe(10);
    });

    it('should reject invalid config', () => {
      const invalidConfig = {
        server: { port: 'not-a-number' },
        bot: { identity: {} }
      };

      expect(() => validateConfig(invalidConfig)).toThrow();
    });
  });

  describe('Logger Creation', () => {
    it('should create logger with level', () => {
      const logger = createLogger({ level: 'debug' });

      expect(logger).toBeDefined();
      expect(logger.level).toBe('debug');
    });

    it('should create module logger', () => {
      const logger = createLogger({ level: 'info' });
      const moduleLogger = logger.module('TestModule');

      expect(moduleLogger.module).toBe('TestModule');
      expect(typeof moduleLogger.debug).toBe('function');
      expect(typeof moduleLogger.info).toBe('function');
      expect(typeof moduleLogger.warn).toBe('function');
      expect(typeof moduleLogger.error).toBe('function');
    });

    it('should use singleton pattern', () => {
      createLogger({ level: 'warn' });
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });

    it('should respect log levels', () => {
      const logger = createLogger({ level: 'warn' });

      expect(logger.shouldLog('error')).toBe(true);
      expect(logger.shouldLog('warn')).toBe(true);
      expect(logger.shouldLog('info')).toBe(false);
      expect(logger.shouldLog('debug')).toBe(false);
    });
  });

  describe('State Manager', () => {
    it('should manage task state', () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        inventory: { items: () => [] }
      };

      const state = new StateManager(mockBot);

      state.setTask({ type: 'test' });
      expect(state.isBusy()).toBe(true);

      state.clearTask();
      expect(state.isBusy()).toBe(false);
    });

    it('should track position and vitals', () => {
      const mockBot = {
        entity: { position: { x: 100, y: 64, z: -200 } },
        health: 15,
        food: 12,
        inventory: { items: () => [] }
      };

      const state = new StateManager(mockBot);

      const pos = state.getPosition();
      expect(pos).toEqual({ x: 100, y: 64, z: -200 });

      const vitals = state.getVitals();
      expect(vitals).toEqual({ health: 15, food: 12 });
    });

    it('should handle following state', () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        inventory: { items: () => [] }
      };

      const state = new StateManager(mockBot);

      state.setFollowing('PlayerName');
      expect(state.following).toBe('PlayerName');

      state.clearFollowing();
      expect(state.following).toBeNull();
    });

    it('should handle death and pending task', () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        inventory: { items: () => [] }
      };

      const state = new StateManager(mockBot);
      state.setTask({ type: 'mining', args: { block: 'stone' } });

      state.handleDeath();

      expect(state.currentTask).toBeNull();
      expect(state.pendingTask).not.toBeNull();
      expect(state.pendingTask.type).toBe('mining');
    });

    it('should export and import state', () => {
      const mockBot = {
        entity: { position: { x: 50, y: 70, z: 50 } },
        health: 18,
        food: 16,
        inventory: { items: () => [{ name: 'stone', count: 32, slot: 0 }] }
      };

      const state = new StateManager(mockBot);
      state.setTask({ type: 'building' });
      state.setFollowing('Player1');

      const exported = state.export();
      expect(exported.currentTask).toBeDefined();
      expect(exported.following).toBe('Player1');
      expect(exported.position).toEqual({ x: 50, y: 70, z: 50 });
      expect(exported.vitals).toEqual({ health: 18, food: 16 });

      const newState = new StateManager(mockBot);
      newState.import(exported);

      expect(newState.following).toBe('Player1');
      expect(newState.pendingTask.type).toBe('building');
    });
  });

  describe('Command Parser', () => {
    it('should parse commands with identity', () => {
      const mockIdentity = {
        isForMe: () => true,
        parseCommand: (username, message) => message.replace('!', '')
      };

      const parser = new CommandParser(mockIdentity);
      const result = parser.parse('Player', '!mine iron 64');

      expect(result.intent).toBe('mine');
      expect(result.args).toEqual(['iron', '64']);
    });

    it('should return null for non-bot commands', () => {
      const mockIdentity = {
        isForMe: () => false,
        parseCommand: () => null
      };

      const parser = new CommandParser(mockIdentity);
      const result = parser.parse('Player', 'random chat message');

      expect(result).toBeNull();
    });

    it('should extract coordinates from command', () => {
      const mockIdentity = {
        isForMe: () => true,
        parseCommand: (u, m) => m.replace('!', '')
      };

      const parser = new CommandParser(mockIdentity);
      const result = parser.parse('Player', '!go 100 64 -200');

      expect(result.intent).toBe('go');
      expect(result.coordinates).toEqual({ x: 100, y: 64, z: -200 });
    });

    it('should detect high priority commands', () => {
      const mockIdentity = {
        isForMe: () => true,
        parseCommand: (u, m) => m.replace('!', '')
      };

      const parser = new CommandParser(mockIdentity);

      expect(parser.isHighPriority('stop')).toBe(true);
      expect(parser.isHighPriority('pare')).toBe(true);
      expect(parser.isHighPriority('mine')).toBe(false);
    });

    it('should return command aliases', () => {
      const mockIdentity = {
        isForMe: () => true,
        parseCommand: (u, m) => m.replace('!', '')
      };

      const parser = new CommandParser(mockIdentity);

      expect(parser.getAliases('mine')).toContain('minerar');
      expect(parser.getAliases('mine')).toContain('mine');
      expect(parser.getAliases('unknown')).toEqual(['unknown']);
    });

    it('should require identity with proper methods', () => {
      expect(() => new CommandParser({})).toThrow('requires identity');
      expect(() => new CommandParser({ isForMe: () => {} })).toThrow('requires identity');
    });
  });

  describe('Timeout Manager', () => {
    it('should manage default timeouts', () => {
      const tm = new TimeoutManager();

      expect(tm.getDefault('skill')).toBe(30000);
      expect(tm.getDefault('llm')).toBe(60000);
      expect(tm.getDefault('pathfinding')).toBe(120000);
      expect(tm.getDefault('unknown')).toBe(30000);
    });

    it('should set default timeout', () => {
      const tm = new TimeoutManager();

      tm.setDefault('custom', 5000);
      expect(tm.getDefault('custom')).toBe(5000);
    });

    it('should create and cancel timeouts', () => {
      jest.useFakeTimers();
      const tm = new TimeoutManager();
      const callback = jest.fn();

      const timeoutId = tm.createTimeout(callback, 1000, 'test');

      expect(tm.getActiveCount()).toBe(1);
      expect(tm.getActiveOperations()).toEqual({ test: 1 });

      tm.cancel(timeoutId);

      expect(tm.getActiveCount()).toBe(0);
    });

    it('should wrap promises with timeout', async () => {
      jest.useFakeTimers();
      const tm = new TimeoutManager();

      const fastPromise = Promise.resolve('done');

      const resultPromise = tm.withTimeout(fastPromise, 5000, 'test');

      await jest.runAllTimersAsync();
      await expect(resultPromise).resolves.toBe('done');

      jest.useRealTimers();
    });

    it('should reject on timeout', async () => {
      jest.useFakeTimers();
      const tm = new TimeoutManager();

      const slowPromise = new Promise(resolve => {
        setTimeout(() => resolve('done'), 5000);
      });

      const resultPromise = tm.withTimeout(slowPromise, 1000, 'test');

      jest.advanceTimersByTime(1500);

      await expect(resultPromise).rejects.toThrow('timeout');
    });

    it('should use singleton pattern', () => {
      resetTimeoutManager();
      const tm1 = getTimeoutManager();
      const tm2 = getTimeoutManager();

      expect(tm1).toBe(tm2);
    });
  });

  describe('Bot Identity', () => {
    let mockBot;

    beforeEach(() => {
      mockBot = {
        username: 'TestBot',
        chat: jest.fn(),
        on: jest.fn(),
        players: {}
      };
    });

    it('should handle single bot mode', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);
      identity.isMultiBotMode = false;

      expect(identity.isForMe('Player', '!mine')).toBe(true);
      expect(identity.isForMe('Player', 'mine')).toBe(false);
    });

    it('should handle multi bot mode with mentions', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);
      identity.isMultiBotMode = true;

      expect(identity.isForMe('Player', '@TestBot mine')).toBe(true);
      expect(identity.isForMe('Player', '@Test mine')).toBe(true);
      expect(identity.isForMe('Player', '!mine')).toBe(false);
    });

    it('should parse commands correctly', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);

      expect(identity.parseCommand('Player', '!mine iron')).toBe('mine iron');
      expect(identity.parseCommand('Player', '@TestBot mine iron')).toBe('mine iron');
      expect(identity.parseCommand('Player', '@Test !mine iron')).toBe('mine iron');
    });

    it('should detect other bots', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);

      identity.detectOtherBot('OtherBot', '[COMM:HELLO] {"name":"OtherBot","owner":"Player2"}');

      expect(identity.knownPeers.has('OtherBot')).toBe(true);
      expect(identity.isMultiBotMode).toBe(true);
    });

    it('should check owner online status', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);

      mockBot.players = { Owner: {} };
      expect(identity.isOwnerOnline()).toBe(true);

      mockBot.players = { OtherPlayer: {} };
      expect(identity.isOwnerOnline()).toBe(false);
    });

    it('should return status', () => {
      const config = {
        bot: {
          identity: {
            name: 'TestBot',
            displayName: 'Test',
            owner: 'Owner'
          },
          response: {
            mode: 'auto',
            defaultPrefix: '!'
          }
        }
      };

      const identity = new BotIdentity(config, mockBot);
      const status = identity.getStatus();

      expect(status.name).toBe('TestBot');
      expect(status.displayName).toBe('Test');
      expect(status.owner).toBe('Owner');
      expect(status.responseMode).toBe('auto');
      expect(status.isMultiBotMode).toBe(false);
      expect(status.knownPeers).toEqual([]);
    });
  });

  describe('Integration: Config to Components', () => {
    it('should create components from loaded config', () => {
      const config = loadConfig('./config.json');

      // Create logger from config
      const logger = createLogger({
        level: config.logging?.level || 'info',
        logDir: config.logging?.logDir || './logs'
      });

      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');

      // Create state manager
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        inventory: { items: () => [] }
      };
      const state = new StateManager(mockBot);

      expect(state).toBeDefined();

      // Create timeout manager
      const tm = new TimeoutManager();

      expect(tm.getDefault('skill')).toBe(config.skills?.executionTimeout || 30000);
    });

    it('should parse command with identity from config', () => {
      const config = loadConfig('./config.json');

      const mockBot = {
        username: config.bot.identity.name,
        chat: jest.fn(),
        on: jest.fn(),
        players: {}
      };

      const identity = new BotIdentity(config, mockBot);
      const parser = new CommandParser(identity);

      // Test command parsing flow
      identity.isMultiBotMode = false;

      const result = parser.parse('Player', '!mine stone 64');

      expect(result).not.toBeNull();
      expect(result.intent).toBe('mine');
      expect(result.args).toEqual(['stone', '64']);
    });
  });

  describe('Integration: State and Timeout', () => {
    it('should integrate state manager with timeout manager', () => {
      jest.useFakeTimers();

      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20,
        inventory: { items: () => [] }
      };

      const state = new StateManager(mockBot);
      const tm = new TimeoutManager();

      // Set task with timeout from timeout manager
      const taskTimeout = tm.getDefault('task');
      state.setTask({ type: 'long_task' }, taskTimeout);

      expect(state.isBusy()).toBe(true);
      expect(state.currentTask.timeout).toBe(1800000);

      // Clear task
      state.clearTask();
      expect(state.isBusy()).toBe(false);

      // Cleanup
      tm.clearAll();
    });
  });
});