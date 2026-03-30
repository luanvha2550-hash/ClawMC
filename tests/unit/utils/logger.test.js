import { jest } from '@jest/globals';
import { Logger, createLogger, getLogger } from '../../../src/utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    logger = new Logger({ level: 'debug' });
  });

  afterEach(() => {
    // Restore console spies
    jest.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log debug messages when level is debug', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.debug('test', 'Debug message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      logger.info('test', 'Info message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      logger.warn('test', 'Warn message');
      expect(spy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation();
      logger.error('test', 'Error message');
      expect(spy).toHaveBeenCalled();
    });

    it('should not log debug messages when level is info', () => {
      const infoLogger = new Logger({ level: 'info' });
      const spy = jest.spyOn(console, 'log').mockImplementation();
      infoLogger.debug('test', 'Debug message');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not log info messages when level is warn', () => {
      const warnLogger = new Logger({ level: 'warn' });
      const spy = jest.spyOn(console, 'log').mockImplementation();
      warnLogger.info('test', 'Info message');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('module logger', () => {
    it('should create module-specific logger', () => {
      const moduleLogger = logger.module('TestModule');
      expect(moduleLogger.module).toBe('TestModule');
    });

    it('should log with module name', () => {
      const spy = jest.spyOn(console, 'log').mockImplementation();
      const moduleLogger = logger.module('TestModule');
      moduleLogger.info('Info from module');
      expect(spy).toHaveBeenCalled();
      const call = spy.mock.calls[0];
      expect(call[0]).toContain('TestModule');
    });
  });

  describe('file output', () => {
    const testLogDir = './tests/tmp/logs';

    beforeEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testLogDir, { recursive: true, force: true });
      } catch (e) {
        // Directory doesn't exist, that's fine
      }
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testLogDir, { recursive: true, force: true });
      } catch (e) {
        // Directory doesn't exist, that's fine
      }
    });

    it('should write to file when configured', async () => {
      const fileLogger = new Logger({
        level: 'info',
        logDir: testLogDir,
        maxFileSize: 10485760,
        maxFiles: 7
      });

      await fileLogger.init();
      fileLogger.info('test', 'File message');

      // Wait a bit for async write
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file exists
      const files = await fs.readdir(testLogDir);
      expect(files.some(f => f.startsWith('bot-'))).toBe(true);
    });
  });

  describe('formatMessage', () => {
    it('should format message as JSON', () => {
      const formatted = logger.formatMessage('info', 'TestModule', 'Test message');
      const parsed = JSON.parse(formatted);

      expect(parsed.level).toBe('INFO');
      expect(parsed.module).toBe('TestModule');
      expect(parsed.message).toBe('Test message');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include extra data in message', () => {
      const formatted = logger.formatMessage('error', 'TestModule', 'Error occurred', { code: 'ERR001' });
      const parsed = JSON.parse(formatted);

      expect(parsed.code).toBe('ERR001');
    });
  });
});

describe('createLogger and getLogger', () => {
  it('should create a singleton instance', () => {
    const instance1 = createLogger({ level: 'debug' });
    const instance2 = getLogger();

    expect(instance2).toBe(instance1);
  });

  it('should return default instance if createLogger not called', async () => {
    // Access the module's getLogger (it may have instance from previous tests)
    const instance = getLogger();
    expect(instance).toBeInstanceOf(Logger);
  });
});