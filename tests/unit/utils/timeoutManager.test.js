import { jest } from '@jest/globals';
import { TimeoutManager, getTimeoutManager, resetTimeoutManager } from '../../../src/utils/timeoutManager.js';

describe('TimeoutManager', () => {
  let tm;

  beforeEach(() => {
    tm = new TimeoutManager();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    tm.clearAll();
  });

  describe('withTimeout', () => {
    it('should resolve before timeout', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('success'), 100));

      const resultPromise = tm.withTimeout(promise, 1000, 'test');
      jest.advanceTimersByTime(100);

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should reject on timeout', async () => {
      const promise = new Promise(resolve => setTimeout(resolve, 5000));

      const resultPromise = tm.withTimeout(promise, 100, 'test');
      jest.advanceTimersByTime(100);

      await expect(resultPromise).rejects.toThrow('test timeout');
    });
  });

  describe('createTimeout', () => {
    it('should create timeout that fires', () => {
      const callback = jest.fn();
      tm.createTimeout(callback, 1000, 'test');

      jest.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should cancel timeout', () => {
      const callback = jest.fn();
      const timeout = tm.createTimeout(callback, 1000, 'test');

      tm.cancel(timeout);
      jest.advanceTimersByTime(1000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all timeouts for operation', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      tm.createTimeout(callback1, 1000, 'op1');
      tm.createTimeout(callback2, 1000, 'op2');

      tm.cancelAll('op1');
      jest.advanceTimersByTime(1000);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('defaults', () => {
    it('should return default timeout values', () => {
      expect(tm.getDefault('skill')).toBe(30000);
      expect(tm.getDefault('llm')).toBe(60000);
      expect(tm.getDefault('unknown')).toBe(30000);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getTimeoutManager', () => {
      // Reset singleton first
      resetTimeoutManager();

      const instance1 = getTimeoutManager();
      const instance2 = getTimeoutManager();
      expect(instance1).toBe(instance2);
    });
  });
});