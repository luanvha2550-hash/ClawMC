// src/skills/base/craft.js
// Craft skill - Craft items using recipes

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';
import { withTimeout } from '../utils/navigation.js';

const logger = getLogger().module('CraftSkill');

// Default timeout for crafting
const DEFAULT_CRAFT_TIMEOUT = 30000;

/**
 * Craft skill
 *
 * Craft items using available recipes.
 * Finds crafting table if required by recipe.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.item - Item name to craft (required)
 * @param {number} [params.count=1] - Number of items to craft
 * @param {number} [params.timeout=30000] - Timeout for crafting operation
 * @returns {Promise<Object>} Result object {success, item, count, error}
 */
async function execute(bot, state, params) {
  const {
    item,
    count = 1,
    timeout = DEFAULT_CRAFT_TIMEOUT
  } = params || {};

  // Validate bot
  if (!bot) {
    const error = 'Bot not available';
    logger.error(error);
    return { success: false, error, count: 0 };
  }

  // Validate item name
  if (!item || typeof item !== 'string') {
    const error = 'Item name is required';
    logger.error(error);
    return { success: false, error, count: 0 };
  }

  // Validate count
  if (!Number.isInteger(count) || count < 1) {
    const error = 'Count must be a positive integer';
    logger.error(error);
    return { success: false, error, count: 0 };
  }

  logger.info(`Crafting ${count} ${item}(s)`, { timeout });

  try {
    // Find recipes for the item
    const recipes = bot.recipesFor(item, null, 1, null);

    if (!recipes || recipes.length === 0) {
      const error = `No recipe found for '${item}'`;
      logger.error(error);
      return { success: false, error, count: 0 };
    }

    // Use the first available recipe
    const recipe = recipes[0];

    logger.debug(`Found recipe for ${item}`, { recipeId: recipe.id });

    // Check if recipe requires crafting table
    const requiresCraftingTable = recipe.requiresCraftingTable ||
      (recipe.size && recipe.size > 2);

    let craftingTable = null;

    if (requiresCraftingTable) {
      logger.info('Recipe requires crafting table, searching...');

      if (!bot.pathfinder) {
        const error = 'Pathfinder not available for crafting table navigation';
        logger.error(error);
        return { success: false, error, count: 0 };
      }

      // Find nearby crafting table
      const craftingTableBlocks = bot.findBlocks({
        matching: 'crafting_table',
        maxDistance: 64,
        count: 1
      });

      if (!craftingTableBlocks || craftingTableBlocks.length === 0) {
        const error = 'No crafting table found nearby';
        logger.error(error);
        return { success: false, error, count: 0 };
      }

      const tablePos = craftingTableBlocks[0];

      // Navigate to crafting table
      const goal = new GoalNear(
        tablePos.x,
        tablePos.y,
        tablePos.z,
        2 // Within 2 blocks of crafting table
      );

      try {
        await withTimeout(
          bot.pathfinder.goto(goal),
          timeout,
          'Navigation timeout for crafting table'
        );
      } catch (navError) {
        const error = `Failed to reach crafting table: ${navError.message}`;
        logger.error(error);
        return { success: false, error, count: 0 };
      }

      craftingTable = bot.blockAt(tablePos);

      if (!craftingTable || craftingTable.name !== 'crafting_table') {
        const error = 'Crafting table not found at expected position';
        logger.error(error);
        return { success: false, error, count: 0 };
      }
    }

    // Check if we have enough materials
    const inventory = bot.inventory.items();
    const canCraft = checkMaterials(bot, recipe, count);

    if (!canCraft) {
      const error = `Not enough materials to craft ${count} ${item}`;
      logger.error(error);
      return { success: false, error, count: 0 };
    }

    // Craft the items
    try {
      const craftedCount = await bot.craft(recipe, count, craftingTable);

      logger.info(`Successfully crafted ${craftedCount || count} ${item}(s)`);

      return {
        success: true,
        item,
        count: craftedCount || count
      };

    } catch (craftError) {
      const error = `Crafting failed: ${craftError.message}`;
      logger.error(error);
      return { success: false, error, count: 0 };
    }

  } catch (error) {
    logger.error(`Craft skill failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      count: 0
    };
  }
}

/**
 * Check if bot has enough materials for recipe
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} recipe - Recipe to check
 * @param {number} count - Number of items to craft
 * @returns {boolean} True if enough materials
 */
function checkMaterials(bot, recipe, count) {
  if (!recipe.delta) {
    // If delta is not available, assume we can craft
    return true;
  }

  // Get inventory as a map of item name -> count
  const inventory = {};
  for (const item of bot.inventory.items()) {
    const name = item.name;
    inventory[name] = (inventory[name] || 0) + item.count;
  }

  // Check each required material
  for (const [itemName, required] of Object.entries(recipe.delta)) {
    // Only check negative deltas (consumed items)
    if (required < 0) {
      const needed = Math.abs(required) * count;
      const available = inventory[itemName] || 0;

      if (available < needed) {
        logger.debug(`Not enough ${itemName}: need ${needed}, have ${available}`);
        return false;
      }
    }
  }

  return true;
}

// Skill metadata
export const craftSkill = {
  name: 'craft',
  description: 'Craft items using available recipes. Automatically finds crafting table if required.',
  execute,
  parameters: {
    item: {
      type: 'string',
      required: true,
      description: 'Item name to craft (e.g., "stick", "crafting_table", "iron_pickaxe")'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Number of items to craft'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 30000,
      description: 'Timeout for crafting operation in milliseconds'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether crafting succeeded' },
    item: { type: 'string', description: 'Item that was crafted' },
    count: { type: 'number', description: 'Number of items crafted' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default craftSkill;