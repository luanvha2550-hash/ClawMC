import { jest } from '@jest/globals';

/**
 * Graceful Shutdown Tests for ClawMC Robustness Layer
 */

describe('GracefulShutdown', () => {
  let GracefulShutdown;

  // Store original process methods
  const originalExit = process.exit;
  const originalListeners = {
    SIGINT: [],
    SIGTERM: [],
    uncaughtException: [],
    unhandledRejection: []
  };

  beforeAll(async () => {
    // Store original listeners
    originalListeners.SIGINT = process.listeners('SIGINT').slice();
    originalListeners.SIGTERM = process.listeners('SIGTERM').slice();
    originalListeners.uncaughtException = process.listeners('uncaughtException').slice();
    originalListeners.unhandledRejection = process.listeners('unhandledRejection').slice();

    // Mock process.exit to prevent actual exit
    process.exit = jest.fn();

    jest.resetModules();

    // Mock the logger module
    jest.mock('../../../src/utils/logger.js', () => ({
      getLogger: () => ({
        module: () => ({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        })
      })
    }));
  });

  afterAll(() => {
    // Restore original exit
    process.exit = originalExit;

    // Restore original listeners
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    originalListeners.SIGINT.forEach(handler => process.on('SIGINT', handler));
    originalListeners.SIGTERM.forEach(handler => process.on('SIGTERM', handler));
    originalListeners.uncaughtException.forEach(handler => process.on('uncaughtException', handler));
    originalListeners.unhandledRejection.forEach(handler => process.on('unhandledRejection', handler));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.exit.mockReset();
  });

  describe('constructor', () => {
    it('should create instance with default options', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      expect(gracefulShutdown.timeout).toBe(30000);
      expect(gracefulShutdown.checkpointOnShutdown).toBe(true);
    });

    it('should accept custom options', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const mockCheckpointManager = { initialized: true, save: jest.fn(), close: jest.fn() };

      const gracefulShutdown = new GracefulShutdown({
        bot: mockBot,
        checkpointManager: mockCheckpointManager,
        timeout: 60000,
        checkpointOnShutdown: false
      });

      expect(gracefulShutdown.bot).toBe(mockBot);
      expect(gracefulShutdown.checkpointManager).toBe(mockCheckpointManager);
      expect(gracefulShutdown.timeout).toBe(60000);
      expect(gracefulShutdown.checkpointOnShutdown).toBe(false);
    });
  });

  describe('init', () => {
    it('should initialize successfully', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      expect(gracefulShutdown.initialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();
      gracefulShutdown.init();

      expect(gracefulShutdown.initialized).toBe(true);
    });

    it('should register signal handlers', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      const sigintListeners = process.listeners('SIGINT');
      const sigtermListeners = process.listeners('SIGTERM');

      expect(sigintListeners.length).toBeGreaterThan(0);
      expect(sigtermListeners.length).toBeGreaterThan(0);
    });

    it('should register error handlers', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      const uncaughtListeners = process.listeners('uncaughtException');
      const rejectionListeners = process.listeners('unhandledRejection');

      expect(uncaughtListeners.length).toBeGreaterThan(0);
      expect(rejectionListeners.length).toBeGreaterThan(0);
    });
  });

  describe('registerHandler', () => {
    it('should register custom handler', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      const handler = jest.fn();
      gracefulShutdown.registerHandler('test', handler);

      expect(gracefulShutdown.handlers.has('custom:test')).toBe(true);
    });

    it('should throw if handler is not a function', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      expect(() => gracefulShutdown.registerHandler('test', 'not a function'))
        .toThrow('must be a function');
    });
  });

  describe('addCleanupTask', () => {
    it('should add cleanup task', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      const task = jest.fn();
      gracefulShutdown.addCleanupTask(task);

      expect(gracefulShutdown.cleanupTasks).toHaveLength(1);
    });

    it('should throw if task is not a function', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();

      expect(() => gracefulShutdown.addCleanupTask('not a function'))
        .toThrow('must be a function');
    });
  });

  describe('isShuttingDown', () => {
    it('should return current shutdown state', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      expect(gracefulShutdown.isShuttingDown()).toBe(false);

      gracefulShutdown.shuttingDown = true;
      expect(gracefulShutdown.isShuttingDown()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return status object', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockCheckpointManager = { initialized: true };
      const gracefulShutdown = new GracefulShutdown({
        checkpointManager: mockCheckpointManager,
        checkpointOnShutdown: true
      });
      gracefulShutdown.init();
      gracefulShutdown.addCleanupTask(() => {});

      const status = gracefulShutdown.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.shuttingDown).toBe(false);
      expect(status.handlersCount).toBeGreaterThan(0);
      expect(status.cleanupTasksCount).toBe(1);
      expect(status.checkpointOnShutdown).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should set shuttingDown flag', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({
        bot: mockBot,
        timeout: 1000
      });
      gracefulShutdown.init();

      const shutdownPromise = gracefulShutdown.shutdown('manual');

      expect(gracefulShutdown.shuttingDown).toBe(true);
    });

    it('should not shutdown twice', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.shuttingDown = true;

      await gracefulShutdown.shutdown('manual');

      // Should return early without error
      expect(gracefulShutdown.shuttingDown).toBe(true);
    });

    it('should run cleanup tasks', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const task = jest.fn();
      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });
      gracefulShutdown.init();
      gracefulShutdown.addCleanupTask(task);

      await gracefulShutdown.shutdown('manual');

      expect(task).toHaveBeenCalled();
    });

    it('should close bot connection', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });
      gracefulShutdown.init();

      await gracefulShutdown.shutdown('manual');

      expect(mockBot.end).toHaveBeenCalled();
      expect(mockBot.emit).toHaveBeenCalledWith('graceful_shutdown');
    });

    it('should create checkpoint if enabled', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const mockCheckpointManager = {
        initialized: true,
        save: jest.fn().mockResolvedValue(1),
        close: jest.fn()
      };
      const gracefulShutdown = new GracefulShutdown({
        bot: mockBot,
        checkpointManager: mockCheckpointManager
      });
      gracefulShutdown.init();

      await gracefulShutdown.shutdown('manual');

      expect(mockCheckpointManager.save).toHaveBeenCalled();
    });

    it('should skip checkpoint if disabled', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const mockCheckpointManager = {
        initialized: true,
        save: jest.fn(),
        close: jest.fn()
      };
      const gracefulShutdown = new GracefulShutdown({
        bot: mockBot,
        checkpointManager: mockCheckpointManager,
        checkpointOnShutdown: false
      });
      gracefulShutdown.init();

      await gracefulShutdown.shutdown('manual');

      expect(mockCheckpointManager.save).not.toHaveBeenCalled();
    });

    it('should run custom handlers', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const handler = jest.fn();
      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });
      gracefulShutdown.init();
      gracefulShutdown.registerHandler('test', handler);

      await gracefulShutdown.shutdown('manual');

      expect(handler).toHaveBeenCalledWith('manual', null);
    });

    it('should call process.exit with 0 for normal shutdown', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });
      gracefulShutdown.init();

      await gracefulShutdown.shutdown('manual');

      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  describe('_closeBot', () => {
    it('should close bot connection', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = { end: jest.fn(), emit: jest.fn() };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });

      await gracefulShutdown._closeBot();

      expect(mockBot.end).toHaveBeenCalled();
      expect(mockBot.emit).toHaveBeenCalledWith('graceful_shutdown');
    });

    it('should handle missing bot', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();

      // Should not throw
      await gracefulShutdown._closeBot();
    });

    it('should handle bot.end error', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockBot = {
        end: jest.fn().mockImplementation(() => { throw new Error('End error'); }),
        emit: jest.fn()
      };
      const gracefulShutdown = new GracefulShutdown({ bot: mockBot });

      // Should not throw
      await gracefulShutdown._closeBot();
    });
  });

  describe('_createCheckpoint', () => {
    it('should create checkpoint', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockCheckpointManager = {
        initialized: true,
        save: jest.fn().mockResolvedValue(1)
      };
      const gracefulShutdown = new GracefulShutdown({ checkpointManager: mockCheckpointManager });

      await gracefulShutdown._createCheckpoint('manual');

      expect(mockCheckpointManager.save).toHaveBeenCalled();
    });

    it('should handle checkpoint manager not initialized', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockCheckpointManager = {
        initialized: false,
        save: jest.fn()
      };
      const gracefulShutdown = new GracefulShutdown({ checkpointManager: mockCheckpointManager });

      // Should not throw
      await gracefulShutdown._createCheckpoint('manual');
    });

    it('should handle checkpoint save error', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const mockCheckpointManager = {
        initialized: true,
        save: jest.fn().mockRejectedValue(new Error('Save error'))
      };
      const gracefulShutdown = new GracefulShutdown({ checkpointManager: mockCheckpointManager });

      // Should not throw
      await gracefulShutdown._createCheckpoint('manual');
    });
  });

  describe('restoreOriginalHandlers', () => {
    it('should restore original handlers', async () => {
      const module = await import('../../../src/robustness/gracefulShutdown.js');
      GracefulShutdown = module.GracefulShutdown;

      const gracefulShutdown = new GracefulShutdown();
      gracefulShutdown.init();

      // Should not throw
      gracefulShutdown.restoreOriginalHandlers();
    });
  });
});