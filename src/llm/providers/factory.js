// src/llm/providers/factory.js

import { GoogleProvider } from './google.js';
import { OpenAICompatProvider } from './openai-compat.js';

/**
 * Factory for creating LLM providers
 */
class ProviderFactory {
  /**
   * Create a provider instance
   */
  static create(config) {
    const type = config.type?.toLowerCase();

    switch (type) {
      case 'google':
        return new GoogleProvider(config);

      case 'openrouter':
      case 'nvidia':
      case 'ollama':
      case 'openai':
        return new OpenAICompatProvider(config);

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Create multiple providers from config
   */
  static createFromConfig(config) {
    const providers = {};

    if (config.primary) {
      providers.primary = ProviderFactory.create({
        type: config.primary.type,
        apiKey: config.primary.apiKey,
        model: config.primary.model
      });
    }

    if (config.secondary) {
      providers.secondary = ProviderFactory.create({
        type: config.secondary.type,
        apiKey: config.secondary.apiKey,
        model: config.secondary.model
      });
    }

    if (config.codeModel) {
      providers.code = ProviderFactory.create({
        type: config.codeModel.type,
        apiKey: config.codeModel.apiKey,
        model: config.codeModel.model
      });
    }

    return providers;
  }

  /**
   * Get list of supported providers
   */
  static getSupportedProviders() {
    return ['google', 'openrouter', 'nvidia', 'ollama', 'openai'];
  }

  /**
   * Check if a provider type is supported
   */
  static isSupported(type) {
    return ProviderFactory.getSupportedProviders().includes(type.toLowerCase());
  }
}

export { ProviderFactory };