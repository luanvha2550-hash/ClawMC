// tests/unit/llm/promptCache.test.js

import { jest } from '@jest/globals';
import { PromptCache } from '../../../src/llm/promptCache.js';
import { CostTracker } from '../../../src/llm/costTracker.js';

describe('PromptCache', () => {
  let cache;

  beforeEach(() => {
    cache = new PromptCache();
  });

  describe('hashPreamble', () => {
    it('should generate consistent hash', () => {
      const hash1 = cache.hashPreamble('test preamble');
      const hash2 = cache.hashPreamble('test preamble');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = cache.hashPreamble('preamble 1');
      const hash2 = cache.hashPreamble('preamble 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('prepareForGemini', () => {
    it('should reuse cache for same preamble', () => {
      const systemPrompt = 'System instructions';

      cache.prepareForGemini(systemPrompt, 'Hello 1');
      const result2 = cache.prepareForGemini(systemPrompt, 'Hello 2');

      expect(result2.cachedContent).toBeDefined();
    });
  });

  describe('prepareForOpenAI', () => {
    it('should separate system and user messages', () => {
      const result = cache.prepareForOpenAI('System prompt', 'User message');

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
    });
  });
});

describe('CostTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('trackUsage', () => {
    it('should track token usage', () => {
      tracker.trackUsage('google', 'gemini-3', 100, 50);

      const daily = tracker.getDailyCost();

      expect(daily.inputTokens).toBe(100);
      expect(daily.outputTokens).toBe(50);
    });

    it('should track by provider', () => {
      tracker.trackUsage('google', 'gemini-3', 100, 50);
      tracker.trackUsage('openrouter', 'stepfun', 200, 100);

      const status = tracker.getStatus();

      expect(status.byProvider.google.input).toBe(100);
      expect(status.byProvider.openrouter.input).toBe(200);
    });
  });

  describe('getDailyCost', () => {
    it('should calculate estimated cost', () => {
      tracker.trackUsage('google', 'gemini-3', 1000000, 500000);

      const daily = tracker.getDailyCost();

      expect(daily.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('getTotalUsage', () => {
    it('should return total tokens', () => {
      tracker.trackUsage('google', 'gemini-3', 100, 50);
      tracker.trackUsage('openrouter', 'stepfun', 200, 100);

      const total = tracker.getTotalUsage();

      expect(total.input).toBe(300);
      expect(total.output).toBe(150);
    });
  });

  describe('resetAll', () => {
    it('should reset all counters', () => {
      tracker.trackUsage('google', 'gemini-3', 100, 50);
      tracker.resetAll();

      const total = tracker.getTotalUsage();

      expect(total.input).toBe(0);
      expect(total.output).toBe(0);
    });
  });
});