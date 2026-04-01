// src/skills/base/mine.js
// Mine skill - Find and dig blocks

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout } from '../utils/navigation.js';

const logger = getLogger().module('MineSkill');

// Default timeout for mining a single block
const DEFAULT_MINE_TIMEOUT = 30000;
// Default search range for finding blocks
const DEFAULT_SEARCH_RANGE = 64;

/**
 * Mine skill
 *
 * Find and dig blocks by name. Navigates to block and mines it.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.block - Block name to mine (required)
 * @param {number} [params.count=1] - Number of blocks to mine
 * @param {number} [params.timeout=30000] - Timeout per block in milliseconds
 * @param {number} [params.range=64] - Search range for blocks
 * @returns {Promise<Object>} Result object {success, mined, block, error}
 */
async function execute(bot, state, params) {
  const {
    block,
    count = 1,
    timeout = DEFAULT_MINE_TIMEOUT,
    range = DEFAULT_SEARCH_RANGE
  } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error, mined: 0 };
  }

  // Validate block name
  if (!block || typeof block !== 'string') {
    const error = 'Block name is required';
    logger.error(error);
    return { success: false, error, mined: 0 };
  }

  // Validate count
  if (!Number.isInteger(count) || count < 1) {
    const error = 'Count must be a positive integer';
    logger.error(error);
    return { success: false, error, mined: 0 };
  }

  logger.info(`Mining ${count} ${block}(s)`, { range, timeout });

  let minedCount = 0;
  const minedBlocks = [];

  try {
    for (let i = 0; i < count; i++) {
      // Find the block
      const blockPositions = bot.findBlocks({
        matching: block,
        maxDistance: range,
        count: 1
      });

      if (!blockPositions || blockPositions.length === 0) {
        const message = minedCount > 0
          ? `No more ${block} found (mined ${minedCount})`
          : `Block '${block}' not found within range ${range}`;
        logger.warn(message);
        return {
          success: minedCount > 0,
          mined: minedCount,
          blocks: minedBlocks,
          error: minedCount > 0 ? null : message
        };
      }

      const targetPos = blockPositions[0];
      const targetBlock = bot.blockAt(targetPos);

      if (!targetBlock) {
        logger.warn(`Block at ${targetPos} is not loaded`);
        continue;
      }

      // Navigate to block
      const goal = new GoalNear(
        targetPos.x,
        targetPos.y,
        targetPos.z,
        3 // Stay within 3 blocks to reach the block
      );

      try {
        await withTimeout(
          bot.pathfinder.goto(goal),
          timeout,
          `Navigation timeout for block ${i + 1}`
        );
      } catch (navError) {
        logger.warn(`Failed to reach block: ${navError.message}`);
        // Continue to next block if we can't reach this one
        continue;
      }

      // Check if we can dig this block
      const digTime = bot.digTime(targetBlock);

      // Dig the block with timeout
      try {
        await withTimeout(
          bot.dig(targetBlock),
          Math.max(timeout, digTime + 5000),
          `Dig timeout for block ${i + 1}`
        );

        minedCount++;
        minedBlocks.push({
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
          name: targetBlock.name
        });

        logger.info(`Mined ${block} at (${targetPos.x}, ${targetPos.y}, ${targetPos.z})`);

      } catch (digError) {
        logger.warn(`Failed to dig block: ${digError.message}`);
        // Continue to next block
        continue;
      }
    }

    const success = minedCount === count;
    logger.info(`Mining complete: ${minedCount}/${count} blocks`);

    return {
      success,
      mined: minedCount,
      block,
      blocks: minedBlocks
    };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Mining failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      mined: minedCount,
      blocks: minedBlocks
    };
  }
}

// Skill metadata
export const mineSkill = {
  name: 'mine',
  description: 'Find and mine blocks by name. Navigates to each block and digs it.',
  execute,
  parameters: {
    block: {
      type: 'string',
      required: true,
      description: 'Block name to mine (e.g., "stone", "dirt", "iron_ore")'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Number of blocks to mine'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Timeout per block in milliseconds'
    },
    range: {
      type: 'number',
      required: false,
      default: 64,
      description: 'Search range for blocks'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether all blocks were mined successfully' },
    mined: { type: 'number', description: 'Number of blocks actually mined' },
    block: { type: 'string', description: 'Block name that was mined' },
    blocks: { type: 'array', description: 'Array of mined block positions' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default mineSkill;