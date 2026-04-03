// tests/integration/llm.test.js

import { jest } from '@jest/globals';
import { ProviderFactory } from '../../src/llm/providers/factory.js';
import { LLMRouter } from '../../src/llm/router.js';
import { CircuitBreaker } from '../../src/llm/circuitBreaker.js';
import { PromptTemplates } from '../../src/llm/prompts.js';
import { SemanticSnapshot } from '../../src/llm/snapshots.js';
import { CostTracker } from '../../src/llm/costTracker.js';

describe('LLM Layer Integration', () => {
  describe('Provider Factory', () => {
    it('should create Google provider', () => {
      const provider = ProviderFactory.create({
        type: 'google',
        apiKey: 'test',
        model: 'gemini-3'
      });

      expect(provider.name).toBe('google');
    });

    it('should create OpenRouter provider', () => {
      const provider = ProviderFactory.create({
        type: 'openrouter',
        apiKey: 'test',
        model: 'stepfun'
      });

      expect(provider.name).toBe('openrouter');
    });

    it('should throw for unknown provider', () => {
      expect(() => ProviderFactory.create({ type: 'unknown' })).toThrow();
    });
  });

  describe('Router with Circuit Breaker', () => {
    it('should route to available provider', async () => {
      const providers = {
        primary: {
          name: 'test',
          isAvailable: () => true,
          call: jest.fn().mockResolvedValue({ content: 'test' })
        }
      };

      const router = new LLMRouter(providers);
      const result = await router.call('test');

      expect(result.content).toBe('test');
    });

    it('should use circuit breaker', () => {
      const breaker = new CircuitBreaker(3, 60000);

      expect(breaker.canTry('test')).toBe(true);

      breaker.onFailure('test');
      breaker.onFailure('test');
      breaker.onFailure('test');

      expect(breaker.canTry('test')).toBe(false);
    });
  });

  describe('Prompts and Snapshots', () => {
    it('should generate prompt with snapshot', () => {
      const templates = new PromptTemplates();
      const prompt = templates.buildCodePrompt('test task', {
        position: { x: 100, y: 64, z: -200 }
      });

      expect(prompt).toContain('test task');
    });

    it('should generate semantic snapshot', () => {
      const mockBot = {
        entity: { position: { x: 0, y: 64, z: 0 } },
        game: { dimension: 'minecraft:overworld' },
        time: { day: 1000 },
        health: 20,
        food: 20,
        inventory: { items: () => [] },
        entities: {}
      };

      const snapshot = new SemanticSnapshot(mockBot, null);
      const snap = snapshot.generate();

      expect(snap.position).toBeDefined();
      expect(snap.health).toBe(20);
    });
  });

  describe('Cost Tracker', () => {
    it('should track usage', () => {
      const tracker = new CostTracker();

      tracker.trackUsage('google', 'gemini', 1000, 500);

      const status = tracker.getStatus();

      expect(status.totalTokens.input).toBe(1000);
      expect(status.totalTokens.output).toBe(500);
    });
  });

  describe('Module Exports', () => {
    it('should export all components', async () => {
      const llm = await import('../../src/llm/index.js');

      expect(llm.GoogleProvider).toBeDefined();
      expect(llm.OpenAICompatProvider).toBeDefined();
      expect(llm.ProviderFactory).toBeDefined();
      expect(llm.CircuitBreaker).toBeDefined();
      expect(llm.ModelSelector).toBeDefined();
      expect(llm.LLMRouter).toBeDefined();
      expect(llm.PromptTemplates).toBeDefined();
      expect(llm.SemanticSnapshot).toBeDefined();
      expect(llm.MinifiedDocs).toBeDefined();
      expect(llm.PromptCache).toBeDefined();
      expect(llm.CostTracker).toBeDefined();
    });
  });
});