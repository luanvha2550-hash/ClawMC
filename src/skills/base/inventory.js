// src/skills/base/inventory.js
// Inventory skill - List inventory items with filter

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('InventorySkill');

/**
 * Inventory skill
 *
 * List all items in the bot's inventory.
 * Supports filtering by item name.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} [params.filter] - Filter items by name (optional)
 * @returns {Promise<Object>} Result object {success, items: [{name, count}], error}
 */
async function execute(bot, state, params) {
  const { filter } = params || {};

  // Validate bot
  if (!bot || !bot.inventory) {
    const error = 'Bot or inventory not available';
    logger.error(error);
    return { success: false, error, items: [] };
  }

  // Validate filter if provided
  if (filter !== undefined && typeof filter !== 'string') {
    const error = 'Filter must be a string if specified';
    logger.error(error);
    return { success: false, error, items: [] };
  }

  const filterLower = filter?.toLowerCase();

  logger.info(`Listing inventory items`, { filter: filter || 'none' });

  try {
    // Get all inventory items
    const inventoryItems = bot.inventory.items();

    // Group items by name and count totals
    const itemMap = new Map();

    for (const item of inventoryItems) {
      const name = item.name;

      // Skip if filter doesn't match
      if (filterLower && !name.toLowerCase().includes(filterLower)) {
        continue;
      }

      // Add to map or update count
      if (itemMap.has(name)) {
        const existing = itemMap.get(name);
        existing.count += item.count;
      } else {
        itemMap.set(name, {
          name,
          count: item.count
        });
      }
    }

    // Convert map to array
    const items = Array.from(itemMap.values());

    // Sort by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    logger.info(`Found ${items.length} item type(s) in inventory`, {
      filter: filter || 'none',
      totalItems: items.reduce((sum, item) => sum + item.count, 0)
    });

    return {
      success: true,
      items,
      filter: filter || null
    };

  } catch (error) {
    logger.error(`Failed to list inventory: ${error.message}`);
    return {
      success: false,
      error: error.message,
      items: []
    };
  }
}

// Skill metadata
export const inventorySkill = {
  name: 'inventory',
  description: 'List all items in the bot\'s inventory. Optionally filter by item name.',
  execute,
  parameters: {
    filter: {
      type: 'string',
      required: false,
      description: 'Filter items by name (e.g., "stone", "diamond", "food")'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether the inventory listing succeeded' },
    items: {
      type: 'array',
      description: 'Array of items [{name, count}]',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Item name' },
          count: { type: 'number', description: 'Total count' }
        }
      }
    },
    filter: { type: 'string', description: 'Applied filter or null' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default inventorySkill;