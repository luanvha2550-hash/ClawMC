// src/skills/base/escape.js
// Escape skill - Flee from danger

import { GoalBlock } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout, distanceBetween } from '../utils/navigation.js';

const logger = getLogger().module('EscapeSkill');

// Hostile mob types that the bot should flee from
const HOSTILE_MOBS = [
  'zombie', 'drowned', 'husk', 'zombie_villager',
  'skeleton', 'stray', 'wither_skeleton',
  'creeper',
  'spider', 'cave_spider',
  'enderman',
  'blaze', 'ghast', 'magma_cube',
  'witch',
  'pillager', 'vindicator', 'evoker', 'ravager',
  'phantom',
  'warden'
];

// Default search range for hostiles
const DEFAULT_HOSTILE_RANGE = 24;
// Default escape distance
const DEFAULT_ESCAPE_DISTANCE = 16;
// Default timeout for escape navigation
const DEFAULT_ESCAPE_TIMEOUT = 15000;

/**
 * Escape skill
 *
 * Flee from nearby hostile entities.
 * Calculates escape direction opposite to average hostile position.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} [params.reason] - Reason for escape (optional, for logging)
 * @param {number} [params.range=24] - Range to detect hostiles
 * @param {number} [params.escapeDistance=16] - Distance to flee
 * @param {number} [params.timeout=15000] - Timeout for escape navigation
 * @returns {Promise<Object>} Result object {success, fled, hostiles, escapeDirection, error}
 */
async function execute(bot, state, params) {
  const {
    reason,
    range = DEFAULT_HOSTILE_RANGE,
    escapeDistance = DEFAULT_ESCAPE_DISTANCE,
    timeout = DEFAULT_ESCAPE_TIMEOUT
  } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error, fled: false };
  }

  // Validate range
  if (typeof range !== 'number' || range < 1) {
    const error = 'Range must be a positive number';
    logger.error(error);
    return { success: false, error, fled: false };
  }

  // Get bot position
  const botPos = bot.entity?.position;
  if (!botPos) {
    const error = 'Bot position not available';
    logger.error(error);
    return { success: false, error, fled: false };
  }

  const reasonStr = reason ? ` (reason: ${reason})` : '';
  logger.info(`Escaping from danger${reasonStr}`, { range, escapeDistance, timeout });

  try {
    // Find hostile entities nearby
    const hostileEntities = Object.values(bot.entities).filter(entity => {
      // Check if it's a hostile mob
      if (!HOSTILE_MOBS.includes(entity.name) && !HOSTILE_MOBS.includes(entity.name?.toLowerCase())) {
        return false;
      }

      // Check distance
      if (!entity.position) return false;
      const distance = distanceBetween(entity.position, botPos);

      return distance <= range;
    });

    if (hostileEntities.length === 0) {
      logger.info('No hostile entities nearby - no need to escape');
      return {
        success: true,
        fled: false,
        hostiles: [],
        message: 'No hostile entities nearby'
      };
    }

    logger.info(`Found ${hostileEntities.length} hostile entit(y/ies) nearby`);

    // Calculate average hostile position
    let avgX = 0;
    let avgY = 0;
    let avgZ = 0;

    for (const entity of hostileEntities) {
      avgX += entity.position.x;
      avgY += entity.position.y;
      avgZ += entity.position.z;
    }

    avgX /= hostileEntities.length;
    avgY /= hostileEntities.length;
    avgZ /= hostileEntities.length;

    // Calculate direction away from hostiles
    const dx = botPos.x - avgX;
    const dy = botPos.y - avgY;
    const dz = botPos.z - avgZ;

    // Normalize direction
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const normalizedDx = distance > 0 ? dx / distance : 0;
    const normalizedDy = distance > 0 ? dy / distance : 0;
    const normalizedDz = distance > 0 ? dz / distance : 0;

    // Calculate escape position
    const escapeX = Math.floor(botPos.x + normalizedDx * escapeDistance);
    const escapeY = Math.floor(botPos.y + normalizedDy * escapeDistance * 0.5); // Less vertical movement
    const escapeZ = Math.floor(botPos.z + normalizedDz * escapeDistance);

    // Clamp Y to reasonable bounds (don't escape into the void or sky)
    const clampedEscapeY = Math.max(-64, Math.min(320, escapeY));

    // Get hostile info for return
    const hostiles = hostileEntities.map(entity => ({
      name: entity.name,
      position: {
        x: Math.floor(entity.position.x),
        y: Math.floor(entity.position.y),
        z: Math.floor(entity.position.z)
      }
    }));

    logger.info(`Escaping to (${escapeX}, ${clampedEscapeY}, ${escapeZ})`, {
      hostiles: hostiles.length,
      escapeDirection: { x: normalizedDx, y: normalizedDy, z: normalizedDz }
    });

    // Navigate to escape position
    const goal = new GoalBlock(escapeX, clampedEscapeY, escapeZ);

    try {
      await withTimeout(
        bot.pathfinder.goto(goal),
        timeout,
        'Escape navigation timeout'
      );

      logger.info('Successfully escaped from hostiles');

      return {
        success: true,
        fled: true,
        hostiles,
        escapeDirection: {
          x: normalizedDx,
          y: normalizedDy,
          z: normalizedDz
        },
        targetPosition: { x: escapeX, y: clampedEscapeY, z: escapeZ }
      };

    } catch (navError) {
      logger.warn(`Navigation error during escape: ${navError.message}`);

      // Even if navigation fails, we attempted to escape
      return {
        success: false,
        fled: false,
        hostiles,
        error: `Failed to escape: ${navError.message}`,
        escapeDirection: {
          x: normalizedDx,
          y: normalizedDy,
          z: normalizedDz
        }
      };
    }

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Escape failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      fled: false
    };
  }
}

// Skill metadata
export const escapeSkill = {
  name: 'escape',
  description: 'Flee from nearby hostile entities. Calculates escape direction opposite to average hostile position.',
  execute,
  parameters: {
    reason: {
      type: 'string',
      required: false,
      description: 'Reason for escape (for logging)'
    },
    range: {
      type: 'number',
      required: false,
      default: 24,
      description: 'Range to detect hostile entities'
    },
    escapeDistance: {
      type: 'number',
      required: false,
      default: 16,
      description: 'Distance to flee'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 15000,
      description: 'Timeout for escape navigation'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether escape was successful' },
    fled: { type: 'boolean', description: 'Whether the bot actually fled' },
    hostiles: { type: 'array', description: 'Array of hostile entities detected' },
    escapeDirection: { type: 'object', description: 'Direction vector {x, y, z}' },
    targetPosition: { type: 'object', description: 'Target escape position {x, y, z}' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default escapeSkill;