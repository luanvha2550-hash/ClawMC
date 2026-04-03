// tests/unit/llm/providers/factory.test.js

import { ProviderFactory } from '../../../../src/llm/providers/factory.js';
import { GoogleProvider } from '../../../../src/llm/providers/google.js';
import { OpenAICompatProvider } from '../../../../src/llm/providers/openai-compat.js';

describe('ProviderFactory', () => {
  describe('create', () => {
    it('should create Google provider', () => {
      const provider = ProviderFactory.create({
        type: 'google',
        apiKey: 'test',
        model: 'gemini-3'
      });

      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.name).toBe('google');
    });

    it('should create OpenRouter provider', () => {
      const provider = ProviderFactory.create({
        type: 'openrouter',
        apiKey: 'test',
        model: 'stepfun'
      });

      expect(provider).toBeInstanceOf(OpenAICompatProvider);
      expect(provider.name).toBe('openrouter');
    });

    it('should create NVIDIA provider', () => {
      const provider = ProviderFactory.create({
        type: 'nvidia',
        apiKey: 'test',
        model: 'deepseek'
      });

      expect(provider).toBeInstanceOf(OpenAICompatProvider);
      expect(provider.name).toBe('nvidia');
    });

    it('should create Ollama provider', () => {
      const provider = ProviderFactory.create({
        type: 'ollama',
        model: 'llama3'
      });

      expect(provider).toBeInstanceOf(OpenAICompatProvider);
      expect(provider.name).toBe('ollama');
    });

    it('should create OpenAI provider', () => {
      const provider = ProviderFactory.create({
        type: 'openai',
        apiKey: 'test',
        model: 'gpt-4'
      });

      expect(provider).toBeInstanceOf(OpenAICompatProvider);
      expect(provider.name).toBe('openai');
    });

    it('should throw for unknown provider type', () => {
      expect(() => {
        ProviderFactory.create({ type: 'unknown' });
      }).toThrow('Unknown provider type');
    });
  });

  describe('getSupportedProviders', () => {
    it('should return list of supported providers', () => {
      const providers = ProviderFactory.getSupportedProviders();

      expect(providers).toContain('google');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('nvidia');
      expect(providers).toContain('ollama');
      expect(providers).toContain('openai');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported providers', () => {
      expect(ProviderFactory.isSupported('google')).toBe(true);
      expect(ProviderFactory.isSupported('OPENROUTER')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(ProviderFactory.isSupported('unknown')).toBe(false);
    });
  });
});