// src/llm/providers/google.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('GoogleProvider');

/**
 * Google Gemini API provider
 */
class GoogleProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-3.1-flash-lite-preview';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.name = 'google';
  }

  /**
   * Check if provider is available
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Get model name
   */
  getModel() {
    return this.model;
  }

  /**
   * Call Gemini API
   */
  async call(prompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Google API key not configured');
    }

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 2048
      }
    };

    // Add system instruction if provided
    if (options.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }]
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        const error = data.error?.message || 'Unknown error';
        logger.error(`Google API error: ${error}`);
        throw new Error(error);
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        content,
        model: this.model,
        provider: 'google',
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount || 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount || 0
        }
      };

    } catch (error) {
      logger.error(`Google provider failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embeddings using Gemini Embedding API
   */
  async embed(text) {
    if (!this.isAvailable()) {
      throw new Error('Google API key not configured');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Embedding failed');
      }

      return data.embedding?.values || [];

    } catch (error) {
      logger.error(`Google embedding failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Count tokens
   */
  async countTokens(prompt) {
    if (!this.isAvailable()) {
      return 0;
    }

    const url = `${this.baseUrl}/${this.model}:countTokens?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      return data.totalTokens || 0;

    } catch (error) {
      logger.error(`Google countTokens failed: ${error.message}`);
      return 0; // Return 0 on error for non-critical operation
    }
  }
}

export { GoogleProvider };