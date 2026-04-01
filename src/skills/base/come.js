// src/skills/base/come.js
// Come skill - Navigate to player

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('ComeSkill');

/**
 * Come skill
 *
 * Navigate to a player's position.
 * If no username is provided, uses the last caller from state.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} [params.username] - Target player username (optional, uses lastCaller)
 * @param {number} [params.range=3] - Stop within this range of player
 * @param {number} [params.timeout=30000] - Timeout in milliseconds
 * @returns {Promise<Object>} Result object {success, target, position, error}
 */
async function execute(bot, state, params) {
  const { username, range = 3, timeout = 30000 } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error };
  }

  // Determine target player
  let targetUsername = username;

  // If no username provided, try to get lastCaller from state
  if (!targetUsername) {
    // Check if state has lastCaller (from command context)
    if (state.lastCaller) {
      targetUsername = state.lastCaller;
    } else {
      const error = 'No target player specified and no last caller available';
      logger.error(error);
      return { success: false, error };
    }
  }

  // Find the player
  const player = bot.players[targetUsername];

  if (!player) {
    const error = `Player '${targetUsername}' not found`;
    logger.error(error);
    return { success: false, error, target: targetUsername };
  }

  if (!player.entity) {
    const error = `Player '${targetUsername}' is not visible/loaded`;
    logger.error(error);
    return { success: false, error, target: targetUsername };
  }

  // Get player position
  const playerPos = player.entity.position;

  if (!playerPos) {
    const error = `Player '${targetUsername}' has no position`;
    logger.error(error);
    return { success: false, error, target: targetUsername };
  }

  // Round to integer coordinates
  const targetX = Math.floor(playerPos.x);
  const targetY = Math.floor(playerPos.y);
  const targetZ = Math.floor(playerPos.z);

  logger.info(`Coming to player '${targetUsername}' at (${targetX}, ${targetY}, ${targetZ})`, { range, timeout });

  try {
    // Create GoalNear - get within range of the player
    const goal = new GoalNear(targetX, targetY, targetZ, range);

    // Set up timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Navigation timeout after ${timeout}ms`));
      }, timeout);
    });

    // Execute navigation
    const navigationPromise = bot.pathfinder.goto(goal);

    // Race between navigation and timeout
    await Promise.race([navigationPromise, timeoutPromise]);

    // Get final position
    const position = state.getPosition();

    logger.info(`Successfully came to player '${targetUsername}'`, { position });
    return {
      success: true,
      target: targetUsername,
      position
    };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Failed to come to player: ${error.message}`);
    return {
      success: false,
      error: error.message,
      target: targetUsername,
      position: state.getPosition()
    };
  }
}

// Skill metadata
export const comeSkill = {
  name: 'come',
  description: 'Navigate to a player. If no username provided, goes to the last command caller.',
  execute,
  parameters: {
    username: {
      type: 'string',
      required: false,
      description: 'Target player username (optional, uses lastCaller if not provided)'
    },
    range: {
      type: 'number',
      required: false,
      default: 3,
      description: 'Stop within this range of player'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Timeout in milliseconds'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether navigation succeeded' },
    target: { type: 'string', description: 'Target player username' },
    position: { type: 'object', description: 'Final position {x, y, z}' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default comeSkill;