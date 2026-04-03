// src/autonomy/survival.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Survival');

/**
 * Hostile mob types
 */
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'phantom', 'drowned', 'husk', 'stray'
];

/**
 * Survival Monitor - Highest priority autonomous checks
 */
class SurvivalMonitor {
  constructor(bot, state, config = {}) {
    this.bot = bot;
    this.state = state;

    this.thresholds = {
      minFood: config.minFood || 10,
      minHealth: config.minHealth || 10,
      maxDanger: config.maxDanger || 3
    };
  }

  /**
   * Check survival conditions
   * Returns a goal if action needed, null otherwise
   */
  async check() {
    const vitals = this.getVitals();

    // Priority 1: Critical food
    if (vitals.food < this.thresholds.minFood) {
      return {
        skill: 'find_food',
        priority: 10,
        reason: `Fome crítica: ${vitals.food}/20`,
        params: { minFood: this.thresholds.minFood }
      };
    }

    // Priority 2: Critical health
    if (vitals.health < this.thresholds.minHealth) {
      return {
        skill: 'regenerate',
        priority: 10,
        reason: `Vida crítica: ${vitals.health}/20`,
        params: { minHealth: this.thresholds.minHealth }
      };
    }

    // Priority 3: Danger nearby
    const hostiles = this.countHostileMobs(20);
    if (hostiles > this.thresholds.maxDanger) {
      return {
        skill: 'escape',
        priority: 10,
        reason: `${hostiles} mobs hostis próximos`,
        params: { hostiles }
      };
    }

    // All good
    return null;
  }

  /**
   * Get vitals (health, food)
   */
  getVitals() {
    return {
      health: this.bot?.health ?? 20,
      food: this.bot?.food ?? 20
    };
  }

  /**
   * Count hostile mobs in range
   */
  countHostileMobs(range) {
    const entities = Object.values(this.bot?.entities || {});
    const botPos = this.bot?.entity?.position;

    if (!botPos) return 0;

    return entities.filter(e => {
      // Check if hostile
      const isHostile = HOSTILE_MOBS.some(h =>
        e.name?.toLowerCase().includes(h)
      );

      if (!isHostile) return false;

      // Check distance
      const distance = e.position?.distanceTo?.(botPos) || 999;
      return distance < range;
    }).length;
  }

  /**
   * Check if safe to act
   */
  isSafe() {
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    return (
      vitals.health >= this.thresholds.minHealth &&
      vitals.food >= this.thresholds.minFood &&
      hostiles <= this.thresholds.maxDanger
    );
  }

  /**
   * Get survival status
   */
  getStatus() {
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    return {
      health: vitals.health,
      food: vitals.food,
      hostiles,
      isSafe: this.isSafe(),
      alerts: this.getAlerts()
    };
  }

  /**
   * Get active alerts
   */
  getAlerts() {
    const alerts = [];
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    if (vitals.food < this.thresholds.minFood) {
      alerts.push({
        type: 'food',
        severity: 'critical',
        message: `Fome: ${vitals.food}/20`
      });
    }

    if (vitals.health < this.thresholds.minHealth) {
      alerts.push({
        type: 'health',
        severity: 'critical',
        message: `Vida: ${vitals.health}/20`
      });
    }

    if (hostiles > this.thresholds.maxDanger) {
      alerts.push({
        type: 'danger',
        severity: 'high',
        message: `${hostiles} mobs hostis`
      });
    }

    return alerts;
  }

  /**
   * Get nearest hostile mob
   */
  getNearestHostile() {
    const entities = Object.values(this.bot?.entities || {});
    const botPos = this.bot?.entity?.position;

    if (!botPos) return null;

    let nearest = null;
    let nearestDist = Infinity;

    for (const e of entities) {
      const isHostile = HOSTILE_MOBS.some(h =>
        e.name?.toLowerCase().includes(h)
      );

      if (!isHostile) continue;

      const dist = e.position?.distanceTo?.(botPos);
      if (dist && dist < nearestDist) {
        nearest = e;
        nearestDist = dist;
      }
    }

    return nearest ? { entity: nearest, distance: nearestDist } : null;
  }

  /**
   * Get escape direction
   */
  getEscapeDirection() {
    const nearest = this.getNearestHostile();
    if (!nearest) return null;

    const botPos = this.bot.entity.position;
    const hostilePos = nearest.entity.position;

    // Direction away from hostile
    const dx = botPos.x - hostilePos.x;
    const dz = botPos.z - hostilePos.z;

    // Normalize and scale
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length === 0) return { x: 0, z: 0 };

    return {
      x: botPos.x + (dx / length) * 30,
      z: botPos.z + (dz / length) * 30
    };
  }
}

export { SurvivalMonitor, HOSTILE_MOBS };