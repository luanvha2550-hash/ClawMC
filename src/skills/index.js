// src/skills/index.js
// SkillRegistry - Registry for base and dynamic skills

import { getLogger } from '../utils/logger.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

const logger = getLogger().module('SkillRegistry');

/**
 * SkillRegistry
 *
 * Manages registration and retrieval of skills.
 * Supports both base skills (predefined) and dynamic skills (learned/generated).
 */
class SkillRegistry {
  constructor() {
    // Base skills (predefined, loaded from files)
    this.skills = new Map();

    // Dynamic skills (learned/generated at runtime)
    this.dynamicSkills = new Map();
  }

  /**
   * Validate skill structure
   * @param {Object} skill - Skill to validate
   * @throws {Error} If skill is invalid
   */
  validateSkill(skill) {
    if (!skill.name || typeof skill.name !== 'string' || skill.name.trim() === '') {
      throw new Error('Skill must have a name');
    }
    if (!skill.execute || typeof skill.execute !== 'function') {
      throw new Error(`Skill '${skill.name}' must have execute function`);
    }
  }

  /**
   * Register a base skill
   * @param {Object} skill - Skill object with name, description, execute, etc.
   * @throws {Error} If skill already registered or invalid
   */
  register(skill) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill '${skill.name}' already registered`);
    }

    this.validateSkill(skill);

    this.skills.set(skill.name, {
      ...skill,
      type: 'base',
      registered: Date.now()
    });

    logger.debug(`Skill registered: ${skill.name}`);
  }

  /**
   * Get skill by name
   * @param {string} name - Skill name
   * @returns {Object|undefined} Skill object or undefined
   */
  get(name) {
    // Check base skills first, then dynamic
    return this.skills.get(name) || this.dynamicSkills.get(name);
  }

  /**
   * Check if skill exists
   * @param {string} name - Skill name
   * @returns {boolean} True if skill exists
   */
  has(name) {
    return this.skills.has(name) || this.dynamicSkills.has(name);
  }

  /**
   * List all skills (base and dynamic)
   * @returns {Array} Array of all skills
   */
  list() {
    return [
      ...Array.from(this.skills.values()),
      ...Array.from(this.dynamicSkills.values())
    ];
  }

  /**
   * List base skills only
   * @returns {Array} Array of base skills
   */
  listBase() {
    return Array.from(this.skills.values());
  }

  /**
   * List dynamic skills only
   * @returns {Array} Array of dynamic skills
   */
  listDynamic() {
    return Array.from(this.dynamicSkills.values());
  }

  /**
   * Register a dynamic skill
   * @param {Object} skill - Skill object
   * @throws {Error} If skill is invalid
   */
  registerDynamic(skill) {
    this.validateSkill(skill);

    const isUpdate = this.dynamicSkills.has(skill.name);

    this.dynamicSkills.set(skill.name, {
      ...skill,
      type: 'dynamic',
      registered: Date.now()
    });

    if (isUpdate) {
      logger.info(`Dynamic skill updated: ${skill.name}`);
    } else {
      logger.info(`Dynamic skill registered: ${skill.name}`);
    }
  }

  /**
   * Unregister a dynamic skill
   * @param {string} name - Skill name
   * @returns {boolean} True if skill was unregistered
   */
  unregisterDynamic(name) {
    if (this.dynamicSkills.has(name)) {
      this.dynamicSkills.delete(name);
      logger.info(`Dynamic skill unregistered: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Find skills matching a query (keyword match)
   * @param {string} query - Search query
   * @returns {Array} Array of {skill, confidence} objects
   */
  findSimilar(query) {
    const queryLower = query.toLowerCase();
    const matches = [];

    for (const skill of this.list()) {
      const nameMatch = skill.name.toLowerCase().includes(queryLower);
      const descMatch = skill.description?.toLowerCase().includes(queryLower);

      if (nameMatch || descMatch) {
        matches.push({
          skill,
          confidence: nameMatch ? 0.9 : 0.7
        });
      }
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Load base skills from a directory
   * @param {string} skillsDir - Directory containing skill modules
   * @returns {Promise<number>} Number of skills loaded
   */
  async loadBaseSkills(skillsDir = './src/skills/base') {
    try {
      const files = await readdir(skillsDir);
      const jsFiles = files.filter(f => f.endsWith('.js') && f !== 'index.js');

      let loadedCount = 0;

      for (const file of jsFiles) {
        try {
          const module = await import(join(skillsDir, file));
          const skill = module.default || module;

          if (skill.name && skill.execute) {
            this.register(skill);
            loadedCount++;
          } else {
            logger.warn(`Invalid skill file: ${file}`);
          }
        } catch (error) {
          logger.error(`Failed to load skill ${file}: ${error.message}`);
        }
      }

      logger.info(`Loaded ${loadedCount} base skills from ${skillsDir}`);
      return loadedCount;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Skills directory not found: ${skillsDir}`);
        return 0;
      }
      throw error;
    }
  }

  /**
   * Get all skill names
   * @returns {Array} Array of skill names
   */
  getNames() {
    return [
      ...Array.from(this.skills.keys()),
      ...Array.from(this.dynamicSkills.keys())
    ];
  }

  /**
   * Clear all skills (for testing)
   */
  clear() {
    this.skills.clear();
    this.dynamicSkills.clear();
  }

  /**
   * Export skills for serialization
   * @returns {Object} Exportable data
   */
  export() {
    return {
      baseSkills: Array.from(this.skills.entries()).map(([name, skill]) => ({
        name,
        description: skill.description,
        type: skill.type
      })),
      dynamicSkills: Array.from(this.dynamicSkills.entries()).map(([name, skill]) => ({
        name,
        description: skill.description,
        type: skill.type,
        code: skill.code // Dynamic skills may have code
      }))
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Create a new SkillRegistry instance
 * @returns {SkillRegistry} New SkillRegistry instance
 */
export function createSkillRegistry() {
  instance = new SkillRegistry();
  return instance;
}

/**
 * Get the singleton SkillRegistry instance
 * @returns {SkillRegistry} SkillRegistry instance
 */
export function getSkillRegistry() {
  if (!instance) {
    instance = new SkillRegistry();
  }
  return instance;
}

export { SkillRegistry };