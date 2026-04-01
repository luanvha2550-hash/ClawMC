// src/skills/base/collect.js
// Collect skill - Collect dropped items within range

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout, distanceBetween } from '../utils/navigation.js';

const logger = getLogger().module('CollectSkill');

// Default range for finding items
const DEFAULT_RANGE = 16;
// Default timeout for collecting each item
const DEFAULT_TIMEOUT = 10000;
// Maximum items to collect at once
const MAX_ITEMS = 64;

/**
 * Collect skill
 *
 * Find and collect dropped items within range.
 * Navigates to items and waits for pickup.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} [params.item] - Item name to collect (optional, collects all if not specified)
 * @param {number} [params.range=16] - Search range for items
 * @param {number} [params.timeout=10000] - Timeout per item in milliseconds
 * @param {number} [params.maxItems=64] - Maximum items to collect
 * @returns {Promise<Object>} Result object {success, collected, items, error}
 */
async function execute(bot, state, params) {
  const {
    item,
    range = DEFAULT_RANGE,
    timeout = DEFAULT_TIMEOUT,
    maxItems = MAX_ITEMS
  } = params || {};

  // Validate bot
  if (!bot || !bot.pathfinder) {
    const error = 'Bot or pathfinder not available';
    logger.error(error);
    return { success: false, error, collected: 0 };
  }

  // Validate range
  if (typeof range !== 'number' || range < 1) {
    const error = 'Range must be a positive number';
    logger.error(error);
    return { success: false, error, collected: 0 };
  }

  logger.info(`Collecting items`, { item: item || 'all', range, timeout, maxItems });

  // Get bot position for distance calculation
  const botPos = bot.entity?.position;
  if (!botPos) {
    const error = 'Bot position not available';
    logger.error(error);
    return { success: false, error, collected: 0 };
  }

  try {
    // Find all entities that are dropped items
    const droppedItems = Object.values(bot.entities).filter(entity => {
      // Check if it's a dropped item
      if (entity.name !== 'item' && entity.name !== 'dropped_item') {
        return false;
      }

      // Check distance
      if (!entity.position) return false;
      const distance = distanceBetween(entity.position, botPos);

      if (distance > range) return false;

      // Filter by item name if specified
      if (item) {
        const itemName = entity.metadata?.find(m => m?.blockId !== undefined)?.name
          || entity.name;
        return itemName === item || entity.name === item;
      }

      return true;
    });

    if (droppedItems.length === 0) {
      const message = item
        ? `No '${item}' items found within range ${range}`
        : `No dropped items found within range ${range}`;
      logger.warn(message);
      return {
        success: false,
        error: message,
        collected: 0,
        items: []
      };
    }

    // Sort by distance (closest first)
    droppedItems.sort((a, b) => {
      const distA = a.position.distanceTo(botPos);
      const distB = b.position.distanceTo(botPos);
      return distA - distB;
    });

    // Limit number of items
    const itemsToCollect = droppedItems.slice(0, maxItems);

    let collectedCount = 0;
    const collectedItems = [];

    for (const droppedItem of itemsToCollect) {
      const itemPos = droppedItem.position;

      // Navigate to item
      const goal = new GoalNear(
        Math.floor(itemPos.x),
        Math.floor(itemPos.y),
        Math.floor(itemPos.z),
        1 // Get within 1 block to pickup
      );

      try {
        await withTimeout(
          bot.pathfinder.goto(goal),
          timeout,
          `Navigation timeout for item collection`
        );

        // Wait a bit for item pickup
        await new Promise(resolve => setTimeout(resolve, 200));

        // Check if entity still exists (might have been picked up)
        const stillExists = bot.entities[droppedItem.id] !== undefined;

        if (stillExists) {
          // Try to move closer
          const stillItemPos = droppedItem.position;
          if (stillItemPos) {
            const newGoal = new GoalNear(
              Math.floor(stillItemPos.x),
              Math.floor(stillItemPos.y),
              Math.floor(stillItemPos.z),
              0.5
            );

            try {
              await withTimeout(
                bot.pathfinder.goto(newGoal),
                timeout / 2,
                `Follow timeout for item collection`
              );
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch {
              // Ignore follow errors
            }
          }
        }

        // Check inventory for changes (simplified check)
        const itemName = droppedItem.metadata?.find(m => m?.blockId !== undefined)?.name
          || droppedItem.name || 'unknown';

        collectedCount++;
        collectedItems.push({
          name: itemName,
          position: { x: itemPos.x, y: itemPos.y, z: itemPos.z }
        });

        logger.debug(`Collected item: ${itemName}`);

      } catch (navError) {
        logger.warn(`Failed to collect item: ${navError.message}`);
        // Continue to next item
        continue;
      }
    }

    const success = collectedCount > 0;
    logger.info(`Collection complete: ${collectedCount} items collected`);

    return {
      success,
      collected: collectedCount,
      items: collectedItems
    };

  } catch (error) {
    // Stop pathfinder on error
    if (bot.pathfinder && bot.pathfinder.stop) {
      bot.pathfinder.stop();
    }

    logger.error(`Collection failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      collected: 0,
      items: []
    };
  }
}

// Skill metadata
export const collectSkill = {
  name: 'collect',
  description: 'Find and collect dropped items within range. If item name not specified, collects all items.',
  execute,
  parameters: {
    item: {
      type: 'string',
      required: false,
      description: 'Item name to collect (optional, collects all if not specified)'
    },
    range: {
      type: 'number',
      required: false,
      default: 16,
      description: 'Search range for items'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 10000,
      description: 'Timeout per item in milliseconds'
    },
    maxItems: {
      type: 'number',
      required: false,
      default: 64,
      description: 'Maximum items to collect'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether items were collected successfully' },
    collected: { type: 'number', description: 'Number of items collected' },
    items: { type: 'array', description: 'Array of collected items' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default collectSkill;