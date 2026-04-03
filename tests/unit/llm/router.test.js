// tests/unit/llm/router.test.js

import { jest } from '@jest/globals';
import { LLMRouter } from '../../../src/llm/router.js';
import { CircuitBreaker } from '../../../src/llm/circuitBreaker.js';

describe('LLMRouter', () => {
  let router;
  let mockProviders;

  beforeEach(() => {
    mockProviders = {
      primary: {
        name: 'google',
        isAvailable: () => true,
        call: jest.fn().mockResolvedValue({ content: 'Response' }),
        getModel: () => 'gemini-3'
      },
      secondary: {
        name: 'openrouter',
        isAvailable: () => true,
        call: jest.fn().mockResolvedValue({ content: 'Fallback response' }),
        getModel: () => 'stepfun'
      }
    };

    router = new LLMRouter(mockProviders);
  });

  describe('call', () => {
    it('should use primary provider', async () => {
      const result = await router.call('Hello');

      expect(mockProviders.primary.call).toHaveBeenCalled();
      expect(result.content).toBe('Response');
    });

    it('should fallback to secondary on primary failure', async () => {
      mockProviders.primary.call.mockRejectedValue(new Error('Primary failed'));

      const result = await router.call('Hello');

      expect(mockProviders.secondary.call).toHaveBeenCalled();
      expect(result.content).toBe('Fallback response');
    });

    it('should throw when all providers fail', async () => {
      mockProviders.primary.call.mockRejectedValue(new Error('Primary failed'));
      mockProviders.secondary.call.mockRejectedValue(new Error('Secondary failed'));

      await expect(router.call('Hello')).rejects.toThrow('All providers failed');
    });
  });

  describe('circuit breaker', () => {
    it('should skip providers in open state', async () => {
      router.circuitBreaker.onFailure('google');
      router.circuitBreaker.onFailure('google');
      router.circuitBreaker.onFailure('google');
      router.circuitBreaker.onFailure('google');
      router.circuitBreaker.onFailure('google');

      const result = await router.call('Hello');

      expect(mockProviders.secondary.call).toHaveBeenCalled();
    });
  });

  describe('generateCode', () => {
    it('should use code model if available', async () => {
      mockProviders.code = {
        name: 'nvidia',
        isAvailable: () => true,
        call: jest.fn().mockResolvedValue({ content: 'code' }),
        getModel: () => 'deepseek'
      };
      router = new LLMRouter(mockProviders);

      await router.generateCode('prompt');

      expect(mockProviders.code.call).toHaveBeenCalled();
    });

    it('should fallback to primary on code model failure', async () => {
      mockProviders.code = {
        name: 'nvidia',
        isAvailable: () => true,
        call: jest.fn().mockRejectedValue(new Error('Code failed')),
        getModel: () => 'deepseek'
      };
      router = new LLMRouter(mockProviders);

      const result = await router.generateCode('prompt');

      expect(mockProviders.primary.call).toHaveBeenCalled();
      expect(result.content).toBe('Response');
    });
  });

  describe('getStatus', () => {
    it('should return provider status', () => {
      const status = router.getStatus();

      expect(status.providers.primary).toBeDefined();
      expect(status.providers.primary.name).toBe('google');
      expect(status.circuitBreaker).toBeDefined();
    });
  });
});

describe('ModelSelector', () => {
  let ModelSelector;

  beforeEach(async () => {
    const module = await import('../../../src/llm/modelSelector.js');
    ModelSelector = module.ModelSelector;
  });

  describe('selectModel', () => {
    it('should return model in single mode', () => {
      const selector = new ModelSelector({ mode: 'single', model: 'gemini-3' });

      expect(selector.selectModel('chat')).toBe('gemini-3');
    });

    it('should select model by task type in tiered mode', () => {
      const selector = new ModelSelector({
        mode: 'tiered',
        tiers: {
          simple: { model: 'gemini-lite', useCases: ['chat'], maxTokens: 500 },
          complex: { model: 'gemini-pro', useCases: ['reasoning'], maxTokens: 8000 }
        }
      });

      expect(selector.selectModel('chat')).toBe('gemini-lite');
      expect(selector.selectModel('reasoning')).toBe('gemini-pro');
    });
  });

  describe('estimateTaskType', () => {
    it('should detect complex tasks', () => {
      const selector = new ModelSelector({});

      const type = selector.estimateTaskType('passo 1: fazer isso, passo 2: fazer aquilo', {});

      expect(type).toBe('complex');
    });

    it('should detect medium tasks with code', () => {
      const selector = new ModelSelector({});

      const type = selector.estimateTaskType('```javascript\nfunction test() {}```', {});

      expect(type).toBe('medium');
    });

    it('should detect simple tasks', () => {
      const selector = new ModelSelector({});

      const type = selector.estimateTaskType('olá', {});

      expect(type).toBe('simple');
    });
  });
});