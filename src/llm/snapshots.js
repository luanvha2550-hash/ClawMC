// src/llm/snapshots.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('SemanticSnapshot');

/**
 * Generates compact snapshots for LLM context
 */
class SemanticSnapshot {
  constructor(bot, state, memory = null) {
    this.bot = bot;
    this.state = state;
    this.memory = memory;
  }

  /**
   * Generate compact snapshot
   */
  generate() {
    return {
      // Position and environment
      position: this.getPosition(),
      dimension: this.getDimension(),
      time: this.getTime(),

      // Bot state
      health: this.getHealth(),
      food: this.getFood(),
      inventory: this.getCompactInventory(),

      // Entities
      nearbyEntities: this.getNearbyEntities(32),

      // Blocks
      nearbyBlocks: this.getNearbyBlocks(16),

      // Task
      currentTask: this.getCurrentTask(),

      // Facts
      relevantFacts: this.getRelevantFacts(5),

      // Timestamp
      timestamp: Date.now()
    };
  }

  /**
   * Get position
   */
  getPosition() {
    if (!this.bot?.entity?.position) return { x: 0, y: 64, z: 0 };
    const pos = this.bot.entity.position;
    return { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) };
  }

  /**
   * Get dimension
   */
  getDimension() {
    return this.bot?.game?.dimension || 'minecraft:overworld';
  }

  /**
   * Get time
   */
  getTime() {
    return this.bot?.time?.day || 0;
  }

  /**
   * Get health
   */
  getHealth() {
    return this.bot?.health ?? 20;
  }

  /**
   * Get food
   */
  getFood() {
    return this.bot?.food ?? 20;
  }

  /**
   * Get compact inventory string
   */
  getCompactInventory() {
    const items = this.bot?.inventory?.items() || [];
    const compacted = {};

    for (const item of items) {
      const name = item.name.replace('_', ' ');
      compacted[name] = (compacted[name] || 0) + item.count;
    }

    return Object.entries(compacted)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ') || 'empty';
  }

  /**
   * Get nearby entities
   */
  getNearbyEntities(range) {
    const entities = Object.values(this.bot?.entities || {});
    const relevant = ['player', 'zombie', 'skeleton', 'creeper', 'cow', 'pig', 'sheep', 'villager'];

    const nearby = entities
      .filter(e => e.position?.distanceTo?.(this.bot.entity.position) < range)
      .filter(e => relevant.some(r => e.name?.includes(r)))
      .slice(0, 10)
      .map(e => ({
        type: e.name,
        distance: Math.round(e.position.distanceTo(this.bot.entity.position)),
        position: {
          x: Math.round(e.position.x),
          y: Math.round(e.position.y),
          z: Math.round(e.position.z)
        }
      }));

    return nearby;
  }

  /**
   * Get nearby blocks
   */
  getNearbyBlocks(range) {
    // Simplified - would need to scan blocks
    return [];
  }

  /**
   * Get current task
   */
  getCurrentTask() {
    return this.state?.currentTask?.type || null;
  }

  /**
   * Get relevant facts from memory
   */
  getRelevantFacts(limit) {
    if (!this.memory) return [];
    // Would query memory for relevant facts
    return [];
  }

  /**
   * Format for LLM prompt
   */
  formatForPrompt() {
    const snap = this.generate();

    const lines = [
      '[ESTADO ATUAL]',
      `Posição: (${snap.position.x}, ${snap.position.y}, ${snap.position.z})`,
      `Dimensão: ${snap.dimension}`,
      `Vida: ${snap.health}/20 | Fome: ${snap.food}/20`,
      `Inventário: ${snap.inventory}`,
      `Entidades próximas: ${snap.nearbyEntities.map(e => `${e.type}(${e.distance}m)`).join(', ') || 'nenhuma'}`,
      `Tarefa atual: ${snap.currentTask || 'nenhuma'}`
    ];

    return lines.join('\n');
  }

  /**
   * Get history snapshot
   */
  getHistorySnapshot(maxMessages = 10) {
    // Would return recent conversation history
    return [];
  }
}

export { SemanticSnapshot };