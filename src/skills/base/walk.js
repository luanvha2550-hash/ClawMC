// src/skills/base/walk.js
// Walk skill - Navigate to coordinates

import { GoalBlock, GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout } from '../utils/navigation.js';

const logger = getLogger().module('WalkSkill');

/**
 * Walk skill
 *
 * Navigate to specific coordinates.
 * Supports both exact block targeting and near targeting.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {Object} params.target - Target coordinates {x, y, z}
 * @param {number} params.target.x - X coordinate
 * @param {number} params.target.y - Y coordinate
 * @param {number} params.target.z - Z coordinate
 * @param {number} [params.timeout=30000] - Timeout in milliseconds
 * @param {number} [params.range=0] - Range for GoalNear (0 = exact GoalBlock)
 * @returns {Promise<Object>} Result object {success, position, error}
 */
async function execute(bot, state, params) {
  const { target, timeout = 30000, range = 0 } = params;

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error };
  }

  // Validate target
  if (!target) {
    const error = 'Target coordinates required';
    logger.error(error);
    return { success: false, error };
  }

  const { x, y, z } = target;

  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    const error = 'Target must have numeric x, y, z coordinates';
    logger.error(error);
    return { success: false, error };
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    const error = 'Target coordinates must be finite numbers';
    logger.error(error);
    return { success: false, error };
  }

  // Round coordinates to integers (Minecraft uses integer block positions)
  const targetX = Math.floor(x);
  const targetY = Math.floor(y);
  const targetZ = Math.floor(z);

  logger.info(`Walking to (${targetX}, ${targetY}, ${targetZ})`, { range, timeout });

  try {
    // Create appropriate goal based on range
    const goal = range > 0
      ? new GoalNear(targetX, targetY, targetZ, range)
      : new GoalBlock(targetX, targetY, targetZ);

    // Execute navigation with timeout
    await withTimeout(
      bot.pathfinder.goto(goal),
      timeout,
      `Navigation timeout after ${timeout}ms`
    );

    // Get final position
    const position = state.getPosition();

    logger.info(`Successfully walked to (${targetX}, ${targetY}, ${targetZ})`, { position });
    return { success: true, position };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Failed to walk to target: ${error.message}`);
    return {
      success: false,
      error: error.message,
      position: state.getPosition()
    };
  }
}

// Skill metadata
export const walkSkill = {
  name: 'walk',
  description: 'Navigate to specific coordinates. Use for moving to a known location.',
  execute,
  parameters: {
    target: {
      type: 'object',
      required: true,
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        z: { type: 'number', description: 'Z coordinate' }
      }
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Timeout in milliseconds'
    },
    range: {
      type: 'number',
      required: false,
      default: 0,
      description: 'Range for GoalNear (0 = exact block)'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether navigation succeeded' },
    position: { type: 'object', description: 'Final position {x, y, z}' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default walkSkill;