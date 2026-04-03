// tests/mocks/llm.mock.js
// Mock LLM provider and router for testing
//
// Provides mock implementations of LLM providers, routers, and related
// components for unit and integration testing.

import { jest } from '@jest/globals';

/**
 * Create a mock LLM provider
 * @param {Object} options - Configuration options
 * @param {string} options.name - Provider name
 * @param {string} options.model - Model name
 * @param {boolean} options.available - Whether provider is available
 * @returns {Object} Mock provider instance
 */
export function createMockProvider(options = {}) {
  const {
    name = 'mock-provider',
    model = 'mock-model',
    available = true
  } = options;

  return {
    name,
    model,
    isAvailable: jest.fn().mockReturnValue(available),

    call: jest.fn().mockResolvedValue({
      content: 'Mock response from ' + name,
      model,
      provider: name,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15
      }
    }),

    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),

    countTokens: jest.fn().mockReturnValue(10),

    getModel: jest.fn().mockReturnValue(model),

    setModel: jest.fn(),

    getCapabilities: jest.fn().mockReturnValue({
      chat: true,
      embed: true,
      code: false,
      maxTokens: 4096
    })
  };
}

/**
 * Create a mock LLM router
 * @param {Object} options - Configuration options
 * @returns {Object} Mock router instance
 */
export function createMockRouter(options = {}) {
  const {
    primaryName = 'primary',
    secondaryName = 'secondary',
    circuitBreakerEnabled = true
  } = options;

  const state = {
    callCount: 0,
    lastCall: null,
    failures: 0
  };

  return {
    primaryProvider: {
      name: primaryName,
      available: true
    },
    secondaryProvider: {
      name: secondaryName,
      available: true
    },

    call: jest.fn().mockImplementation(async (prompt, options) => {
      state.callCount++;
      state.lastCall = { prompt, options };
      return {
        content: 'Mock router response',
        model: 'mock-model',
        provider: primaryName,
        usage: { inputTokens: 10, outputTokens: 5 }
      };
    }),

    generateCode: jest.fn().mockImplementation(async (prompt, options) => {
      return {
        content: '// Mock generated code\nasync function execute(bot, params) {\n  return { success: true };\n}',
        model: 'mock-model',
        provider: primaryName
      };
    }),

    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),

    getStatus: jest.fn().mockReturnValue({
      primaryAvailable: true,
      secondaryAvailable: true,
      circuitBreakerState: circuitBreakerEnabled ? 'closed' : 'open',
      totalCalls: state.callCount,
      totalFailures: state.failures
    }),

    getStats: jest.fn().mockReturnValue({
      calls: state.callCount,
      successes: state.callCount - state.failures,
      failures: state.failures,
      avgLatency: 100
    }),

    // Test helpers
    _state: state,
    _simulateFailure: () => {
      state.failures++;
      return state.failures;
    },
    _reset: () => {
      state.callCount = 0;
      state.lastCall = null;
      state.failures = 0;
    }
  };
}

/**
 * Create a mock circuit breaker
 * @param {Object} options - Configuration options
 * @returns {Object} Mock circuit breaker instance
 */
export function createMockCircuitBreaker(options = {}) {
  const {
    maxFailures = 5,
    cooldownMs = 60000,
    initialState = 'closed'
  } = options;

  const state = {
    failures: new Map(),
    state: initialState,
    lastFailureTime: new Map()
  };

  return {
    maxFailures,
    cooldownMs,

    canTry: jest.fn().mockImplementation((provider) => {
      const failures = state.failures.get(provider) || 0;
      if (failures < maxFailures) return true;
      if (state.state === 'half-open') return true;
      return false;
    }),

    recordSuccess: jest.fn().mockImplementation((provider) => {
      state.failures.set(provider, 0);
      state.state = 'closed';
    }),

    recordFailure: jest.fn().mockImplementation((provider) => {
      const failures = (state.failures.get(provider) || 0) + 1;
      state.failures.set(provider, failures);
      state.lastFailureTime.set(provider, Date.now());
      if (failures >= maxFailures) {
        state.state = 'open';
      }
    }),

    getState: jest.fn().mockReturnValue(state.state),

    reset: jest.fn().mockImplementation(() => {
      state.failures.clear();
      state.lastFailureTime.clear();
      state.state = 'closed';
    }),

    // Test helpers
    _getState: () => state,
    _setFailures: (provider, count) => {
      state.failures.set(provider, count);
      if (count >= maxFailures) state.state = 'open';
    }
  };
}

