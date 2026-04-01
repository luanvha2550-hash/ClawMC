// src/skills/base/store.js
// Store skill - Store items in chest

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout } from '../utils/navigation.js';

const logger = getLogger().module('StoreSkill');

// Default search range for finding chests
const DEFAULT_SEARCH_RANGE = 32;
// Default timeout for chest operations
const DEFAULT_TIMEOUT = 30000;

/**
 * Store skill
 *
 * Find a chest and store items in it.
 * Navigates to chest and deposits items.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.item - Item name to store (required)
 * @param {number} [params.count] - Number of items to store (optional, all if not specified)
 * @param {number} [params.range=32] - Search range for chests
 * @param {number} [params.timeout=30000] - Timeout for operation in milliseconds
 * @returns {Promise<Object>} Result object {success, stored, item, error}
 */
async function execute(bot, state, params) {
  const {
    item,
    count,
    range = DEFAULT_SEARCH_RANGE,
    timeout = DEFAULT_TIMEOUT
  } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error, stored: 0 };
  }

  // Validate item name
  if (!item || typeof item !== 'string') {
    const error = 'Item name is required';
    logger.error(error);
    return { success: false, error, stored: 0 };
  }

  // Validate count if specified
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    const error = 'Count must be a positive integer if specified';
    logger.error(error);
    return { success: false, error, stored: 0 };
  }

  logger.info(`Storing ${count !== undefined ? count : 'all'} ${item}(s)`, { range, timeout });

  try {
    // Find chest blocks
    const chestPositions = bot.findBlocks({
      matching: block => block.name === 'chest' || block.name === 'trapped_chest',
      maxDistance: range,
      count: 1
    });

    if (!chestPositions || chestPositions.length === 0) {
      const error = `No chest found within range ${range}`;
      logger.warn(error);
      return { success: false, error, stored: 0 };
    }

    const chestPos = chestPositions[0];
    const chestBlock = bot.blockAt(chestPos);

    if (!chestBlock) {
      const error = 'Chest block not loaded';
      logger.error(error);
      return { success: false, error, stored: 0 };
    }

    // Navigate to chest
    const goal = new GoalNear(
      chestPos.x,
      chestPos.y,
      chestPos.z,
      2 // Get within 2 blocks to open chest
    );

    try {
      await withTimeout(
        bot.pathfinder.goto(goal),
        timeout,
        'Navigation timeout for chest'
      );
    } catch (navError) {
      logger.warn(`Failed to reach chest: ${navError.message}`);
      return {
        success: false,
        error: `Failed to reach chest: ${navError.message}`,
        stored: 0
      };
    }

    // Find item in inventory
    const inventoryItems = bot.inventory.items();
    const matchingItems = inventoryItems.filter(invItem =>
      invItem.name === item || invItem.name.includes(item)
    );

    if (matchingItems.length === 0) {
      const error = `No '${item}' found in inventory`;
      logger.warn(error);
      return { success: false, error, stored: 0 };
    }

    // Calculate total count
    const totalAvailable = matchingItems.reduce((sum, invItem) => sum + invItem.count, 0);
    const itemsToStore = count !== undefined ? Math.min(count, totalAvailable) : totalAvailable;

    if (itemsToStore === 0) {
      const error = `No items to store`;
      logger.warn(error);
      return { success: false, error, stored: 0 };
    }

    // Open chest
    let chest;
    try {
      chest = await withTimeout(
        bot.openChest(chestBlock),
        5000,
        'Chest open timeout'
      );
    } catch (openError) {
      logger.error(`Failed to open chest: ${openError.message}`);
      return {
        success: false,
        error: `Failed to open chest: ${openError.message}`,
        stored: 0
      };
    }

    // Deposit items
    let storedCount = 0;
    let remainingToStore = itemsToStore;

    try {
      for (const invItem of matchingItems) {
        if (remainingToStore <= 0) break;

        const depositCount = Math.min(invItem.count, remainingToStore);

        try {
          await withTimeout(
            chest.deposit(invItem.type, null, depositCount),
            5000,
            'Deposit timeout'
          );

          storedCount += depositCount;
          remainingToStore -= depositCount;

          logger.debug(`Deposited ${depositCount} ${invItem.name}`);
        } catch (depositError) {
          logger.warn(`Failed to deposit item: ${depositError.message}`);
          // Continue with remaining items
          break;
        }
      }
    } finally {
      // Always close the chest
      try {
        chest.close();
      } catch (closeError) {
        logger.warn(`Failed to close chest: ${closeError.message}`);
      }
    }

    const success = storedCount > 0;
    logger.info(`Stored ${storedCount}/${itemsToStore} ${item}(s)`);

    return {
      success,
      stored: storedCount,
      item,
      chest: {
        position: { x: chestPos.x, y: chestPos.y, z: chestPos.z }
      }
    };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Store failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      stored: 0
    };
  }
}

// Skill metadata
export const storeSkill = {
  name: 'store',
  description: 'Find a chest and store items in it. Navigates to chest and deposits items.',
  execute,
  parameters: {
    item: {
      type: 'string',
      required: true,
      description: 'Item name to store (e.g., "cobblestone", "dirt")'
    },
    count: {
      type: 'number',
      required: false,
      description: 'Number of items to store (optional, all if not specified)'
    },
    range: {
      type: 'number',
      required: false,
      default: 32,
      description: 'Search range for chests'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Timeout for operation in milliseconds'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether items were stored successfully' },
    stored: { type: 'number', description: 'Number of items actually stored' },
    item: { type: 'string', description: 'Item name that was stored' },
    chest: { type: 'object', description: 'Chest position {position: {x, y, z}}' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default storeSkill;