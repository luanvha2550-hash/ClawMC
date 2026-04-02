// tests/mocks/bot.mock.js
// Comprehensive mock bot for testing skills
//
// This mock simulates the Mineflayer bot API for testing purposes.
// It can be used across all skill tests and integration tests.

import { jest } from '@jest/globals';

/**
 * Create a comprehensive mock bot instance
 * @param {Object} options - Configuration options
 * @param {Object} options.position - Initial position {x, y, z}
 * @param {number} options.health - Initial health value
 * @param {number} options.food - Initial food value
 * @param {Array} options.inventory - Initial inventory items
 * @returns {Object} Mock bot instance
 */
export function createMockBot(options = {}) {
  const {
    position = { x: 0, y: 64, z: 0 },
    health = 20,
    food = 20,
    inventory = []
  } = options;

  // Internal state
  const state = {
    position: { ...position },
    health,
    food,
    isDigging: false,
    isAttacking: false,
    isCrafting: false,
    chatMessages: [],
    lastLookAt: null,
    lastDigBlock: null,
    lastAttackEntity: null,
    lastCraftRecipe: null
  };

  // Create entity
  const entity = {
    position: state.position,
    velocity: { x: 0, y: 0, z: 0 },
    name: 'TestBot',
    type: 'player',
    id: 12345,
    height: 1.8,
    width: 0.6,
    onGround: true
  };

  // Create inventory
  const inventoryObj = {
    items: () => inventory.map((item, index) => ({
      name: item.name,
      count: item.count || 1,
      slot: item.slot ?? index,
      durability: item.durability,
      nbt: item.nbt
    })),
    slots: inventory.reduce((acc, item, index) => {
      acc[item.slot ?? index] = item;
      return acc;
    }, {}),
    count: (name) => {
      return inventory
        .filter(item => item.name === name)
        .reduce((sum, item) => sum + (item.count || 1), 0);
    },
    itemsByName: (name) => {
      return inventory.filter(item => item.name === name);
    }
  };

  // Create entities map
  const entities = new Map();

  // Create mock functions
  const mockBot = {
    // Entity and position
    entity,
    position: state.position,

    // Health and food
    health: state.health,
    food: state.food,

    // Inventory
    inventory: inventoryObj,

    // Entities
    entities,

    // Pathfinder
    pathfinder: {
      goto: jest.fn().mockImplementation(async (goal) => {
        // Simulate successful navigation
        await new Promise(resolve => setTimeout(resolve, 50));
        return true;
      }),
      stop: jest.fn().mockImplementation(() => {
        // Stop any ongoing navigation
      }),
      setGoal: jest.fn(),
      isMoving: false,
      goal: null
    },

    // Block finding
    findBlocks: jest.fn().mockImplementation((options) => {
      // Return some mock block positions
      return [
        { x: 10, y: 63, z: 10 },
        { x: 15, y: 64, z: 20 },
        { x: -5, y: 62, z: 30 }
      ];
    }),
    blockAt: jest.fn().mockImplementation((position) => {
      // Return a mock block at position
      return {
        position,
        name: 'stone',
        type: 'stone',
        hardness: 1.5,
        diggable: true,
        boundingBox: 'block'
      };
    }),

    // Chat
    chat: jest.fn().mockImplementation((message) => {
      state.chatMessages.push(message);
    }),
    whisper: jest.fn().mockImplementation((username, message) => {
      state.chatMessages.push(`[whisper:${username}] ${message}`);
    }),

    // Actions
    dig: jest.fn().mockImplementation(async (block) => {
      state.isDigging = true;
      state.lastDigBlock = block;
      await new Promise(resolve => setTimeout(resolve, 100));
      state.isDigging = false;
      return { success: true };
    }),

    attack: jest.fn().mockImplementation(async (entity) => {
      state.isAttacking = true;
      state.lastAttackEntity = entity;
      await new Promise(resolve => setTimeout(resolve, 50));
      state.isAttacking = false;
      return { success: true };
    }),

    craft: jest.fn().mockImplementation(async (recipe, count) => {
      state.isCrafting = true;
      state.lastCraftRecipe = recipe;
      await new Promise(resolve => setTimeout(resolve, 100));
      state.isCrafting = false;
      return { success: true, count: count || 1 };
    }),

    // Container interaction
    openChest: jest.fn().mockImplementation(async (block) => {
      return {
        window: {
          items: () => [],
          slots: [],
          close: jest.fn()
        },
        containerItems: () => []
      };
    }),
    closeWindow: jest.fn(),

    // Equipment
    equip: jest.fn().mockImplementation(async (item, destination) => {
      return { success: true };
    }),
    toss: jest.fn().mockImplementation(async (itemType, metadata, count) => {
      return { success: true };
    }),
    tossStack: jest.fn().mockImplementation(async (item) => {
      return { success: true };
    }),

    // Looking
    lookAt: jest.fn().mockImplementation(async (point) => {
      state.lastLookAt = point;
      return true;
    }),
    lookAtLock: jest.fn(),

    // Place block
    placeBlock: jest.fn().mockImplementation(async (referenceBlock, faceVector) => {
      return { success: true };
    }),

    // Nearest entity
    nearestEntity: jest.fn().mockImplementation((filter) => {
      const entitiesArray = Array.from(entities.values());
      if (filter) {
        return entitiesArray.find(filter) || null;
      }
      return entitiesArray[0] || null;
    }),

    // Game state
    game: {
      dimension: 'minecraft:overworld',
      gameMode: 'survival',
      difficulty: 'normal'
    },

    // Player list
    players: {},

    // Time
    time: {
      time: 1000n,
      timeOfDay: 1000n,
      day: 0n,
      isDay: true,
      isNight: false,
      moonPhase: 0
    },

    // Spawn point
    spawnPoint: { x: 0, y: 64, z: 0 },

    // Event emitters
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),

    // End function
    end: jest.fn(),

    // Helper to add entities
    addEntity: (id, entityData) => {
      const entity = {
        id,
        type: entityData.type || 'mob',
        name: entityData.name || 'entity',
        position: entityData.position || { x: 0, y: 64, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        ...entityData
      };
      entities.set(id, entity);
      return entity;
    },

    // Helper to remove entities
    removeEntity: (id) => {
      entities.delete(id);
    },

    // Helper to set position
    setPosition: (pos) => {
      state.position.x = pos.x;
      state.position.y = pos.y;
      state.position.z = pos.z;
    },

    // Helper to set health
    setHealth: (value) => {
      state.health = value;
      mockBot.health = value;
    },

    // Helper to set food
    setFood: (value) => {
      state.food = value;
      mockBot.food = value;
    },

    // Helper to clear inventory
    clearInventory: () => {
      inventory.length = 0;
    },

    // Helper to add item to inventory
    addToInventory: (item) => {
      inventory.push(item);
    },

    // Helper to get internal state
    getState: () => ({ ...state }),

    // Helper to reset all state
    reset: () => {
      state.position = { ...position };
      state.health = health;
      state.food = food;
      state.isDigging = false;
      state.isAttacking = false;
      state.isCrafting = false;
      state.chatMessages = [];
      state.lastLookAt = null;
      state.lastDigBlock = null;
      state.lastAttackEntity = null;
      state.lastCraftRecipe = null;
      entities.clear();
    }
  };

  return mockBot;
}

