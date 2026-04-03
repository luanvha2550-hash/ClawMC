// src/llm/costTracker.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('CostTracker');

/**
 * Tracks LLM API usage and costs
 */
class CostTracker {
  constructor() {
    this.usage = {
      totalTokens: { input: 0, output: 0 },
      byProvider: {},
      byDay: {}
    };
  }

  /**
   * Track API usage
   */
  trackUsage(provider, model, inputTokens, outputTokens) {
    // Total
    this.usage.totalTokens.input += inputTokens;
    this.usage.totalTokens.output += outputTokens;

    // By provider
    if (!this.usage.byProvider[provider]) {
      this.usage.byProvider[provider] = { input: 0, output: 0 };
    }
    this.usage.byProvider[provider].input += inputTokens;
    this.usage.byProvider[provider].output += outputTokens;

    // By day
    const today = new Date().toISOString().slice(0, 10);
    if (!this.usage.byDay[today]) {
      this.usage.byDay[today] = { input: 0, output: 0 };
    }
    this.usage.byDay[today].input += inputTokens;
    this.usage.byDay[today].output += outputTokens;

    logger.debug(`[CostTracker] ${provider}: ${inputTokens} in, ${outputTokens} out`);
  }

  /**
   * Get daily cost estimate
   */
  getDailyCost() {
    const today = new Date().toISOString().slice(0, 10);
    const usage = this.usage.byDay[today] || { input: 0, output: 0 };

    return {
      date: today,
      inputTokens: usage.input,
      outputTokens: usage.output,
      estimatedCost: this.calculateCost(usage.input, usage.output)
    };
  }

  /**
   * Calculate estimated cost
   * Prices are approximate and vary by model
   */
  calculateCost(inputTokens, outputTokens) {
    // Approximate costs per 1M tokens
    // These are rough estimates
    const inputCostPer1M = 0.075;  // $0.075 per 1M input tokens
    const outputCostPer1M = 0.30;  // $0.30 per 1M output tokens

    const inputCost = (inputTokens / 1000000) * inputCostPer1M;
    const outputCost = (outputTokens / 1000000) * outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Get total usage
   */
  getTotalUsage() {
    return { ...this.usage.totalTokens };
  }

  /**
   * Get usage by provider
   */
  getUsageByProvider() {
    return { ...this.usage.byProvider };
  }

  /**
   * Get status summary
   */
  getStatus() {
    return {
      totalTokens: this.usage.totalTokens,
      byProvider: { ...this.usage.byProvider },
      dailyCost: this.getDailyCost(),
      days: Object.keys(this.usage.byDay).length
    };
  }

  /**
   * Reset daily counters
   */
  resetDaily() {
    const today = new Date().toISOString().slice(0, 10);
    this.usage.byDay[today] = { input: 0, output: 0 };
  }

  /**
   * Reset all counters
   */
  resetAll() {
    this.usage = {
      totalTokens: { input: 0, output: 0 },
      byProvider: {},
      byDay: {}
    };
  }
}

export { CostTracker };