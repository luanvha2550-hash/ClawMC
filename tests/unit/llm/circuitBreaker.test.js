// tests/unit/llm/circuitBreaker.test.js

import { jest } from '@jest/globals';
import { CircuitBreaker } from '../../../src/llm/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 60000);
  });

  describe('states', () => {
    it('should start in closed state', () => {
      expect(breaker.getState('test')).toBe('closed');
    });

    it('should allow requests in closed state', () => {
      expect(breaker.canTry('test')).toBe(true);
    });
  });

  describe('failures', () => {
    it('should open after threshold failures', () => {
      breaker.onFailure('test');
      breaker.onFailure('test');
      breaker.onFailure('test');

      expect(breaker.getState('test')).toBe('open');
      expect(breaker.canTry('test')).toBe(false);
    });

    it('should track failures per provider', () => {
      breaker.onFailure('provider1');
      breaker.onFailure('provider2');

      expect(breaker.getState('provider1')).toBe('closed');
      expect(breaker.getState('provider2')).toBe('closed');
    });
  });

  describe('success', () => {
    it('should reset failures on success', () => {
      breaker.onFailure('test');
      breaker.onFailure('test');

      breaker.onSuccess('test');

      expect(breaker.getFailures('test')).toBe(0);
      expect(breaker.getState('test')).toBe('closed');
    });
  });

  describe('half-open', () => {
    it('should allow retry after timeout', () => {
      breaker.onFailure('test');
      breaker.onFailure('test');
      breaker.onFailure('test');

      // Simulate timeout passing
      breaker.lastFailure.set('test', Date.now() - 70000);

      expect(breaker.canTry('test')).toBe(true);
      expect(breaker.getState('test')).toBe('half-open');
    });
  });

  describe('reset', () => {
    it('should reset provider state', () => {
      breaker.onFailure('test');
      breaker.onFailure('test');
      breaker.onFailure('test');

      breaker.reset('test');

      expect(breaker.getState('test')).toBe('closed');
      expect(breaker.canTry('test')).toBe(true);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return only available providers', () => {
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');

      const available = breaker.getAvailableProviders(['provider1', 'provider2']);

      expect(available).toContain('provider2');
      expect(available).not.toContain('provider1');
    });
  });

  describe('hasAvailableProvider', () => {
    it('should return true when at least one provider is available', () => {
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');

      expect(breaker.hasAvailableProvider(['provider1', 'provider2'])).toBe(true);
    });

    it('should return false when all providers are open', () => {
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');
      breaker.onFailure('provider1');

      breaker.onFailure('provider2');
      breaker.onFailure('provider2');
      breaker.onFailure('provider2');

      expect(breaker.hasAvailableProvider(['provider1', 'provider2'])).toBe(false);
    });
  });
});