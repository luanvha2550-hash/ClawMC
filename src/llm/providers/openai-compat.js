// src/llm/providers/openai-compat.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('OpenAICompatProvider');

/**
 * OpenAI-compatible provider (OpenRouter, NVIDIA, Ollama, OpenAI)
 */
class OpenAICompatProvider {
  constructor(config) {
    this.type = config.type;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.name = config.type;

    // Set base URL based on provider type
    this.baseUrl = this.getBaseUrl(config);
  }

  getBaseUrl(config) {
    switch (config.type) {
      case 'openrouter':
        return 'https://openrouter.ai/api/v1';
      case 'nvidia':
        return 'https://integrate.api.nvidia.com/v1';
      case 'ollama':
        return config.baseUrl || 'http://localhost:11434/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      default:
        return config.baseUrl || 'https://api.openai.com/v1';
    }
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    // Ollama doesn't require API key
    if (this.type === 'ollama') {
      return true;
    }
    return !!this.apiKey;
  }

  /**
   * Get model name
   */
  getModel() {
    return this.model;
  }

  /**
   * Get headers for request
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      if (this.type === 'openrouter') {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        headers['HTTP-Referer'] = 'https://clawmc.local';
        headers['X-Title'] = 'ClawMC';
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
    }

    return headers;
  }

  /**
   * Call chat completions API
   */
  async call(prompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error(`${this.type} API key not configured`);
    }

    const url = `${this.baseUrl}/chat/completions`;

    const messages = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const body = {
      model: this.model,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 2048
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data.error?.message || data.error || 'Unknown error';
        logger.error(`${this.type} API error: ${error}`);
        throw new Error(error);
      }

      const content = data.choices?.[0]?.message?.content || '';

      return {
        content,
        model: this.model,
        provider: this.type,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0
        }
      };

    } catch (error) {
      logger.error(`${this.type} provider failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings
   */
  async embed(text) {
    if (this.type === 'ollama') {
      return this.embedOllama(text);
    }

    const url = `${this.baseUrl}/embeddings`;
    const body = { model: this.model, input: text };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Embedding failed');
      }

      return data.data?.[0]?.embedding || [];

    } catch (error) {
      logger.error(`${this.type} embedding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ollama-specific embedding
   */
  async embedOllama(text) {
    const url = `${this.baseUrl.replace('/v1', '')}/api/embeddings`;
    const body = { model: this.model, prompt: text };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error('Ollama embedding failed');
      }

      return data.embedding || [];

    } catch (error) {
      logger.error(`Ollama embedding failed: ${error.message}`);
      throw error;
    }
  }
}

export { OpenAICompatProvider };