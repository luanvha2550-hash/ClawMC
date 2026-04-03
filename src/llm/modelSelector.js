// src/llm/modelSelector.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('ModelSelector');

/**
 * Selects appropriate model based on task complexity
 */
class ModelSelector {
  constructor(config) {
    this.mode = config?.mode || 'single';
    this.config = config;

    // Tiers for different complexity levels
    this.tiers = config?.tiers || {
      simple: {
        model: config?.model || 'gemini-3.1-flash-lite-preview',
        useCases: ['chat', 'translate', 'summarize'],
        maxTokens: 500
      },
      medium: {
        model: config?.model || 'gemini-2.5-flash',
        useCases: ['code', 'plan', 'skill'],
        maxTokens: 2000
      },
      complex: {
        model: config?.model || 'gemini-3-flash-preview',
        useCases: ['reasoning', 'multistep'],
        maxTokens: 8000
      }
    };
  }

  /**
   * Select model for task
   */
  selectModel(taskType, estimatedTokens = 500) {
    if (this.mode === 'single') {
      return this.config?.model || 'gemini-3.1-flash-lite-preview';
    }

    // Tiered mode
    const tiers = Object.entries(this.tiers);

    for (const [tierName, tier] of tiers) {
      if (tier.useCases.includes(taskType)) {
        // Check if tokens fit
        if (estimatedTokens <= tier.maxTokens) {
          return tier.model;
        }
      }
    }

    // Default to complex tier for unknown tasks
    return this.tiers.complex?.model || this.config?.model;
  }

  /**
   * Estimate task type from context
   */
  estimateTaskType(prompt, context = {}) {
    const promptLength = prompt.length;
    const hasCode = /```|function|async|await/.test(prompt);
    const hasMultiStep = /passo|step|primeiro|depois|então/i.test(prompt);
    const nearbyEntities = context.nearbyEntities || 0;

    // Complex: multi-step reasoning or many entities
    if (hasMultiStep || nearbyEntities > 5) {
      return 'complex';
    }

    // Medium: code generation or long prompts
    if (hasCode || promptLength > 500) {
      return 'medium';
    }

    // Simple: short chat
    return 'simple';
  }

  /**
   * Get model info
   */
  getModelInfo(modelName) {
    for (const [tierName, tier] of Object.entries(this.tiers)) {
      if (tier.model === modelName) {
        return { tier: tierName, ...tier };
      }
    }

    return { tier: 'unknown', model: modelName };
  }
}

export { ModelSelector };