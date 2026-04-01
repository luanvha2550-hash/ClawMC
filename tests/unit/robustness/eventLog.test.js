import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { EventLogger, LogLevel, createEventLogger, getEventLogger } from '../../../src/robustness/eventLog.js';

describe('EventLogger', () => {
  let eventLog;
  let testLogDir;

  beforeEach(async () => {
    // Create unique test directory for each test
    testLogDir = path.join('./tests/tmp', `eventlog-test-${Date.now()}`);
    await fs.mkdir(testLogDir, { recursive: true });

    eventLog = new EventLogger({
      logDir: testLogDir,
      flushInterval: 100,
      minLevel: LogLevel.DEBUG
    });
  });

  afterEach(async () => {
    try {
      await eventLog.close();
    } catch (e) {
      // Ignore
    }
    // Clean up test directory
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore
    }
  });

  describe('LogLevel', () => {
    it('should have correct level values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.CRITICAL).toBe(4);
    });
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const defaultLog = new EventLogger();
      expect(defaultLog.logDir).toBe('./logs');
      expect(defaultLog.flushInterval).toBe(5000);
      expect(defaultLog.maxFileSize).toBe(10 * 1024 * 1024);
      expect(defaultLog.maxFiles).toBe(7);
    });

    it('should accept custom config', () => {
      const customLog = new EventLogger({
        logDir: './custom-logs',
        flushInterval: 10000,
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 5,
        minLevel: LogLevel.WARN
      });
      expect(customLog.logDir).toBe('./custom-logs');
      expect(customLog.flushInterval).toBe(10000);
      expect(customLog.maxFileSize).toBe(5 * 1024 * 1024);
      expect(customLog.maxFiles).toBe(5);
      expect(customLog.minLevel).toBe(LogLevel.WARN);
    });
  });

  describe('init()', () => {
    it('should initialize the event logger', async () => {
      await eventLog.init();
      expect(eventLog.initialized).toBe(true);
    });

    it('should create log directory', async () => {
      await eventLog.init();
      const stats = await fs.stat(testLogDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should start flush timer', async () => {
      await eventLog.init();
      expect(eventLog.flushTimer).toBeDefined();
    });
  });

  describe('log()', () => {
    beforeEach(async () => {
      await eventLog.init();
    });

    it('should log with specified level', () => {
      eventLog.log(LogLevel.INFO, 'test', 'event', { key: 'value' });
      expect(eventLog.buffer).toHaveLength(1);
      expect(eventLog.buffer[0].level).toBe('INFO');
    });

    it('should filter by min level', () => {
      const filteredLog = new EventLogger({
        logDir: testLogDir,
        minLevel: LogLevel.WARN
      });
      filteredLog.log(LogLevel.DEBUG, 'test', 'debug_event');
      filteredLog.log(LogLevel.INFO, 'test', 'info_event');
      filteredLog.log(LogLevel.WARN, 'test', 'warn_event');

      expect(filteredLog.buffer).toHaveLength(1);
      expect(filteredLog.buffer[0].level).toBe('WARN');
    });

    it('should emit log event', (done) => {
      eventLog.on('log', (entry) => {
        expect(entry.category).toBe('test');
        expect(entry.event).toBe('my_event');
        done();
      });
      eventLog.log(LogLevel.INFO, 'test', 'my_event');
    });

    it('should include timestamp', () => {
      eventLog.log(LogLevel.INFO, 'test', 'event');
      expect(eventLog.buffer[0].timestamp).toBeDefined();
    });
  });

  describe('Convenience methods', () => {
    beforeEach(async () => {
      await eventLog.init();
    });

    it('should log debug', () => {
      eventLog.debug('cat', 'evt');
      expect(eventLog.buffer[0].level).toBe('DEBUG');
    });

    it('should log info', () => {
      eventLog.info('cat', 'evt');
      expect(eventLog.buffer[0].level).toBe('INFO');
    });

    it('should log warn', () => {
      eventLog.warn('cat', 'evt');
      expect(eventLog.buffer[0].level).toBe('WARN');
    });

    it('should log error', () => {
      eventLog.error('cat', 'evt');
      expect(eventLog.buffer[0].level).toBe('ERROR');
    });

    it('should log critical', () => {
      eventLog.critical('cat', 'evt');
      expect(eventLog.buffer[0].level).toBe('CRITICAL');
    });
  });

  describe('Specialized logging methods', () => {
    beforeEach(async () => {
      await eventLog.init();
    });

    it('should log LLM call success', () => {
      eventLog.logLLMCall('openai', 'gpt-4', 500, 1500, true);
      expect(eventLog.buffer[0].category).toBe('llm');
      expect(eventLog.buffer[0].event).toBe('call_success');
      expect(eventLog.buffer[0].provider).toBe('openai');
      expect(eventLog.buffer[0].tokens).toBe(500);
    });

    it('should log LLM call failure', () => {
      eventLog.logLLMCall('openai', 'gpt-4', 0, 5000, false);
      expect(eventLog.buffer[0].event).toBe('call_failed');
    });

    it('should log skill execution success', () => {
      eventLog.logSkillExecution('harvest_wood', 3000, true);
      expect(eventLog.buffer[0].category).toBe('skill');
      expect(eventLog.buffer[0].event).toBe('execution_success');
      expect(eventLog.buffer[0].skillName).toBe('harvest_wood');
    });

    it('should log skill execution failure', () => {
      eventLog.logSkillExecution('craft_item', 1000, false, 'Missing materials');
      expect(eventLog.buffer[0].event).toBe('execution_failed');
      expect(eventLog.buffer[0].error).toBe('Missing materials');
    });

    it('should log bot death', () => {
      eventLog.logBotDeath({ x: 100, y: 64, z: -200 }, 'Zombie', 1);
      expect(eventLog.buffer[0].category).toBe('bot');
      expect(eventLog.buffer[0].event).toBe('death');
      expect(eventLog.buffer[0].level).toBe('CRITICAL');
      expect(eventLog.buffer[0].cause).toBe('Zombie');
    });

    it('should log disconnect', () => {
      eventLog.logDisconnect('Connection lost', 2);
      expect(eventLog.buffer[0].category).toBe('connection');
      expect(eventLog.buffer[0].event).toBe('disconnect');
      expect(eventLog.buffer[0].reason).toBe('Connection lost');
    });

    it('should log memory warning', () => {
      eventLog.logMemoryWarning(256, 512, 50);
      expect(eventLog.buffer[0].category).toBe('system');
      expect(eventLog.buffer[0].event).toBe('memory_warning');
      expect(eventLog.buffer[0].percentage).toBe(50);
    });
  });

  describe('flush()', () => {
    beforeEach(async () => {
      await eventLog.init();
    });

    it('should flush buffer to file', async () => {
      eventLog.log(LogLevel.INFO, 'test', 'event1');
      eventLog.log(LogLevel.INFO, 'test', 'event2');

      await eventLog.flush();

      // Read file and check contents
      const files = await fs.readdir(testLogDir);
      const logFile = files.find(f => f.endsWith('.jsonl'));
      expect(logFile).toBeDefined();

      const content = await fs.readFile(path.join(testLogDir, logFile), 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });

    it('should clear buffer after flush', async () => {
      eventLog.log(LogLevel.INFO, 'test', 'event');
      await eventLog.flush();
      expect(eventLog.buffer).toHaveLength(0);
    });

    it('should handle empty buffer', async () => {
      await eventLog.flush(); // Should not throw
      expect(eventLog.buffer).toHaveLength(0);
    });
  });

  describe('close()', () => {
    it('should flush and stop timer', async () => {
      await eventLog.init();
      eventLog.log(LogLevel.INFO, 'test', 'event');

      await eventLog.close();

      expect(eventLog.initialized).toBe(false);
      expect(eventLog.flushTimer).toBeNull();
    });
  });

  describe('Auto-flush on buffer full', () => {
    it('should auto-flush when buffer reaches size', async () => {
      const smallBufferLog = new EventLogger({
        logDir: testLogDir,
        bufferSize: 3,
        flushInterval: 60000 // Long interval to not interfere
      });

      await smallBufferLog.init();

      // Add events to fill buffer
      smallBufferLog.info('test', 'event1');
      smallBufferLog.info('test', 'event2');
      smallBufferLog.info('test', 'event3');

      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(smallBufferLog.buffer).toHaveLength(0);

      await smallBufferLog.close();
    });
  });

  describe('Singleton functions', () => {
    it('should create singleton with createEventLogger', () => {
      const instance1 = createEventLogger({ logDir: testLogDir });
      const instance2 = getEventLogger();
      expect(instance1).toBe(instance2);
    });
  });
});