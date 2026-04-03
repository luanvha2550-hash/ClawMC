// tests/unit/llm/providers/openai-compat.test.js

import { jest } from '@jest/globals';
import { OpenAICompatProvider } from '../../../../src/llm/providers/openai-compat.js';

describe('OpenAICompatProvider', () => {
  let provider;
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  describe('OpenRouter', () => {
    beforeEach(() => {
      provider = new OpenAICompatProvider({
        type: 'openrouter',
        apiKey: 'test-key',
        model: 'stepfun/step-3.5-flash:free'
      });
    });

    it('should use OpenRouter endpoint', () => {
      expect(provider.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('should call chat completions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      });

      const result = await provider.call('Hi');

      expect(result.content).toBe('Hello!');
    });
  });

  describe('NVIDIA', () => {
    beforeEach(() => {
      provider = new OpenAICompatProvider({
        type: 'nvidia',
        apiKey: 'test-key',
        model: 'deepseek-ai/deepseek-v3'
      });
    });

    it('should use NVIDIA endpoint', () => {
      expect(provider.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
    });
  });

  describe('Ollama', () => {
    beforeEach(() => {
      provider = new OpenAICompatProvider({
        type: 'ollama',
        model: 'llama3'
      });
    });

    it('should use default Ollama endpoint', () => {
      expect(provider.baseUrl).toBe('http://localhost:11434/v1');
    });

    it('should be available without API key', () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('OpenAI', () => {
    beforeEach(() => {
      provider = new OpenAICompatProvider({
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      });
    });

    it('should use OpenAI endpoint', () => {
      expect(provider.baseUrl).toBe('https://api.openai.com/v1');
    });
  });

  describe('error handling', () => {
    it('should throw when API key not configured', async () => {
      provider = new OpenAICompatProvider({
        type: 'openai',
        model: 'gpt-4'
      });

      await expect(provider.call('test')).rejects.toThrow('API key not configured');
    });

    it('should handle API errors', async () => {
      provider = new OpenAICompatProvider({
        type: 'openrouter',
        apiKey: 'test-key',
        model: 'test'
      });

      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Rate limit exceeded' }
        })
      });

      await expect(provider.call('test')).rejects.toThrow('Rate limit exceeded');
    });
  });
});