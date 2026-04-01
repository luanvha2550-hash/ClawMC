// src/skills/base/attack.js
// Attack skill - Attack entities by type

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout, distanceBetween } from '../utils/navigation.js';

const logger = getLogger().module('AttackSkill');

// Default search range for finding entities
const DEFAULT_RANGE = 32;
// Default attack timeout
const DEFAULT_ATTACK_TIMEOUT = 10000;
// Attack cooldown in milliseconds
const ATTACK_COOLDOWN = 500;

/**
 * Attack skill
 *
 * Find and attack entities by type/name.
 * Navigates to entity and attacks.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.target - Entity type/name to attack (required)
 * @param {number} [params.count=1] - Number of entities to attack
 * @param {number} [params.range=32] - Search range for entities
 * @param {number} [params.timeout=10000] - Timeout per attack in milliseconds
 * @returns {Promise<Object>} Result object {success, attacked, targets, error}
 */
async function execute(bot, state, params) {
  const {
    target,
    count = 1,
    range = DEFAULT_RANGE,
    timeout = DEFAULT_ATTACK_TIMEOUT
  } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error, attacked: 0 };
  }

  // Validate target
  if (!target || typeof target !== 'string') {
    const error = 'Target entity name is required';
    logger.error(error);
    return { success: false, error, attacked: 0 };
  }

  // Validate count
  if (!Number.isInteger(count) || count < 1) {
    const error = 'Count must be a positive integer';
    logger.error(error);
    return { success: false, error, attacked: 0 };
  }

  logger.info(`Attacking ${count} ${target}(s)`, { range, timeout });

  // Get bot position for distance calculation
  const botPos = bot.entity?.position;
  if (!botPos) {
    const error = 'Bot position not available';
    logger.error(error);
    return { success: false, error, attacked: 0 };
  }

  let attackedCount = 0;
  const attackedEntities = [];

  try {
    for (let i = 0; i < count; i++) {
      // Find entities matching target
      const targetEntities = Object.values(bot.entities).filter(entity => {
        // Match by name
        if (entity.name !== target && entity.name !== target.toLowerCase()) {
          // Also check displayName for some entities
          if (!entity.displayName?.toLowerCase?.()?.includes?.(target.toLowerCase())) {
            return false;
          }
        }

        // Check distance
        if (!entity.position) return false;
        const distance = distanceBetween(entity.position, botPos);

        return distance <= range;
      });

      // Sort by distance (closest first)
      targetEntities.sort((a, b) => {
        const distA = a.position.distanceTo(botPos);
        const distB = b.position.distanceTo(botPos);
        return distA - distB;
      });

      // Filter out already attacked entities
      const unattackedEntities = targetEntities.filter(e =>
        !attackedEntities.some(a => a.id === e.id)
      );

      if (unattackedEntities.length === 0) {
        const message = attackedCount > 0
          ? `No more ${target} entities found (attacked ${attackedCount})`
          : `No '${target}' entities found within range ${range}`;
        logger.warn(message);
        return {
          success: attackedCount > 0,
          attacked: attackedCount,
          targets: attackedEntities,
          error: attackedCount > 0 ? null : message
        };
      }

      const targetEntity = unattackedEntities[0];
      const entityPos = targetEntity.position;

      // Navigate to entity
      const goal = new GoalNear(
        Math.floor(entityPos.x),
        Math.floor(entityPos.y),
        Math.floor(entityPos.z),
        3 // Get within 3 blocks to attack
      );

      try {
        await withTimeout(
          bot.pathfinder.goto(goal),
          timeout,
          `Navigation timeout for ${target}`
        );
      } catch (navError) {
        logger.warn(`Failed to reach ${target}: ${navError.message}`);
        // Continue to next entity if we can't reach this one
        continue;
      }

      // Attack the entity
      try {
        // Equip best weapon if available
        const weapon = findBestWeapon(bot);
        if (weapon) {
          await bot.equip(weapon, 'hand');
        }

        // Perform attack
        bot.attack(targetEntity);

        // Wait for attack cooldown
        await new Promise(resolve => setTimeout(resolve, ATTACK_COOLDOWN));

        // Check if entity still exists
        const entityStillExists = bot.entities[targetEntity.id] !== undefined;

        attackedCount++;
        attackedEntities.push({
          id: targetEntity.id,
          name: targetEntity.name,
          position: { x: entityPos.x, y: entityPos.y, z: entityPos.z },
          killed: !entityStillExists
        });

        logger.info(`Attacked ${targetEntity.name} (ID: ${targetEntity.id})`);

      } catch (attackError) {
        logger.warn(`Failed to attack ${target}: ${attackError.message}`);
        // Continue to next entity
        continue;
      }
    }

    const success = attackedCount === count;
    logger.info(`Attack complete: ${attackedCount}/${count} entities attacked`);

    return {
      success,
      attacked: attackedCount,
      target,
      targets: attackedEntities
    };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Attack failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      attacked: attackedCount,
      targets: attackedEntities
    };
  }
}

/**
 * Find best weapon in inventory
 * @param {Object} bot - Mineflayer bot instance
 * @returns {Object|null} Best weapon item or null
 */
function findBestWeapon(bot) {
  const weapons = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'];

  for (const weaponName of weapons) {
    const weapon = bot.inventory.items().find(item => item.name === weaponName);
    if (weapon) {
      return weapon;
    }
  }

  return null;
}

// Skill metadata
export const attackSkill = {
  name: 'attack',
  description: 'Find and attack entities by type. Navigates to entity and attacks.',
  execute,
  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Entity type/name to attack (e.g., "zombie", "skeleton", "cow")'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Number of entities to attack'
    },
    range: {
      type: 'number',
      required: false,
      default: 32,
      description: 'Search range for entities'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 10000,
      description: 'Timeout per attack in milliseconds'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether all attacks succeeded' },
    attacked: { type: 'number', description: 'Number of entities attacked' },
    target: { type: 'string', description: 'Target entity name' },
    targets: { type: 'array', description: 'Array of attacked entities' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default attackSkill;