// tests/unit/utils/config.test.js

import { loadConfig, validateConfig, get, set, clearConfigCache } from '../../../src/utils/config.js';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Config', () => {
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
  });

  describe('loadConfig', () => {
    it('should load config from file', () => {
      const config = loadConfig('./config.json');
      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.bot).toBeDefined();
    });

    it('should substitute environment variables', () => {
      process.env.TEST_VAR = 'test_value';
      process.env.SERVER_HOST = 'test.example.com';

      clearConfigCache();
      const config = loadConfig('./config.json');

      // If config has ${SERVER_HOST}, it should be substituted
      expect(config.server.host).toBe('test.example.com');

      delete process.env.TEST_VAR;
      process.env.SERVER_HOST = 'localhost';
    });

    it('should throw error for missing config file', () => {
      expect(() => loadConfig('./nonexistent-config-file.json')).toThrow();
    });

    it('should handle missing environment variables gracefully', () => {
      // Save original env
      const originalHost = process.env.SERVER_HOST;
      delete process.env.SERVER_HOST;

      clearConfigCache();
      const config = loadConfig('./config.json');

      // Missing env vars should be replaced with empty string
      // Then transformed config should have defaults applied
      expect(config).toBeDefined();

      // Restore original env
      if (originalHost !== undefined) {
        process.env.SERVER_HOST = originalHost;
      } else {
        process.env.SERVER_HOST = 'localhost';
      }
    });
  });

  describe('get', () => {
    it('should get nested value with dot notation', () => {
      const config = { server: { host: 'localhost' } };
      expect(get(config, 'server.host')).toBe('localhost');
    });

    it('should return default for missing path', () => {
      const config = { server: {} };
      expect(get(config, 'server.port', 25565)).toBe(25565);
    });

    it('should return undefined for missing path without default', () => {
      const config = { server: {} };
      expect(get(config, 'server.missing')).toBeUndefined();
    });

    it('should handle null/undefined values', () => {
      const config = { server: null };
      expect(get(config, 'server.host', 'default')).toBe('default');
    });

    it('should handle deeply nested paths', () => {
      const config = { a: { b: { c: { d: 'value' } } } };
      expect(get(config, 'a.b.c.d')).toBe('value');
    });
  });

  describe('set', () => {
    it('should set nested value with dot notation', () => {
      const config = { server: {} };
      set(config, 'server.host', 'example.com');
      expect(config.server.host).toBe('example.com');
    });

    it('should create intermediate objects', () => {
      const config = {};
      set(config, 'server.host.name', 'test');
      expect(config.server.host.name).toBe('test');
    });

    it('should overwrite existing values', () => {
      const config = { server: { host: 'old' } };
      set(config, 'server.host', 'new');
      expect(config.server.host).toBe('new');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const config = {
        server: { host: 'localhost', port: 25565, version: '1.20.4' },
        bot: { identity: { name: 'TestBot', owner: 'Player' } }
      };
      const result = validateConfig(config);
      expect(result).toBeDefined();
      expect(result.server).toBeDefined();
      expect(result.bot).toBeDefined();
    });

    it('should throw on invalid config', () => {
      const config = { server: { port: 'invalid' } };
      expect(() => validateConfig(config)).toThrow();
    });

    it('should apply defaults for missing optional fields', () => {
      const config = {
        bot: { identity: { name: 'TestBot', owner: 'Player' } }
      };
      const result = validateConfig(config);
      // Server should have defaults
      expect(result.server.host).toBe('localhost');
      expect(result.server.port).toBe(25565);
    });

    it('should require bot identity name', () => {
      const config = {
        bot: { identity: { owner: 'Player' } }
      };
      expect(() => validateConfig(config)).toThrow();
    });

    it('should validate version format', () => {
      const config = {
        server: { host: 'localhost', port: 25565, version: 'invalid-version' },
        bot: { identity: { name: 'TestBot', owner: 'Player' } }
      };
      expect(() => validateConfig(config)).toThrow();
    });

    it('should validate port range', () => {
      const config = {
        server: { host: 'localhost', port: 99999 },
        bot: { identity: { name: 'TestBot', owner: 'Player' } }
      };
      expect(() => validateConfig(config)).toThrow();
    });
  });
});