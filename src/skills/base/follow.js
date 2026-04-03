// src/skills/base/follow.js
// Follow skill - Continuous follow player

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('FollowSkill');

// Default follow interval in milliseconds
const DEFAULT_FOLLOW_INTERVAL = 1000;

// Default follow distance
const DEFAULT_FOLLOW_DISTANCE = 3;

/**
 * Follow skill
 *
 * Continuously follow a player with periodic position updates.
 * Sets following state and stores interval for stop skill to clear.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.username - Target player username
 * @param {number} [params.distance=3] - Maintain this distance from player
 * @param {number} [params.interval=1000] - Update interval in milliseconds
 * @returns {Promise<Object>} Result object {success, following, error}
 */
async function execute(bot, state, params) {
  const { username, distance = DEFAULT_FOLLOW_DISTANCE, interval = DEFAULT_FOLLOW_INTERVAL } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error };
  }

  // Validate username
  if (!username || typeof username !== 'string') {
    const error = 'Username is required for follow';
    logger.error(error);
    return { success: false, error };
  }

  // Check if already following someone else
  if (state.following && state.following !== username) {
    logger.info(`Switching follow target from ${state.following} to ${username}`);
  }

  // Clear any existing follow interval
  if (state.followInterval) {
    clearInterval(state.followInterval);
    state.followInterval = null;
  }

  // Set following state
  state.setFollowing(username);

  // Track navigation state to prevent race conditions
  state.followNavigating = false;

  logger.info(`Starting to follow '${username}'`, { distance, interval });

  // Helper function to update follow target
  const updateFollow = async (intervalRef) => {
    // Prevent race conditions - skip if already navigating
    if (state.followNavigating) {
      return;
    }

    try {
      state.followNavigating = true;

      // Check if player still exists
      const player = bot.players[username];

      if (!player || !player.entity || !player.entity.position) {
        logger.warn(`Player '${username}' no longer visible, stopping follow`);
        // Clear the interval to prevent resource leak
        if (intervalRef) {
          clearInterval(intervalRef);
        }
        // Clear state reference
        if (state.followInterval === intervalRef) {
          state.followInterval = null;
        }
        state.clearFollowing();
        state.followNavigating = false;
        return;
      }

      const playerPos = player.entity.position;
      const targetX = Math.floor(playerPos.x);
      const targetY = Math.floor(playerPos.y);
      const targetZ = Math.floor(playerPos.z);

      // Create goal to get within distance
      const goal = new GoalNear(targetX, targetY, targetZ, distance);

      // Navigate to player (non-blocking, uses pathfinder queue)
      await bot.pathfinder.goto(goal);

    } catch (error) {
      // Log error but don't stop following - player might just be temporarily unavailable
      logger.warn(`Follow update error: ${error.message}`);
    } finally {
      state.followNavigating = false;
    }
  };

  // Perform initial navigation
  try {
    const player = bot.players[username];

    if (!player || !player.entity) {
      const error = `Player '${username}' not found or not visible`;
      logger.error(error);
      state.clearFollowing();
      return { success: false, error, following: null };
    }

    const playerPos = player.entity.position;
    const goal = new GoalNear(
      Math.floor(playerPos.x),
      Math.floor(playerPos.y),
      Math.floor(playerPos.z),
      distance
    );

    // Start following immediately
    bot.pathfinder.setGoal(goal, false); // false = not dynamic, will be updated by interval

  } catch (error) {
    logger.error(`Failed to start following: ${error.message}`);
    state.clearFollowing();
    return { success: false, error: error.message, following: null };
  }

  // Set up interval for continuous following
  const followInterval = setInterval(async () => {
    // Check if still following
    if (!state.following || state.following !== username) {
      clearInterval(followInterval);
      // Clear state reference if it matches
      if (state.followInterval === followInterval) {
        state.followInterval = null;
      }
      return;
    }

    // Check if bot is still connected
    if (!bot.entity) {
      logger.warn('Bot disconnected, clearing follow interval');
      clearInterval(followInterval);
      state.followInterval = null;
      state.clearFollowing();
      return;
    }

    await updateFollow(followInterval);
  }, interval);

  // Store interval reference in state for stop skill
  state.followInterval = followInterval;

  // Set up cleanup on bot disconnect
  const cleanupOnDisconnect = () => {
    if (state.followInterval) {
      clearInterval(state.followInterval);
      state.followInterval = null;
    }
    state.clearFollowing();
    logger.info('Follow cleaned up on bot disconnect');
  };

  // Listen for end event (cleanup)
  if (bot.once) {
    bot.once('end', cleanupOnDisconnect);
  }

  logger.info(`Now following '${username}'`);
  return {
    success: true,
    following: username
  };
}

// Skill metadata
export const followSkill = {
  name: 'follow',
  description: 'Continuously follow a player. Will update position periodically until stopped.',
  execute,
  parameters: {
    username: {
      type: 'string',
      required: true,
      description: 'Target player username to follow'
    },
    distance: {
      type: 'number',
      required: false,
      default: 3,
      description: 'Maintain this distance from player'
    },
    interval: {
      type: 'number',
      required: false,
      default: 1000,
      description: 'Update interval in milliseconds'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether follow started successfully' },
    following: { type: 'string', description: 'Username being followed' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default followSkill;