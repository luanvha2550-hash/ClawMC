import { jest } from '@jest/globals';
import { ReconnectionManager } from '../../../src/core/reconnection.js';

describe('ReconnectionManager', () => {
  let manager;
  let mockBot;
  let mockRobustness;
  let mockCreateBot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout');
    jest.spyOn(global, 'clearTimeout');

    mockBot = {
      config: { server: { host: 'localhost', port: 25565 } },
      on: jest.fn(),
      emit: jest.fn(),
      entity: null
    };

    mockRobustness = {
      checkpoint: {
        save: jest.fn().mockResolvedValue(true)
      },
      restoreFromCheckpoint: jest.fn().mockResolvedValue(true),
      eventLog: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        critical: jest.fn()
      }
    };

    // Create mock createBot function for dependency injection
    mockCreateBot = jest.fn();

    manager = new ReconnectionManager(mockBot, mockRobustness, {
      baseDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 5,
      resetAfter: 60000,
      _createBot: mockCreateBot
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultManager = new ReconnectionManager(mockBot, mockRobustness);
      expect(defaultManager.config.baseDelay).toBe(5000);
      expect(defaultManager.config.maxDelay).toBe(300000);
      expect(defaultManager.config.maxAttempts).toBe(10);
      expect(defaultManager.config.resetAfter).toBe(300000);
    });

    it('should initialize with custom config', () => {
      expect(manager.config.baseDelay).toBe(1000);
      expect(manager.config.maxDelay).toBe(30000);
      expect(manager.config.maxAttempts).toBe(5);
      expect(manager.config.resetAfter).toBe(60000);
    });

    it('should initialize with zero attempts', () => {
      expect(manager.attempts).toBe(0);
    });
  });

  describe('init', () => {
    it('should register event handlers', () => {
      manager.init();

      expect(mockBot.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('kicked', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('spawn', expect.any(Function));
    });
  });

  describe('handleDisconnect', () => {
    it('should schedule reconnection with exponential backoff', async () => {
      await manager.handleDisconnect('test');

      // First attempt: baseDelay
      expect(manager.attempts).toBe(1);
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('should increase delay exponentially', async () => {
      manager.attempts = 2;
      await manager.handleDisconnect('test');

      // Third attempt: baseDelay * 2^2 = 4000
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
    });

    it('should cap delay at maxDelay', async () => {
      // Create a manager with higher maxAttempts to allow high delay
      const highLimitManager = new ReconnectionManager(mockBot, mockRobustness, {
        baseDelay: 1000,
        maxDelay: 30000,
        maxAttempts: 20,  // Higher than needed for this test
        _createBot: mockCreateBot
      });

      // Use attempts that's below maxAttempts but high enough for delay to exceed maxDelay
      // baseDelay * 2^5 = 1000 * 32 = 32000 > maxDelay (30000)
      highLimitManager.attempts = 5;
      await highLimitManager.handleDisconnect('test');

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should not attempt after maxAttempts', async () => {
      manager.attempts = 5;
      await manager.handleDisconnect('test');

      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('should save checkpoint before reconnecting', async () => {
      await manager.handleDisconnect('test');

      expect(mockRobustness.checkpoint.save).toHaveBeenCalledWith('disconnect');
    });

    it('should log critical event when max attempts reached', async () => {
      manager.attempts = 5;
      await manager.handleDisconnect('test');

      expect(mockRobustness.eventLog.critical).toHaveBeenCalledWith(
        'CONNECTION',
        'max_attempts_reached',
        expect.objectContaining({
          reason: 'test',
          attempts: 5
        })
      );
    });
  });

  describe('reconnect', () => {
    it('should not reconnect if already reconnecting', async () => {
      manager.isReconnecting = true;
      manager.attempts = 3;

      await manager.reconnect('test');

      // Should not change attempts since it returned early
      expect(manager.attempts).toBe(3);
    });

    it('should create bot with server config', async () => {
      manager.isReconnecting = false;

      // Create a mock bot that calls spawn callback synchronously
      const mockNewBot = {
        once: jest.fn((event, callback) => {
          if (event === 'spawn') {
            callback();
          }
        })
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      await manager.reconnect('test');

      expect(mockCreateBot).toHaveBeenCalledWith(mockBot.config.server);
    });

    it('should reset attempts on successful reconnection', async () => {
      manager.attempts = 3;
      manager.isReconnecting = false;

      const mockNewBot = {
        once: jest.fn((event, callback) => {
          if (event === 'spawn') {
            callback();
          }
        })
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      await manager.reconnect('test');

      expect(manager.attempts).toBe(0);
      expect(manager.isReconnecting).toBe(false);
    });

    it('should call restoreFromCheckpoint on success', async () => {
      manager.isReconnecting = false;

      const mockNewBot = {
        once: jest.fn((event, callback) => {
          if (event === 'spawn') {
            callback();
          }
        })
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      await manager.reconnect('test');

      expect(mockRobustness.restoreFromCheckpoint).toHaveBeenCalled();
    });

    it('should handle reconnection timeout', async () => {
      manager.attempts = 0;
      manager.isReconnecting = false;

      // Bot that never emits spawn (timeout scenario)
      const mockNewBot = {
        once: jest.fn(() => {
          // Never calls callback
        })
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      // Start reconnection
      const promise = manager.reconnect('test');

      // Advance timers past the 30 second timeout
      jest.advanceTimersByTime(31000);

      await promise;

      // Should have scheduled a retry via handleDisconnect
      expect(manager.attempts).toBeGreaterThan(0);
    });

    it('should handle bot error during reconnection', async () => {
      manager.attempts = 0;
      manager.isReconnecting = false;

      // Bot that emits error
      const mockNewBot = {
        once: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('Connection failed'));
          }
        })
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      const promise = manager.reconnect('test');

      // Advance timers to allow error to be processed
      jest.advanceTimersByTime(100);

      await promise;

      // Should have scheduled a retry
      expect(manager.attempts).toBeGreaterThan(0);
    });

    it('should re-register event handlers after reconnection', async () => {
      manager.attempts = 3;
      manager.isReconnecting = false;

      const mockNewBot = {
        once: jest.fn((event, callback) => {
          if (event === 'spawn') {
            callback();
          }
        }),
        on: jest.fn()
      };
      mockCreateBot.mockReturnValue(mockNewBot);

      // Initialize manager to register initial handlers
      manager.init();
      mockBot.on.mockClear();

      await manager.reconnect('test');

      // Verify init() was called to re-register handlers on new bot
      expect(mockBot.on).toHaveBeenCalled();
      expect(mockBot.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('kicked', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockBot.on).toHaveBeenCalledWith('spawn', expect.any(Function));
      expect(manager.attempts).toBe(0);
    });
  });

  describe('forceReconnect', () => {
    it('should clear existing timer and reset attempts', () => {
      manager.attempts = 3;
      manager.reconnectTimer = setTimeout(() => {}, 10000);

      manager.forceReconnect();

      expect(manager.attempts).toBe(0);
      expect(clearTimeout).toHaveBeenCalled();
    });

    it('should handle no existing timer gracefully', () => {
      manager.attempts = 3;
      manager.reconnectTimer = null;

      manager.forceReconnect();

      expect(manager.attempts).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      manager.attempts = 2;
      manager.isReconnecting = true;
      // Use a date that can be converted to ISO string
      manager.lastAttempt = 1000000;

      const status = manager.getStatus();

      expect(status.attempts).toBe(2);
      expect(status.maxAttempts).toBe(5);
      expect(status.isReconnecting).toBe(true);
      // 1000000 ms = 16 minutes 40 seconds from epoch
      expect(status.lastAttempt).toBe('1970-01-01T00:16:40.000Z');
    });

    it('should return null lastAttempt when never attempted', () => {
      manager.lastAttempt = 0;

      const status = manager.getStatus();

      expect(status.lastAttempt).toBeNull();
    });
  });
});