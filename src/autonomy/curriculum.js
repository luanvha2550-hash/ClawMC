// src/autonomy/curriculum.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Curriculum');

/**
 * Curriculum phases in order of progression
 */
const CURRICULUM_PHASES = {
  survival: [
    { skill: 'collect_wood', trigger: 'inventory.wood < 16', priority: 10 },
    { skill: 'craft_tools', trigger: 'no_pickaxe && no_axe', priority: 9 },
    { skill: 'find_food', trigger: 'food < 10', priority: 10 },
    { skill: 'build_shelter', trigger: 'night_coming && no_shelter', priority: 8 }
  ],
  gathering: [
    { skill: 'mine_stone', trigger: 'inventory.stone < 32', priority: 7 },
    { skill: 'mine_iron', trigger: 'has_iron_pickaxe && inventory.iron < 16', priority: 6 },
    { skill: 'smelt_ores', trigger: 'has_furnace && has_raw_ores', priority: 5 },
    { skill: 'store_resources', trigger: 'inventory.full', priority: 8 }
  ],
  exploration: [
    { skill: 'explore_chunk', trigger: 'unexplored_chunks_nearby', priority: 4 },
    { skill: 'map_location', trigger: 'interesting_location_found', priority: 3 },
    { skill: 'find_village', trigger: 'days > 1 && !found_village', priority: 3 },
    { skill: 'discover_biomes', trigger: 'biomes_discovered < 5', priority: 2 }
  ],
  advanced: [
    { skill: 'mine_diamonds', trigger: 'has_iron_pickaxe && inventory.diamond < 5', priority: 5 },
    { skill: 'enchant_tools', trigger: 'has_enchanting_table && levels > 30', priority: 4 },
    { skill: 'build_farm', trigger: 'has_farmland_nearby && !has_farm', priority: 3 }
  ]
};

/**
 * Curriculum Manager - Inspired by Voyager
 * Manages autonomous goal selection based on bot state
 */
class CurriculumManager {
  constructor(state, memory, config = {}) {
    this.state = state;
    this.memory = memory;
    this.config = config;

    this.currentPhase = 'survival';
    this.learnedSkills = new Set();
    this.completedGoals = [];

    // Time tracking
    this.timeOfDay = 0;
    this.dayCount = 0;

    // Phase progress
    this.phaseProgress = {
      survival: 0,
      gathering: 0,
      exploration: 0,
      advanced: 0
    };
  }

  /**
   * Get current phase based on progress
   */
  getCurrentPhase() {
    // Check phase progression
    this.updateProgress();

    if (this.phaseProgress.survival < 0.7) {
      return 'survival';
    }
    if (this.phaseProgress.gathering < 0.7) {
      return 'gathering';
    }
    if (this.phaseProgress.exploration < 0.7) {
      return 'exploration';
    }
    return 'advanced';
  }

  /**
   * Get next autonomous goal
   */
  getNextGoal() {
    // First check survival needs (always priority)
    const survivalGoal = this.checkSurvivalNeeds();
    if (survivalGoal) {
      return survivalGoal;
    }

    // Then check scheduled tasks
    // (handled by Scheduler)

    // Then check curriculum goals
    const phase = this.getCurrentPhase();
    const goals = CURRICULUM_PHASES[phase] || [];

    // Filter by trigger and sort by priority
    const activeGoals = goals
      .filter(g => this.evaluateTrigger(g.trigger))
      .sort((a, b) => b.priority - a.priority);

    // Skip already learned skills if possible
    const newGoal = activeGoals.find(g => !this.learnedSkills.has(g.skill));

    return newGoal || activeGoals[0] || null;
  }

  /**
   * Check survival needs (highest priority)
   */
  checkSurvivalNeeds() {
    const vitals = this.state.getVitals?.() || { health: 20, food: 20 };

    // Critical food
    if (vitals.food < 10) {
      return {
        skill: 'find_food',
        priority: 10,
        reason: `Fome crítica: ${vitals.food}/20`,
        params: { minFood: 10 }
      };
    }

    // Critical health
    if (vitals.health < 10) {
      return {
        skill: 'regenerate',
        priority: 10,
        reason: `Vida crítica: ${vitals.health}/20`,
        params: { minHealth: 10 }
      };
    }

    // Night coming without shelter
    if (this.timeOfDay > 11000 && !this.state.hasShelter?.()) {
      return {
        skill: 'build_shelter',
        priority: 9,
        reason: 'Anoitecer - sem abrigo',
        params: { urgent: true }
      };
    }

    return null;
  }

