// src/llm/promptCache.js

import { createHash } from 'crypto';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('PromptCache');

/**
 * Caches prompt preambles for cost reduction
 */
class PromptCache {
  constructor() {
    this.cachedPreamble = null;
    this.preambleHash = null;
  }

  /**
   * Generate hash of preamble
   */
  hashPreamble(preamble) {
    return createHash('md5').update(preamble).digest('hex');
  }

  /**
   * Prepare prompt with caching for Gemini
   */
  prepareForGemini(systemPrompt, userMessage) {
    const currentHash = this.hashPreamble(systemPrompt);

    // Reuse cached preamble if same
    if (currentHash === this.preambleHash && this.cachedPreamble) {
      logger.debug('[PromptCache] Reusing cached preamble');

      return {
        cachedContent: this.cachedPreamble,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }]
      };
    }

    // Create new cache
    this.preambleHash = currentHash;
    this.cachedPreamble = {
      role: 'user',
      parts: [{ text: systemPrompt }]
    };

    logger.debug('[PromptCache] Creating new preamble cache');

    return {
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Estou pronto para ajudar.' }] },
        { role: 'user', parts: [{ text: userMessage }] }
      ]
    };
  }

  /**
   * Prepare prompt for OpenAI-compatible APIs
   */
  prepareForOpenAI(systemPrompt, userMessage) {
    // OpenAI automatically caches system prompts
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    };
  }

  /**
   * Prepare prompt based on provider
   */
  prepare(provider, systemPrompt, userMessage) {
    if (provider === 'google') {
      return this.prepareForGemini(systemPrompt, userMessage);
    }

    return this.prepareForOpenAI(systemPrompt, userMessage);
  }

  /**
   * Clear cache
   */
  clear() {
    this.cachedPreamble = null;
    this.preambleHash = null;
  }
}

export { PromptCache };