/**
 * Create mock embeddings manager
 * @param {Object} options - Configuration options
 * @returns {Object} Mock embeddings manager instance
 */
export function createMockEmbeddings(options = {}) {
  const {
    mode = 'local',
    dimension = 384
  } = options;

  const cache = new Map();

  return {
    mode,
    dimension,
    cache,

    init: jest.fn().mockResolvedValue(undefined),

    embed: jest.fn().mockImplementation(async (text) => {
      // Return deterministic embedding based on text
      const hash = text.split('').reduce((acc, char) => {
        return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
      }, 0);

      const embedding = [];
      for (let i = 0; i < dimension; i++) {
        embedding.push(Math.sin(hash + i) * 0.1);
      }

      cache.set(text, embedding);
      return embedding;
    }),

    embedBatch: jest.fn().mockImplementation(async (texts) => {
      return Promise.all(texts.map(t => createMockEmbeddings().embed(t)));
    }),

    similarity: jest.fn().mockImplementation((a, b) => {
      // Cosine similarity
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }),

    shutdown: jest.fn().mockResolvedValue(undefined),

    // Test helpers
    _cache: cache,
    _clear: () => cache.clear()
  };
}

/**
 * Create mock prompt templates
 * @returns {Object} Mock prompt templates instance
 */
export function createMockPrompts() {
  return {
    getSystemPrompt: jest.fn().mockReturnValue('You are a helpful Minecraft bot.'),
    getChatPrompt: jest.fn().mockImplementation((context, message) => {
      return `Context: ${JSON.stringify(context)}\n\nUser: ${message}\n\nAssistant:`;
    }),
    getCodePrompt: jest.fn().mockImplementation((task, context) => {
      return `Task: ${task}\nContext: ${JSON.stringify(context)}\n\nGenerate code:`;
    }),
    getReflectionPrompt: jest.fn().mockImplementation((error, context) => {
      return `Error: ${error}\nContext: ${JSON.stringify(context)}\n\nReflect and improve:`;
    })
  };
}

/**
 * Create mock cost tracker
 * @returns {Object} Mock cost tracker instance
 */
export function createMockCostTracker() {
  const costs = {
    totalTokens: 0,
    totalCalls: 0,
    byProvider: new Map(),
    byDay: new Map()
  };

  return {
    track: jest.fn().mockImplementation((provider, model, inputTokens, outputTokens) => {
      costs.totalTokens += inputTokens + outputTokens;
      costs.totalCalls++;

      const providerCosts = costs.byProvider.get(provider) || { calls: 0, tokens: 0 };
      providerCosts.calls++;
      providerCosts.tokens += inputTokens + outputTokens;
      costs.byProvider.set(provider, providerCosts);
    }),

    getStats: jest.fn().mockReturnValue({
      totalTokens: costs.totalTokens,
      totalCalls: costs.totalCalls,
      byProvider: Object.fromEntries(costs.byProvider),
      byDay: Object.fromEntries(costs.byDay)
    }),

    getDailyCost: jest.fn().mockReturnValue(0.01),

    reset: jest.fn().mockImplementation(() => {
      costs.totalTokens = 0;
      costs.totalCalls = 0;
      costs.byProvider.clear();
      costs.byDay.clear();
    }),

    // Test helpers
    _costs: costs
  };
}

export default {
  createMockProvider,
  createMockRouter,
  createMockCircuitBreaker,
  createMockEmbeddings,
  createMockPrompts,
  createMockCostTracker
};