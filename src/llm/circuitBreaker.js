// src/llm/circuitBreaker.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('CircuitBreaker');

/**
 * Circuit Breaker for LLM providers
 * Prevents cascading failures by temporarily disabling failing providers
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;  // Failures before opening
    this.timeout = timeout;       // Time before retry (ms)

    this.failures = new Map();     // provider -> failure count
    this.states = new Map();       // provider -> 'closed'|'open'|'half-open'
    this.lastFailure = new Map();  // provider -> timestamp
  }

  /**
   * Check if provider can be tried
   */
  canTry(provider) {
    const state = this.getState(provider);

    if (state === 'closed') {
      return true;
    }

    if (state === 'open') {
      const lastFail = this.lastFailure.get(provider) || 0;
      const elapsed = Date.now() - lastFail;

      if (elapsed > this.timeout) {
        // Transition to half-open
        this.states.set(provider, 'half-open');
        logger.info(`[CircuitBreaker] ${provider} transitioning to half-open`);
        return true;
      }

      return false;
    }

    // Half-open: allow one attempt
    return true;
  }

  /**
   * Get current state for provider
   */
  getState(provider) {
    return this.states.get(provider) || 'closed';
  }

  /**
   * Get failure count for provider
   */
  getFailures(provider) {
    return this.failures.get(provider) || 0;
  }

  /**
   * Record successful call
   */
  onSuccess(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');
    this.lastFailure.delete(provider);

    logger.debug(`[CircuitBreaker] ${provider} success, state: closed`);
  }

  /**
   * Record failed call
   */
  onFailure(provider) {
    const count = (this.failures.get(provider) || 0) + 1;
    this.failures.set(provider, count);
    this.lastFailure.set(provider, Date.now());

    if (count >= this.threshold) {
      this.states.set(provider, 'open');
      logger.warn(`[CircuitBreaker] ${provider} opened after ${count} failures`);
    } else {
      logger.debug(`[CircuitBreaker] ${provider} failure ${count}/${this.threshold}`);
    }
  }

  /**
   * Force reset provider state
   */
  reset(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');
    this.lastFailure.delete(provider);

    logger.info(`[CircuitBreaker] ${provider} reset`);
  }

  /**
   * Reset all providers
   */
  resetAll() {
    this.failures.clear();
    this.states.clear();
    this.lastFailure.clear();

    logger.info('[CircuitBreaker] All providers reset');
  }

  /**
   * Get status for all providers
   */
  getStatus() {
    const status = {};

    for (const [provider, state] of this.states) {
      status[provider] = {
        state,
        failures: this.failures.get(provider) || 0,
        lastFailure: this.lastFailure.get(provider)
      };
    }

    return status;
  }

  /**
   * Get available providers (closed or half-open)
   */
  getAvailableProviders(providers) {
    return providers.filter(p => this.canTry(p));
  }

  /**
   * Check if any provider is available
   */
  hasAvailableProvider(providers) {
    return providers.some(p => this.canTry(p));
  }
}

export { CircuitBreaker };