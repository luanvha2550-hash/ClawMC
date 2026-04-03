// src/community/roles.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Roles');

/**
 * Predefined roles with capabilities
 */
const ROLES = {
  MINER: {
    name: 'miner',
    skills: ['mine', 'explore', 'store', 'craft'],
    priority: ['iron', 'diamond', 'redstone', 'coal'],
    territory: 'underground'
  },
  FARMER: {
    name: 'farmer',
    skills: ['plant', 'harvest', 'breed', 'collect'],
    priority: ['wheat', 'carrot', 'potato', 'animals'],
    territory: 'surface'
  },
  BUILDER: {
    name: 'builder',
    skills: ['build', 'craft', 'place', 'design'],
    priority: ['structures', 'defenses', 'farms'],
    territory: 'base'
  },
  EXPLORER: {
    name: 'explorer',
    skills: ['explore', 'map', 'scout', 'collect'],
    priority: ['new_chunks', 'villages', 'biomes'],
    territory: 'world'
  },
  DEFENDER: {
    name: 'defender',
    skills: ['fight', 'guard', 'patrol', 'protect'],
    priority: ['mobs', 'threats'],
    territory: 'perimeter'
  },
  GATHERER: {
    name: 'gatherer',
    skills: ['collect', 'chop', 'store'],
    priority: ['wood', 'stone', 'food'],
    territory: 'surface'
  }
};

/**
 * Role Manager - Assigns and manages bot roles
 */
class RoleManager {
  constructor() {
    this.roles = new Map(); // botName -> role
    this.validRoles = new Set(Object.values(ROLES).map(r => r.name));
  }

  /**
   * Assign role to bot
   */
  assignRole(botName, roleName) {
    if (!this.validRoles.has(roleName)) {
      throw new Error(`Invalid role: ${roleName}`);
    }

    this.roles.set(botName, roleName);
    logger.info(`[Roles] Assigned ${roleName} to ${botName}`);
  }

  /**
   * Get role for bot
   */
  getRole(botName) {
    return this.roles.get(botName);
  }

  /**
   * Get role capabilities
   */
  getCapabilities(roleName) {
    const role = Object.values(ROLES).find(r => r.name === roleName);

    if (!role) {
      return null;
    }

    return {
      skills: [...role.skills],
      priority: [...role.priority],
      territory: role.territory
    };
  }

  /**
   * Check if role can perform skill
   */
  canPerform(roleName, skillName) {
    const caps = this.getCapabilities(roleName);
    if (!caps) return false;

    return caps.skills.includes(skillName);
  }

  /**
   * Suggest role based on current community composition
   */
  suggestRole(assignedRoles = this.roles) {
    const counts = {};

    // Count roles
    for (const role of assignedRoles.values()) {
      counts[role] = (counts[role] || 0) + 1;
    }

    // Find missing or under-represented roles
    const allRoles = Object.values(ROLES).map(r => r.name);
    const missing = allRoles.filter(r => !counts[r]);
    const underRepresented = allRoles.filter(r => counts[r] < 2);

    // Prefer missing roles
    if (missing.length > 0) {
      return missing[0];
    }

    // Then under-represented
    if (underRepresented.length > 0) {
      return underRepresented[Math.floor(Math.random() * underRepresented.length)];
    }

    // Default to gatherer
    return 'gatherer';
  }

  /**
   * Auto-assign role based on preferences
   */
  autoAssign(botName, preferredRoles = []) {
    // Check if already assigned
    if (this.roles.has(botName)) {
      return this.roles.get(botName);
    }

    // Try preferred roles first
    for (const pref of preferredRoles) {
      if (this.validRoles.has(pref)) {
        const count = this.countRole(pref);
        if (count < 2) { // Max 2 of each role
          this.assignRole(botName, pref);
          return pref;
        }
      }
    }

    // Suggest based on current composition
    const suggested = this.suggestRole();
    this.assignRole(botName, suggested);
    return suggested;
  }

  /**
   * Count bots with specific role
   */
  countRole(roleName) {
    let count = 0;
    for (const role of this.roles.values()) {
      if (role === roleName) count++;
    }
    return count;
  }

  /**
   * Get all bots with role
   */
  getBotsWithRole(roleName) {
    const bots = [];
    for (const [botName, role] of this.roles) {
      if (role === roleName) {
        bots.push(botName);
      }
    }
    return bots;
  }

  /**
   * Get role distribution
   */
  getDistribution() {
    const dist = {};
    for (const role of this.roles.values()) {
      dist[role] = (dist[role] || 0) + 1;
    }
    return dist;
  }

  /**
   * Check if territory is available
   */
  isTerritoryAvailable(territory) {
    // Count bots in territory
    let count = 0;
    for (const [_, role] of this.roles) {
      const caps = this.getCapabilities(role);
      if (caps?.territory === territory) {
        count++;
      }
    }
    return count < 2; // Max 2 bots per territory
  }

  /**
   * Export for checkpoint
   */
  export() {
    return {
      roles: Array.from(this.roles.entries())
    };
  }

  /**
   * Import from checkpoint
   */
  import(data) {
    if (data.roles) {
      this.roles = new Map(data.roles);
    }
  }
}

export { RoleManager, ROLES };