  /**
   * Evaluate trigger expression
   */
  evaluateTrigger(trigger) {
    const inventory = this.state.getInventory?.() || [];
    const position = this.state.getPosition?.() || { x: 0, y: 64, z: 0 };

    // Simple trigger evaluation
    // Format: "condition" with && and || operators

    const conditions = {
      'inventory.wood < 16': () => this.countItem(inventory, 'wood') < 16,
      'inventory.stone < 32': () => this.countItem(inventory, 'stone') < 32,
      'inventory.iron < 16': () => this.countItem(inventory, 'iron') < 16,
      'no_pickaxe': () => !this.hasItem(inventory, 'pickaxe'),
      'no_axe': () => !this.hasItem(inventory, 'axe'),
      'has_iron_pickaxe': () => this.hasItem(inventory, 'iron_pickaxe'),
      'food < 10': () => (this.state.getVitals?.()?.food || 20) < 10,
      'night_coming': () => this.timeOfDay > 11000,
      'no_shelter': () => !this.state.hasShelter?.(),
      'inventory.full': () => this.isInventoryFull(inventory)
    };

    // Simple evaluation
    if (conditions[trigger]) {
      return conditions[trigger]();
    }

    // Complex evaluation with && and ||
    if (trigger.includes('&&')) {
      return trigger.split('&&').every(t => this.evaluateTrigger(t.trim()));
    }

    if (trigger.includes('||')) {
      return trigger.split('||').some(t => this.evaluateTrigger(t.trim()));
    }

    // Unknown trigger - return false
    return false;
  }

  /**
   * Count items by name pattern
   */
  countItem(inventory, pattern) {
    return inventory
      .filter(item => item.name.toLowerCase().includes(pattern))
      .reduce((sum, item) => sum + item.count, 0);
  }

  /**
   * Check if inventory has item
   */
  hasItem(inventory, pattern) {
    return inventory.some(item =>
      item.name.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if inventory is full
   */
  isInventoryFull(inventory) {
    // Assume 36 slots
    return inventory.length >= 36;
  }

  /**
   * Mark skill as learned
   */
  markLearned(skillName) {
    this.learnedSkills.add(skillName);
    this.updateProgress();

    logger.info(`[Curriculum] Learned skill: ${skillName}`);
  }

  /**
   * Update phase progress
   */
  updateProgress() {
    // Survival: based on basic needs met
    const vitals = this.state.getVitals?.() || { health: 20, food: 20 };
    const hasShelter = this.state.hasShelter?.() || false;
    const hasTools = this.hasItem(this.state.getInventory?.() || [], 'pickaxe') &&
                     this.hasItem(this.state.getInventory?.() || [], 'axe');

    this.phaseProgress.survival = (
      (vitals.health >= 15 ? 0.3 : 0) +
      (vitals.food >= 15 ? 0.3 : 0) +
      (hasShelter ? 0.2 : 0) +
      (hasTools ? 0.2 : 0)
    );

    // Gathering: based on resources collected
    const inventory = this.state.getInventory?.() || [];
    const wood = this.countItem(inventory, 'wood') || this.countItem(inventory, 'log');
    const stone = this.countItem(inventory, 'stone');
    const iron = this.countItem(inventory, 'iron');

    this.phaseProgress.gathering = Math.min(1, (
      (wood >= 16 ? 0.3 : wood / 16 * 0.3) +
      (stone >= 32 ? 0.3 : stone / 32 * 0.3) +
      (iron >= 16 ? 0.4 : iron / 16 * 0.4)
    ));

    // Exploration: based on discoveries
    const biomesDiscovered = this.memory?.getFacts?.('biome')?.length || 0;
    this.phaseProgress.exploration = Math.min(1, biomesDiscovered / 5);

    // Advanced: based on diamond/enchanting progress
    const diamonds = this.countItem(inventory, 'diamond');
    this.phaseProgress.advanced = Math.min(1, diamonds / 5);
  }

  /**
   * Set time of day (for circadian events)
   */
  setTimeOfDay(time) {
    const wasDay = this.timeOfDay < 12000;
    this.timeOfDay = time;
    const isDay = time < 12000;

    if (wasDay && !isDay) {
      this.dayCount++;
      logger.debug(`[Curriculum] Night ${this.dayCount}`);
    }
  }

  /**
   * Export for checkpoint
   */
  export() {
    return {
      currentPhase: this.currentPhase,
      learnedSkills: Array.from(this.learnedSkills),
      phaseProgress: this.phaseProgress,
      dayCount: this.dayCount
    };
  }

  /**
   * Import from checkpoint
   */
  import(data) {
    if (data.currentPhase) this.currentPhase = data.currentPhase;
    if (data.learnedSkills) this.learnedSkills = new Set(data.learnedSkills);
    if (data.phaseProgress) this.phaseProgress = data.phaseProgress;
    if (data.dayCount) this.dayCount = data.dayCount;
  }
}

export { CurriculumManager, CURRICULUM_PHASES };