/**
 * Create a mock state manager
 * @param {Object} options - Configuration options
 * @returns {Object} Mock state manager
 */
export function createMockState(options = {}) {
  const {
    position = { x: 0, y: 64, z: 0 },
    health = 20,
    food = 20,
    inventory = [],
    isBusy = false,
    currentTask = null,
    following = null
  } = options;

  return {
    getPosition: jest.fn().mockReturnValue({ ...position }),
    getVitals: jest.fn().mockReturnValue({ health, food }),
    getInventory: jest.fn().mockReturnValue(inventory),
    isBusy: jest.fn().mockReturnValue(isBusy),
    currentTask,
    following,
    curriculumPhase: 'gathering',
    learnedSkills: new Set(['mining', 'crafting']),

    // Helper methods for testing
    setPosition: (pos) => {
      this._position = pos;
    },
    setBusy: (busy) => {
      this._isBusy = busy;
    }
  };
}

/**
 * Create a mock memory system
 * @returns {Object} Mock memory system
 */
export function createMockMemory() {
  const facts = new Map();

  return {
    facts: {
      get: jest.fn().mockImplementation(async (type, key) => {
        const fullKey = `${type}:${key}`;
        return facts.get(fullKey) || null;
      }),
      set: jest.fn().mockImplementation(async (type, key, value) => {
        const fullKey = `${type}:${key}`;
        facts.set(fullKey, value);
        return { type, key, value };
      }),
      delete: jest.fn().mockImplementation(async (type, key) => {
        const fullKey = `${type}:${key}`;
        return facts.delete(fullKey);
      }),
      getAll: jest.fn().mockImplementation(async () => {
        return Array.from(facts.values());
      })
    },

    // Helper methods
    clearFacts: () => {
      facts.clear();
    },

    addFact: (type, key, value) => {
      facts.set(`${type}:${key}`, value);
    }
  };
}

/**
 * Create a comprehensive test environment with bot, state, and memory
 * @param {Object} options - Configuration options
 * @returns {Object} Test environment { bot, state, memory }
 */
export function createTestEnvironment(options = {}) {
  const bot = createMockBot(options.bot);

  // Ensure state gets position from bot.position if not explicitly provided
  const stateOptions = {
    position: options.state?.position || options.bot?.position,
    ...options.state
  };
  const state = createMockState(stateOptions);
  const memory = createMockMemory();

  return {
    bot,
    state,
    memory,
    reset: () => {
      bot.reset();
      memory.clearFacts();
    }
  };
}

export default {
  createMockBot,
  createMockState,
  createMockMemory,
  createTestEnvironment
};