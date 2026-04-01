import { jest } from '@jest/globals';
import { TurnLimiter, createTurnLimiter, getTurnLimiter, resetTurnLimiter } from '../../../src/skills/turnLimiter.js';

describe('TurnLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new TurnLimiter();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetTurnLimiter();
  });

  describe('startGeneration', () => {
    it('should start a new generation cycle', () => {
      const task = { type: 'mining', params: { block: 'stone' } };
      const cycleInfo = limiter.startGeneration(task);

      expect(cycleInfo.cycleId).toBe(1);
      expect(cycleInfo.task).toBe(task);
      expect(limiter.currentTask).toBe(task);
    });

    it('should increment cycle count on each start', () => {
      limiter.startGeneration({ type: 'task1' });
      limiter.startGeneration({ type: 'task2' });
      limiter.startGeneration({ type: 'task3' });

      const status = limiter.getStatus();
      expect(status.stats.totalCycles).toBe(3);
    });

    it('should reset attempts and errors on new cycle', () => {
      limiter.startGeneration({ type: 'task1' });
      limiter.recordError(new Error('test error'));

      // Start new cycle should reset
      limiter.startGeneration({ type: 'task2' });

      const status = limiter.getStatus();
      expect(status.attempts).toBe(0);
      expect(status.errors).toHaveLength(0);
    });
  });

  describe('canRetry', () => {
    it('should allow retry when under max attempts', () => {
      limiter.startGeneration({ type: 'task' });

      const result = limiter.canRetry(new Error('test'));
      expect(result.canRetry).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should deny retry when max attempts reached', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error1'));
      limiter.recordError(new Error('error2'));
      limiter.recordError(new Error('error3'));

      const result = limiter.canRetry(new Error('error4'));
      expect(result.canRetry).toBe(false);
      expect(result.reason).toBe('max_attempts_reached');
    });

    it('should deny retry on repeated errors', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('Same error message'));

      // Same error repeated
      const result = limiter.canRetry(new Error('Same error message'));
      expect(result.canRetry).toBe(false);
      expect(result.reason).toBe('repeated_error');
    });

    it('should allow different errors', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('First error'));

      const result = limiter.canRetry(new Error('Different error'));
      expect(result.canRetry).toBe(true);
    });

    it('should return remaining attempts', () => {
      limiter.startGeneration({ type: 'task' });

      let result = limiter.canRetry(new Error('test'));
      expect(result.remainingAttempts).toBe(2);

      limiter.recordError(new Error('error1'));
      result = limiter.canRetry(new Error('test'));
      expect(result.remainingAttempts).toBe(1);
    });
  });

  describe('recordError', () => {
    it('should increment attempts on error', () => {
      limiter.startGeneration({ type: 'task' });

      limiter.recordError(new Error('error1'));
      expect(limiter.attempts).toBe(1);

      limiter.recordError(new Error('error2'));
      expect(limiter.attempts).toBe(2);
    });

    it('should track errors with timestamps', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('test error'));

      expect(limiter.errors).toHaveLength(1);
      expect(limiter.errors[0].message).toBe('test error');
      expect(limiter.errors[0].timestamp).toBeDefined();
      expect(limiter.errors[0].attempt).toBe(1);
    });

    it('should count repeated errors', () => {
      limiter.startGeneration({ type: 'task' });

      limiter.recordError(new Error('Same error'));
      limiter.recordError(new Error('Same error'));
      limiter.recordError(new Error('Same error'));

      const repeated = limiter._getRepeatedErrors();
      expect(repeated).toHaveLength(1);
      expect(repeated[0].count).toBe(3);
    });

    it('should normalize similar errors', () => {
      limiter.startGeneration({ type: 'task' });

      // These should be considered similar due to normalization
      limiter.recordError(new Error('Timeout after 5000ms'));
      limiter.recordError(new Error('Timeout after 3000ms'));

      const repeated = limiter._getRepeatedErrors();
      expect(repeated).toHaveLength(1);
    });
  });

  describe('recordSuccess', () => {
    it('should record successful cycle', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('first try failed'));
      limiter.recordError(new Error('second try failed'));

      limiter.recordSuccess();

      const status = limiter.getStatus();
      expect(status.stats.successfulCycles).toBe(1);
      expect(status.attempts).toBe(0);
    });

    it('should return cycle info on success', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('failed once'));

      const result = limiter.recordSuccess();
      expect(result.attempts).toBe(1);
      expect(result.cycleId).toBeDefined();
    });
  });

  describe('generateErrorContext', () => {
    it('should return null when no errors', () => {
      limiter.startGeneration({ type: 'task' });

      const context = limiter.generateErrorContext();
      expect(context).toBeNull();
    });

    it('should generate context with last error', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('Timeout error'));

      const context = limiter.generateErrorContext();
      expect(context.lastError).toBe('Timeout error');
      expect(context.allErrors).toHaveLength(1);
      expect(context.attempts).toBe(1);
    });

    it('should include error summary', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('Timeout after 5000ms'));
      limiter.recordError(new Error('Not found: block'));

      const context = limiter.generateErrorContext();
      expect(context.summary).toBeDefined();
      expect(context.summary.total).toBe(2);
      expect(context.summary.unique).toBe(2);
    });

    it('should include suggestion based on error type', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('Timeout occurred'));

      const context = limiter.generateErrorContext();
      expect(context.suggestion).toContain('timeout');
    });
  });

  describe('handleLimitReached', () => {
    it('should return failure info', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error1'));
      limiter.recordError(new Error('error2'));
      limiter.recordError(new Error('error3'));

      const result = limiter.handleLimitReached();
      expect(result.cycleId).toBe(1);
      expect(result.attempts).toBe(3);
      expect(result.errors).toHaveLength(3);
    });

    it('should increment failed cycles count', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error'));
      limiter.recordError(new Error('error'));
      limiter.recordError(new Error('error'));

      limiter.handleLimitReached();

      const status = limiter.getStatus();
      expect(status.stats.failedCycles).toBe(1);
    });
  });

  describe('shouldUseFallback', () => {
    it('should return false initially', () => {
      limiter.startGeneration({ type: 'task' });
      expect(limiter.shouldUseFallback()).toBe(false);
    });

    it('should return false after 1 error (below threshold)', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error1'));

      expect(limiter.shouldUseFallback()).toBe(false);
    });

    it('should return true after reaching threshold failures', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error1'));
      limiter.recordError(new Error('error2'));

      expect(limiter.shouldUseFallback()).toBe(true);
    });

    it('should respect configured threshold', () => {
      const customLimiter = new TurnLimiter({ fallbackThreshold: 3 });
      customLimiter.startGeneration({ type: 'task' });
      customLimiter.recordError(new Error('error1'));
      customLimiter.recordError(new Error('error2'));

      // Still below threshold (2 < 3)
      expect(customLimiter.shouldUseFallback()).toBe(false);

      customLimiter.recordError(new Error('error3'));
      // Now at threshold (3 >= 3)
      expect(customLimiter.shouldUseFallback()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      limiter.startGeneration({ type: 'mining' });
      limiter.recordError(new Error('test'));

      const status = limiter.getStatus();

      expect(status.currentTask).toBeDefined();
      expect(status.attempts).toBe(1);
      expect(status.remainingAttempts).toBe(2);
      expect(status.canRetry).toBe(true);
      expect(status.errors).toHaveLength(1);
      expect(status.stats).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      limiter.startGeneration({ type: 'task' });
      limiter.recordError(new Error('error'));

      limiter.reset();

      const status = limiter.getStatus();
      expect(status.currentTask).toBeNull();
      expect(status.attempts).toBe(0);
      expect(status.stats.totalCycles).toBe(0);
    });
  });

  describe('error categorization', () => {
    it('should categorize timeout errors', () => {
      expect(limiter._categorizeError('Timeout after 5000ms')).toBe('timeout');
    });

    it('should categorize not found errors', () => {
      expect(limiter._categorizeError('Block not found')).toBe('not_found');
    });

    it('should categorize validation errors', () => {
      expect(limiter._categorizeError('Invalid parameter')).toBe('validation');
    });

    it('should categorize network errors', () => {
      expect(limiter._categorizeError('Network error')).toBe('network');
      expect(limiter._categorizeError('Connection refused')).toBe('network');
    });

    it('should categorize memory errors', () => {
      expect(limiter._categorizeError('Out of memory')).toBe('memory');
      expect(limiter._categorizeError('Heap overflow')).toBe('memory');
    });

    it('should return unknown for uncategorized errors', () => {
      expect(limiter._categorizeError('Something went wrong')).toBe('unknown');
    });
  });

  describe('singleton functions', () => {
    it('should return singleton instance', () => {
      const instance1 = getTurnLimiter();
      const instance2 = getTurnLimiter();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance with createTurnLimiter', () => {
      const instance1 = getTurnLimiter();
      const instance2 = createTurnLimiter({ maxAttempts: 5 });
      expect(instance2).not.toBe(instance1);
      expect(instance2.config.maxAttempts).toBe(5);
    });

    it('should reset singleton', () => {
      const instance1 = getTurnLimiter();
      resetTurnLimiter();
      const instance2 = getTurnLimiter();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      expect(limiter.config.maxAttempts).toBe(3);
      expect(limiter.config.maxRepeatedErrors).toBe(1);
      expect(limiter.config.fallbackThreshold).toBe(2);
    });

    it('should accept custom config', () => {
      const customLimiter = new TurnLimiter({
        maxAttempts: 5,
        maxRepeatedErrors: 2,
        fallbackThreshold: 3
      });

      expect(customLimiter.config.maxAttempts).toBe(5);
      expect(customLimiter.config.maxRepeatedErrors).toBe(2);
      expect(customLimiter.config.fallbackThreshold).toBe(3);
    });
  });
});