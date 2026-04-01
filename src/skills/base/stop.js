// src/skills/base/stop.js
// Stop skill - Stop pathfinding and clear state

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('StopSkill');

/**
 * Stop skill
 *
 * Stop all pathfinding and clear following state.
 * Used to halt movement activities.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters (none required)
 * @returns {Promise<Object>} Result object {success, wasFollowing, clearedTask}
 */
async function execute(bot, state, params) {
  // Validate bot
  if (!bot) {
    const error = 'Bot not available';
    logger.error(error);
    return { success: false, error };
  }

  logger.info('Stopping all movement');

  // Track what we stopped
  const wasFollowing = state.following;
  const hadTask = state.currentTask !== null;

  // Stop pathfinder
  if (bot.pathfinder && bot.pathfinder.stop) {
    try {
      bot.pathfinder.stop();
      logger.debug('Pathfinder stopped');
    } catch (error) {
      logger.warn(`Error stopping pathfinder: ${error.message}`);
    }
  }

  // Clear pathfinder goal
  if (bot.pathfinder && bot.pathfinder.setGoal) {
    try {
      bot.pathfinder.setGoal(null);
      logger.debug('Pathfinder goal cleared');
    } catch (error) {
      logger.warn(`Error clearing pathfinder goal: ${error.message}`);
    }
  }

  // Clear follow interval if exists
  if (state.followInterval) {
    clearInterval(state.followInterval);
    state.followInterval = null;
    logger.debug('Follow interval cleared');
  }

  // Clear following state
  if (state.following) {
    state.clearFollowing();
    logger.debug('Following state cleared');
  }

  // Clear current task
  if (hadTask) {
    state.clearTask();
    logger.debug('Task cleared');
  }

  logger.info('Stop complete', { wasFollowing, hadTask });

  return {
    success: true,
    wasFollowing,
    clearedTask: hadTask
  };
}

// Skill metadata
export const stopSkill = {
  name: 'stop',
  description: 'Stop all movement activities. Stops pathfinding, clears follow state, and clears current task.',
  execute,
  parameters: {}, // No parameters required
  returns: {
    success: { type: 'boolean', description: 'Always returns true on success' },
    wasFollowing: { type: 'string', description: 'Username that was being followed (if any)' },
    clearedTask: { type: 'boolean', description: 'Whether a task was cleared' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default stopSkill;