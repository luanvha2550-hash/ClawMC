// tests/unit/llm/providers/google.test.js

import { jest } from '@jest/globals';
import { GoogleProvider } from '../../../../src/llm/providers/google.js';

describe('GoogleProvider', () => {
  let provider;
  let mockFetch;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    provider = new GoogleProvider({
      apiKey: 'test-api-key',
      model: 'gemini-3.1-flash-lite-preview'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('call', () => {
    it('should call Gemini API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'Hello!' }] }
          }]
        })
      });

      const result = await provider.call('Hello');

      expect(mockFetch).toHaveBeenCalled();
      expect(result.content).toBe('Hello!');
    });

    it('should handle errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'API error' }
        })
      });

      await expect(provider.call('Hello')).rejects.toThrow('API error');
    });
  });

  describe('getModel', () => {
    it('should return model name', () => {
      expect(provider.getModel()).toBe('gemini-3.1-flash-lite-preview');
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is set', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when API key is not set', () => {
      const noKeyProvider = new GoogleProvider({ model: 'test' });
      expect(noKeyProvider.isAvailable()).toBe(false);
    });
  });
});