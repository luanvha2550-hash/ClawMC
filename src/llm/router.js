// src/llm/router.js

import { getLogger } from '../utils/logger.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ModelSelector } from './modelSelector.js';

const logger = getLogger().module('LLMRouter');

/**
 * Routes LLM calls to appropriate providers with fallback
 */
class LLMRouter {
  constructor(providers, config = {}) {
    this.providers = providers;
    this.config = config;

    this.circuitBreaker = new CircuitBreaker(
      config.maxFailures || 5,
      config.cooldownMs || 60000
    );

    this.modelSelector = new ModelSelector(config);

    // Provider order for fallback
    this.providerOrder = ['primary', 'secondary', 'code'];
  }

  /**
   * Get available provider
   */
  getAvailableProvider(type = 'primary') {
    // Check specific provider first
    if (type && this.providers[type]?.isAvailable?.()) {
      if (this.circuitBreaker.canTry(this.providers[type].name)) {
        return this.providers[type];
      }
    }

    // Fallback to any available
    for (const key of this.providerOrder) {
      const provider = this.providers[key];
      if (provider?.isAvailable?.() && this.circuitBreaker.canTry(provider.name)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Call LLM with automatic fallback
   */
  async call(prompt, options = {}) {
    const errors = [];

    for (const key of this.providerOrder) {
      const provider = this.providers[key];

      if (!provider?.isAvailable?.()) {
        continue;
      }

      if (!this.circuitBreaker.canTry(provider.name)) {
        logger.debug(`Skipping ${provider.name} (circuit breaker open)`);
        continue;
      }

      try {
        logger.debug(`Trying ${provider.name}...`);
        const result = await provider.call(prompt, options);

        this.circuitBreaker.onSuccess(provider.name);

        return result;

      } catch (error) {
        logger.warn(`${provider.name} failed: ${error.message}`);
        this.circuitBreaker.onFailure(provider.name);
        errors.push({ provider: provider.name, error: error.message });
      }
    }

    // All providers failed
    throw new Error(`All providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join('; ')}`);
  }

  /**
   * Generate code using code model
   */
  async generateCode(prompt, options = {}) {
    const codeProvider = this.providers.code || this.providers.primary;

    if (!codeProvider?.isAvailable?.()) {
      throw new Error('No code provider available');
    }

    if (!this.circuitBreaker.canTry(codeProvider.name)) {
      // Fallback to primary
      return this.call(prompt, { ...options, systemPrompt: 'Generate code.' });
    }

    try {
      const result = await codeProvider.call(prompt, {
        ...options,
        temperature: options.temperature || 0.3
      });

      this.circuitBreaker.onSuccess(codeProvider.name);
      return result;

    } catch (error) {
      this.circuitBreaker.onFailure(codeProvider.name);
      logger.warn(`Code provider failed: ${error.message}`);

      // Fallback to primary
      return this.call(prompt, options);
    }
  }

  /**
   * Regenerate with error context
   */
  async regenerateWithErrors(code, error, task) {
    const prompt = `
The following code failed:
\`\`\`javascript
${code}
\`\`\`

Error: ${error}

Task: ${JSON.stringify(task)}

Please fix the code and return the corrected version.
`;

    return this.generateCode(prompt);
  }

  /**
   * Get provider status
   */
  getStatus() {
    const status = {
      circuitBreaker: this.circuitBreaker.getStatus(),
      providers: {}
    };

    for (const [key, provider] of Object.entries(this.providers)) {
      status.providers[key] = {
        name: provider.name,
        model: provider.getModel?.() || 'unknown',
        available: provider.isAvailable?.() || false,
        state: this.circuitBreaker.getState(provider.name)
      };
    }

    return status;
  }
}

export { LLMRouter };