# Skills Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar Skills Layer com skills base, registro, sandbox de execução, limitador de tentativas e testes simulados.

**Architecture:** Node.js com Mineflayer, sandbox SES/isolated-vm para execução segura, sistema de registro para skills dinâmicas.

**Tech Stack:** Node.js 18+, mineflayer, mineflayer-pathfinder, mineflayer-collectblock, isolated-vm (opcional), SES (alternativa).

---

## Task 1: Skills Registry

**Files:**
- Create: `src/skills/index.js`
- Create: `tests/unit/skills/registry.test.js`

- [ ] **Step 1: Write failing test for registry**

```javascript
// tests/unit/skills/registry.test.js

import { SkillRegistry } from '../../../src/skills/index.js';

describe('SkillRegistry', () => {
  let registry;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      chat: jest.fn(),
      pathfinder: { goto: jest.fn() },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn().mockReturnValue({ name: 'air' })
    };
    registry = new SkillRegistry(mockBot);
  });

  describe('register', () => {
    it('should register a skill', () => {
      const skill = {
        name: 'test',
        description: 'Test skill',
        execute: jest.fn()
      };

      registry.register(skill);

      expect(registry.get('test')).toBe(skill);
    });

    it('should throw on duplicate registration', () => {
      const skill = { name: 'test', execute: jest.fn() };
      registry.register(skill);

      expect(() => registry.register(skill)).toThrow('already registered');
    });
  });

  describe('get', () => {
    it('should return skill by name', () => {
      const skill = { name: 'walk', execute: jest.fn() };
      registry.register(skill);

      expect(registry.get('walk')).toBe(skill);
    });

    it('should return undefined for unknown skill', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all skills', () => {
      registry.register({ name: 'walk', execute: jest.fn() });
      registry.register({ name: 'mine', execute: jest.fn() });

      const skills = registry.list();

      expect(skills).toHaveLength(2);
      expect(skills.map(s => s.name)).toContain('walk');
      expect(skills.map(s => s.name)).toContain('mine');
    });
  });

  describe('findSimilar', () => {
    it('should find skills matching query', () => {
      registry.register({ name: 'walk', description: 'Walk to a location', execute: jest.fn() });
      registry.register({ name: 'mine', description: 'Mine a block', execute: jest.fn() });

      const results = registry.findSimilar('walk');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe('walk');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/registry.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement skills registry**

```javascript
// src/skills/index.js

import { getLogger } from '../utils/logger.js';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';

const logger = getLogger().module('SkillRegistry');

class SkillRegistry {
  constructor(bot) {
    this.bot = bot;
    this.skills = new Map();
    this.dynamicSkills = new Map();
  }

  /**
   * Register a skill
   */
  register(skill) {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill '${skill.name}' already registered`);
    }

    // Validate skill structure
    this.validateSkill(skill);

    this.skills.set(skill.name, {
      ...skill,
      type: 'base',
      registered: Date.now()
    });

    logger.debug(`Skill registered: ${skill.name}`);
  }

  /**
   * Validate skill structure
   */
  validateSkill(skill) {
    if (!skill.name || typeof skill.name !== 'string') {
      throw new Error('Skill must have a name');
    }
    if (!skill.execute || typeof skill.execute !== 'function') {
      throw new Error(`Skill '${skill.name}' must have execute function`);
    }
  }

  /**
   * Get skill by name
   */
  get(name) {
    return this.skills.get(name) || this.dynamicSkills.get(name);
  }

  /**
   * Check if skill exists
   */
  has(name) {
    return this.skills.has(name) || this.dynamicSkills.has(name);
  }

  /**
   * List all skills
   */
  list() {
    return [
      ...Array.from(this.skills.values()),
      ...Array.from(this.dynamicSkills.values())
    ];
  }

  /**
   * List base skills only
   */
  listBase() {
    return Array.from(this.skills.values());
  }

  /**
   * List dynamic skills only
   */
  listDynamic() {
    return Array.from(this.dynamicSkills.values());
  }

  /**
   * Register dynamic skill
   */
  registerDynamic(skill) {
    this.validateSkill(skill);

    this.dynamicSkills.set(skill.name, {
      ...skill,
      type: 'dynamic',
      registered: Date.now()
    });

    logger.info(`Dynamic skill registered: ${skill.name}`);
  }

  /**
   * Unregister dynamic skill
   */
  unregisterDynamic(name) {
    if (this.dynamicSkills.has(name)) {
      this.dynamicSkills.delete(name);
      logger.info(`Dynamic skill unregistered: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Find skills matching query (simple keyword match)
   */
  findSimilar(query) {
    const queryLower = query.toLowerCase();
    const matches = [];

    for (const skill of this.list()) {
      const nameMatch = skill.name.toLowerCase().includes(queryLower);
      const descMatch = skill.description?.toLowerCase().includes(queryLower);

      if (nameMatch || descMatch) {
        matches.push({
          skill,
          confidence: nameMatch ? 0.9 : 0.7
        });
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Load base skills from directory
   */
  async loadBaseSkills(skillsDir = './src/skills/base') {
    try {
      const files = await readdir(skillsDir);
      const jsFiles = files.filter(f => f.endsWith('.js') && f !== 'index.js');

      for (const file of jsFiles) {
        try {
          const module = await import(join(skillsDir, file));
          const skill = module.default || module;

          if (skill.name && skill.execute) {
            this.register(skill);
          } else {
            logger.warn(`Invalid skill file: ${file}`);
          }
        } catch (error) {
          logger.error(`Failed to load skill ${file}:`, error.message);
        }
      }

      logger.info(`Loaded ${this.skills.size} base skills`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Skills directory not found: ${skillsDir}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get skill names
   */
  getNames() {
    return Array.from(this.skills.keys())
      .concat(Array.from(this.dynamicSkills.keys()));
  }
}

export { SkillRegistry };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/skills/registry.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/skills/index.js tests/unit/skills/registry.test.js
git commit -m "feat(skills): add skill registry

- Implement SkillRegistry with register/get/list
- Support base and dynamic skills
- Add findSimilar for keyword matching
- Add skill validation
- Add tests"
```

---

## Task 2: Base Skills - Movement

**Files:**
- Create: `src/skills/base/walk.js`
- Create: `src/skills/base/come.js`
- Create: `src/skills/base/follow.js`
- Create: `src/skills/base/stop.js`
- Create: `tests/unit/skills/base/walk.test.js`

- [ ] **Step 1: Write failing test for walk skill**

```javascript
// tests/unit/skills/base/walk.test.js

import walk from '../../../src/skills/base/walk.js';

describe('Walk Skill', () => {
  let mockBot;
  let mockState;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined),
        stop: jest.fn(),
        setGoal: jest.fn()
      },
      chat: jest.fn()
    };
    mockState = { isBusy: () => false };
  });

  describe('parameters', () => {
    it('should have correct name', () => {
      expect(walk.name).toBe('walk');
    });

    it('should have description', () => {
      expect(walk.description).toBeDefined();
    });

    it('should have parameters defined', () => {
      expect(walk.parameters).toBeDefined();
      expect(walk.parameters.target).toBeDefined();
      expect(walk.parameters.target.required).toBe(true);
    });
  });

  describe('execute', () => {
    it('should navigate to coordinates', async () => {
      await walk.execute(mockBot, { target: { x: 100, y: 64, z: -200 } }, mockState);

      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });

    it('should reject invalid coordinates', async () => {
      await expect(
        walk.execute(mockBot, { target: { x: 'invalid' } }, mockState)
      ).rejects.toThrow();
    });

    it('should accept timeout parameter', async () => {
      await walk.execute(mockBot, {
        target: { x: 100, y: 64, z: -200 },
        timeout: 5000
      }, mockState);

      expect(mockBot.pathfinder.goto).toHaveBeenCalled();
    });
  });

  describe('canExecute', () => {
    it('should return true for reachable coordinates', () => {
      const result = walk.canExecute(mockBot, { target: { x: 100, y: 64, z: -200 } });
      expect(result).toBe(true);
    });

    it('should return false for too far coordinates', () => {
      const result = walk.canExecute(mockBot, { target: { x: 10000, y: 64, z: 10000 } });
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/base/walk.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement walk skill**

```javascript
// src/skills/base/walk.js

import { GoalBlock, GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('WalkSkill');

/**
 * Walk skill - Navigate to coordinates
 */
export default {
  name: 'walk',
  description: 'Anda até uma coordenada ou posição',

  parameters: {
    target: {
      type: 'coordinates|entity',
      required: true,
      description: 'Coordenadas {x, y, z} ou entidade alvo'
    },
    timeout: {
      type: 'number',
      required: false,
      default: 60000,
      description: 'Timeout em milissegundos'
    },
    range: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Distância mínima do alvo'
    }
  },

  async execute(bot, params, state) {
    const { target, timeout = 60000, range = 1 } = params;

    // Validate target
    if (!target) {
      throw new Error('Target is required');
    }

    let goal;

    // Handle coordinates
    if (target.x !== undefined && target.y !== undefined && target.z !== undefined) {
      const { x, y, z } = target;

      logger.info(`Walking to (${x}, ${y}, ${z})`);

      if (range <= 1) {
        goal = new GoalBlock(x, y, z);
      } else {
        goal = new GoalNear(x, y, z, range);
      }
    } else {
      throw new Error('Invalid target: must have x, y, z coordinates');
    }

    // Execute pathfinding with timeout
    try {
      await Promise.race([
        bot.pathfinder.goto(goal),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Walk timeout')), timeout)
        )
      ]);

      logger.info(`Arrived at destination`);
      bot.chat('Cheguei ao destino!');

      return { success: true, position: target };
    } catch (error) {
      logger.error(`Walk failed: ${error.message}`);
      bot.chat(`Falha ao andar: ${error.message}`);
      throw error;
    }
  },

  canExecute(bot, params) {
    const { target } = params;

    if (!target) return false;

    // Check if target has coordinates
    if (target.x === undefined || target.y === undefined || target.z === undefined) {
      return false;
    }

    // Check distance (max 1000 blocks)
    const pos = bot.entity.position;
    const distance = Math.sqrt(
      Math.pow(target.x - pos.x, 2) +
      Math.pow(target.z - pos.z, 2)
    );

    return distance < 1000;
  }
};
```

- [ ] **Step 4: Implement come skill**

```javascript
// src/skills/base/come.js

import { GoalBlock, GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('ComeSkill');

/**
 * Come skill - Navigate to player
 */
export default {
  name: 'come',
  description: 'Vem até o jogador que chamou',

  parameters: {
    username: {
      type: 'string',
      required: false,
      description: 'Nome do jogador (opcional, usa quem chamou)'
    },
    range: {
      type: 'number',
      required: false,
      default: 2,
      description: 'Distância para parar do jogador'
    }
  },

  async execute(bot, params, state) {
    const { range = 2 } = params;
    let username = params.username;

    // Use caller from state if not specified
    if (!username && state.lastCaller) {
      username = state.lastCaller;
    }

    if (!username) {
      throw new Error('No target player specified');
    }

    // Find player
    const player = bot.players[username];
    if (!player || !player.entity) {
      bot.chat(`Não consigo ver ${username}`);
      throw new Error(`Player ${username} not found`);
    }

    const pos = player.entity.position;
    logger.info(`Coming to ${username} at (${pos.x}, ${pos.y}, ${pos.z})`);

    try {
      const goal = new GoalNear(
        Math.floor(pos.x),
        Math.floor(pos.y),
        Math.floor(pos.z),
        range
      );

      await bot.pathfinder.goto(goal);

      logger.info(`Arrived at ${username}`);
      bot.chat(`Cheguei, ${username}!`);

      return { success: true, target: username, position: pos };
    } catch (error) {
      logger.error(`Come failed: ${error.message}`);
      bot.chat(`Não consegui chegar em ${username}`);
      throw error;
    }
  },

  canExecute(bot, params) {
    const username = params.username;
    if (!username) return false;

    const player = bot.players[username];
    return player && player.entity;
  }
};
```

- [ ] **Step 5: Implement follow skill**

```javascript
// src/skills/base/follow.js

import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('FollowSkill');

/**
 * Follow skill - Follow a player continuously
 */
export default {
  name: 'follow',
  description: 'Segue um jogador continuamente',

  parameters: {
    username: {
      type: 'string',
      required: true,
      description: 'Nome do jogador para seguir'
    },
    distance: {
      type: 'number',
      required: false,
      default: 3,
      description: 'Distância mínima para manter'
    }
  },

  async execute(bot, params, state) {
    const { username, distance = 3 } = params;

    const player = bot.players[username];
    if (!player) {
      bot.chat(`Não vejo ${username}`);
      throw new Error(`Player ${username} not found`);
    }

    logger.info(`Following ${username}`);
    bot.chat(`Seguindo ${username}`);

    // Set following state
    state.setFollowing(username);

    // Follow loop
    const movements = new Movements(bot);
    bot.pathfinder.setMovements(movements);

    const followInterval = setInterval(() => {
      // Stop if no longer following
      if (state.following !== username) {
        clearInterval(followInterval);
        return;
      }

      // Check if player still exists
      if (!player.entity) {
        clearInterval(followInterval);
        state.clearFollowing();
        return;
      }

      const targetPos = player.entity.position;
      const currentPos = bot.entity.position;
      const dist = currentPos.distanceTo(targetPos);

      // Only move if too far
      if (dist > distance + 1) {
        bot.pathfinder.setGoal(new GoalNear(
          targetPos.x,
          targetPos.y,
          targetPos.z,
          distance
        ));
      }
    }, 1000);

    // Store interval for stop skill
    state.followInterval = followInterval;

    return { success: true, following: username };
  },

  canExecute(bot, params) {
    const username = params.username;
    if (!username) return false;

    const player = bot.players[username];
    return player && player.entity;
  }
};

import { GoalNear } from 'mineflayer-pathfinder';
```

- [ ] **Step 6: Implement stop skill**

```javascript
// src/skills/base/stop.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('StopSkill');

/**
 * Stop skill - Stop current task
 */
export default {
  name: 'stop',
  description: 'Para a tarefa atual',

  parameters: {},

  async execute(bot, params, state) {
    logger.info('Stopping current task');

    // Stop pathfinding
    if (bot.pathfinder) {
      bot.pathfinder.stop();
    }

    // Clear following
    if (state.followInterval) {
      clearInterval(state.followInterval);
      state.followInterval = null;
    }

    // Clear state
    state.clearTask();
    state.clearFollowing();

    bot.chat('Parado!');

    return { success: true };
  },

  canExecute(bot, params) {
    return true; // Can always stop
  }
};
```

- [ ] **Step 7: Run tests**

```bash
npm test -- tests/unit/skills/base/
# Expected: PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/skills/base/walk.js src/skills/base/come.js src/skills/base/follow.js src/skills/base/stop.js tests/unit/skills/base/
git commit -m "feat(skills): add movement skills

- Add walk skill for coordinate navigation
- Add come skill for player following
- Add follow skill for continuous follow
- Add stop skill to halt tasks
- Add tests"
```

---

## Task 3: Base Skills - Actions

**Files:**
- Create: `src/skills/base/mine.js`
- Create: `src/skills/base/collect.js`
- Create: `src/skills/base/craft.js`
- Create: `src/skills/base/attack.js`
- Create: `tests/unit/skills/base/mine.test.js`

- [ ] **Step 1: Write failing test for mine skill**

```javascript
// tests/unit/skills/base/mine.test.js

import mine from '../../../src/skills/base/mine.js';

describe('Mine Skill', () => {
  let mockBot;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: {
        goto: jest.fn().mockResolvedValue(undefined)
      },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn().mockReturnValue({ name: 'stone', position: { x: 0, y: 63, z: 0 } }),
      dig: jest.fn().mockResolvedValue(undefined),
      chat: jest.fn()
    };
  });

  describe('parameters', () => {
    it('should have correct name', () => {
      expect(mine.name).toBe('mine');
    });

    it('should have required parameters', () => {
      expect(mine.parameters.block.required).toBe(true);
    });
  });

  describe('execute', () => {
    it('should find and dig block', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 10, y: 60, z: 5 }]);
      mockBot.blockAt.mockReturnValue({ name: 'stone', position: { x: 10, y: 60, z: 5 } });

      await mine.execute(mockBot, { block: 'stone' }, {});

      expect(mockBot.dig).toHaveBeenCalled();
    });

    it('should handle block not found', async () => {
      mockBot.findBlocks.mockReturnValue([]);

      await expect(
        mine.execute(mockBot, { block: 'diamond_ore' }, {})
      ).rejects.toThrow('not found');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/base/mine.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement mine skill**

```javascript
// src/skills/base/mine.js

import { GoalBlock } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('MineSkill');

/**
 * Mine skill - Dig blocks
 */
export default {
  name: 'mine',
  description: 'Minera blocos específicos',

  parameters: {
    block: {
      type: 'string',
      required: true,
      description: 'Nome do bloco (ex: stone, iron_ore)'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Quantidade a minerar'
    }
  },

  async execute(bot, params, state) {
    const { block, count = 1 } = params;

    logger.info(`Mining ${count} ${block}`);
    bot.chat(`Minerando ${count} ${block}...`);

    let mined = 0;

    for (let i = 0; i < count; i++) {
      try {
        // Find block
        const positions = bot.findBlocks({
          matching: block,
          maxDistance: 64,
          count: 1
        });

        if (positions.length === 0) {
          bot.chat(`Não encontrei mais ${block}`);
          break;
        }

        const blockPos = positions[0];
        const targetBlock = bot.blockAt(blockPos);

        if (!targetBlock || targetBlock.name === 'air') {
          logger.warn('Block position returned air');
          continue;
        }

        // Navigate to block
        await bot.pathfinder.goto(new GoalBlock(
          blockPos.x,
          blockPos.y,
          blockPos.z
        ));

        // Dig block
        await bot.dig(targetBlock);
        mined++;

        logger.debug(`Mined ${block} at (${blockPos.x}, ${blockPos.y}, ${blockPos.z})`);
      } catch (error) {
        logger.error(`Failed to mine ${block}:`, error.message);
      }
    }

    bot.chat(`Minerei ${mined} ${block}`);
    return { success: true, mined, block };
  },

  canExecute(bot, params) {
    return params.block !== undefined;
  }
};
```

- [ ] **Step 4: Implement collect skill**

```javascript
// src/skills/base/collect.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('CollectSkill');

/**
 * Collect skill - Collect dropped items
 */
export default {
  name: 'collect',
  description: 'Coleta itens no chão',

  parameters: {
    item: {
      type: 'string',
      required: false,
      description: 'Nome do item (opcional, coleta todos se não especificado)'
    },
    range: {
      type: 'number',
      required: false,
      default: 16,
      description: 'Distância máxima para buscar'
    }
  },

  async execute(bot, params, state) {
    const { item, range = 16 } = params;

    logger.info(`Collecting items${item ? `: ${item}` : ' (all)'}`);

    const entities = Object.values(bot.entities);
    const items = entities.filter(e => {
      if (e.name !== 'item' && e.name !== 'dropped_item') return false;
      if (item && !e.displayName?.toLowerCase().includes(item.toLowerCase())) return false;

      const dist = bot.entity.position.distanceTo(e.position);
      return dist <= range;
    });

    if (items.length === 0) {
      bot.chat('Nenhum item para coletar');
      return { success: true, collected: 0 };
    }

    let collected = 0;

    for (const itemEntity of items) {
      try {
        // Navigate to item
        await bot.pathfinder.goto(new GoalNear(
          itemEntity.position.x,
          itemEntity.position.y,
          itemEntity.position.z,
          1
        ));

        // Wait for pickup (automatic in mineflayer)
        await new Promise(resolve => setTimeout(resolve, 500));
        collected++;
      } catch (error) {
        logger.error(`Failed to collect item: ${error.message}`);
      }
    }

    bot.chat(`Coletei ${collected} itens`);
    return { success: true, collected };
  },

  canExecute(bot, params) {
    return true;
  }
};

import { GoalNear } from 'mineflayer-pathfinder';
```

- [ ] **Step 5: Implement craft skill**

```javascript
// src/skills/base/craft.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('CraftSkill');

/**
 * Craft skill - Craft items
 */
export default {
  name: 'craft',
  description: 'Crafta itens',

  parameters: {
    item: {
      type: 'string',
      required: true,
      description: 'Nome do item para craftar'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Quantidade'
    }
  },

  async execute(bot, params, state) {
    const { item, count = 1 } = params;

    logger.info(`Crafting ${count} ${item}`);
    bot.chat(`Craftando ${count} ${item}...`);

    // Find recipe
    const recipes = bot.recipesFor(item, null, 1, null);

    if (recipes.length === 0) {
      bot.chat(`Não conheço receita para ${item}`);
      throw new Error(`No recipe for ${item}`);
    }

    const recipe = recipes[0];

    // Check if we have required items
    // ... (simplified for now)

    try {
      // Find crafting table if needed
      if (recipe.requiresTable) {
        const tablePos = bot.findBlock({
          matching: 'crafting_table',
          maxDistance: 16
        });

        if (!tablePos) {
          bot.chat('Preciso de uma mesa de craft');
          throw new Error('No crafting table nearby');
        }

        // Navigate to table
        await bot.pathfinder.goto(new GoalNear(
          tablePos.x, tablePos.y, tablePos.z, 1
        ));
      }

      // Craft
      await bot.craft(recipe, count, null);

      bot.chat(`Craftei ${count} ${item}`);
      return { success: true, item, count };
    } catch (error) {
      bot.chat(`Falha ao craftar: ${error.message}`);
      throw error;
    }
  },

  canExecute(bot, params) {
    return params.item !== undefined;
  }
};

import { GoalNear } from 'mineflayer-pathfinder';
```

- [ ] **Step 6: Implement attack skill**

```javascript
// src/skills/base/attack.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('AttackSkill');

/**
 * Attack skill - Attack entities
 */
export default {
  name: 'attack',
  description: 'Ataca entidades',

  parameters: {
    target: {
      type: 'string',
      required: true,
      description: 'Tipo de entidade (zombie, skeleton, etc)'
    },
    count: {
      type: 'number',
      required: false,
      default: 1,
      description: 'Quantidade a atacar'
    }
  },

  async execute(bot, params, state) {
    const { target, count = 1 } = params;

    logger.info(`Attacking ${count} ${target}`);
    bot.chat(`Atacando ${target}...`);

    let attacked = 0;

    for (let i = 0; i < count; i++) {
      // Find entity
      const entities = Object.values(bot.entities);
      const targetEntity = entities.find(e =>
        e.name?.toLowerCase().includes(target.toLowerCase()) &&
        e.position.distanceTo(bot.entity.position) < 16
      );

      if (!targetEntity) {
        bot.chat(`Não encontrei ${target}`);
        break;
      }

      try {
        // Navigate to entity
        await bot.pathfinder.goto(new GoalNear(
          targetEntity.position.x,
          targetEntity.position.y,
          targetEntity.position.z,
          3
        ));

        // Attack
        bot.attack(targetEntity);
        attacked++;

        // Wait for cooldown
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to attack ${target}:`, error.message);
      }
    }

    bot.chat(`Ataquei ${attacked} ${target}`);
    return { success: true, attacked };
  },

  canExecute(bot, params) {
    return params.target !== undefined;
  }
};

import { GoalNear } from 'mineflayer-pathfinder';
```

- [ ] **Step 7: Run tests**

```bash
npm test -- tests/unit/skills/base/
# Expected: PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/skills/base/mine.js src/skills/base/collect.js src/skills/base/craft.js src/skills/base/attack.js tests/unit/skills/base/
git commit -m "feat(skills): add action skills

- Add mine skill for mining blocks
- Add collect skill for gathering items
- Add craft skill for crafting items
- Add attack skill for attacking entities
- Add tests"
```

---

## Task 4: Base Skills - Utility

**Files:**
- Create: `src/skills/base/store.js`
- Create: `src/skills/base/inventory.js`
- Create: `src/skills/base/say.js`
- Create: `src/skills/base/escape.js`
- Create: `tests/unit/skills/base/store.test.js`

- [ ] **Step 1: Write failing test for store skill**

```javascript
// tests/unit/skills/base/store.test.js

import store from '../../../src/skills/base/store.js';

describe('Store Skill', () => {
  let mockBot;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      findBlocks: jest.fn().mockReturnValue([]),
      blockAt: jest.fn(),
      openChest: jest.fn(),
      inventory: {
        items: jest.fn().mockReturnValue([]),
        slots: []
      },
      chat: jest.fn()
    };
  });

  describe('parameters', () => {
    it('should have correct name', () => {
      expect(store.name).toBe('store');
    });
  });

  describe('execute', () => {
    it('should find chest and store items', async () => {
      mockBot.findBlocks.mockReturnValue([{ x: 10, y: 63, z: 5 }]);
      mockBot.blockAt.mockReturnValue({ name: 'chest' });

      const mockChest = {
        deposit: jest.fn().mockResolvedValue(undefined),
        close: jest.fn()
      };
      mockBot.openChest.mockResolvedValue(mockChest);

      await store.execute(mockBot, { item: 'stone', count: 64 }, {});

      expect(mockBot.openChest).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/base/store.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement store skill**

```javascript
// src/skills/base/store.js

import { GoalNear } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('StoreSkill');

/**
 * Store skill - Store items in chest
 */
export default {
  name: 'store',
  description: 'Guarda itens em baú',

  parameters: {
    item: {
      type: 'string',
      required: true,
      description: 'Nome do item para guardar'
    },
    count: {
      type: 'number',
      required: false,
      description: 'Quantidade (todas se não especificado)'
    }
  },

  async execute(bot, params, state) {
    const { item, count } = params;

    logger.info(`Storing ${count || 'all'} ${item}`);
    bot.chat(`Guardando ${item}...`);

    // Find chest
    const chestPositions = bot.findBlocks({
      matching: 'chest',
      maxDistance: 32,
      count: 10
    });

    if (chestPositions.length === 0) {
      bot.chat('Não encontrei nenhum baú');
      throw new Error('No chest found');
    }

    // Navigate to nearest chest
    const chestPos = chestPositions[0];
    await bot.pathfinder.goto(new GoalNear(
      chestPos.x, chestPos.y, chestPos.z, 2
    ));

    // Open chest
    const chestBlock = bot.blockAt(chestPos);
    const chest = await bot.openChest(chestBlock);

    try {
      // Find item in inventory
      const inventoryItems = bot.inventory.items();
      const itemsToStore = inventoryItems.filter(i =>
        i.name.toLowerCase().includes(item.toLowerCase())
      );

      if (itemsToStore.length === 0) {
        bot.chat(`Não tenho ${item}`);
        await chest.close();
        return { success: false, stored: 0 };
      }

      let stored = 0;
      const toStore = count || 999;

      for (const invItem of itemsToStore) {
        if (stored >= toStore) break;

        const amount = Math.min(invItem.count, toStore - stored);
        await chest.deposit(invItem.type, null, amount);
        stored += amount;
      }

      await chest.close();
      bot.chat(`Guardei ${stored} ${item}`);

      return { success: true, stored };
    } catch (error) {
      await chest.close();
      throw error;
    }
  },

  canExecute(bot, params) {
    return params.item !== undefined;
  }
};
```

- [ ] **Step 4: Implement inventory skill**

```javascript
// src/skills/base/inventory.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('InventorySkill');

/**
 * Inventory skill - List inventory items
 */
export default {
  name: 'inventory',
  description: 'Lista itens do inventário',

  parameters: {
    filter: {
      type: 'string',
      required: false,
      description: 'Filtrar por nome do item'
    }
  },

  async execute(bot, params, state) {
    const { filter } = params;

    logger.info('Listing inventory');

    const items = bot.inventory.items();

    if (items.length === 0) {
      bot.chat('Inventário vazio');
      return { success: true, items: [] };
    }

    // Group and count items
    const grouped = {};
    for (const item of items) {
      const name = item.name;
      grouped[name] = (grouped[name] || 0) + item.count;
    }

    // Filter if requested
    let filtered = Object.entries(grouped);
    if (filter) {
      filtered = filtered.filter(([name]) =>
        name.toLowerCase().includes(filter.toLowerCase())
      );
    }

    // Sort by count
    filtered.sort((a, b) => b[1] - a[1]);

    // Output
    const summary = filtered
      .slice(0, 10)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');

    bot.chat(`Inventário (${items.length} tipos): ${summary}`);

    return {
      success: true,
      items: filtered.map(([name, count]) => ({ name, count }))
    };
  },

  canExecute(bot, params) {
    return true;
  }
};
```

- [ ] **Step 5: Implement say skill**

```javascript
// src/skills/base/say.js

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('SaySkill');

/**
 * Say skill - Send chat message
 */
export default {
  name: 'say',
  description: 'Envia mensagem no chat',

  parameters: {
    message: {
      type: 'string',
      required: true,
      description: 'Mensagem a enviar'
    }
  },

  async execute(bot, params, state) {
    const { message } = params;

    if (!message) {
      throw new Error('Message is required');
    }

    logger.info(`Saying: ${message}`);
    bot.chat(message);

    return { success: true, message };
  },

  canExecute(bot, params) {
    return params.message !== undefined;
  }
};
```

- [ ] **Step 6: Implement escape skill**

```javascript
// src/skills/base/escape.js

import { GoalBlock } from 'mineflayer-pathfinder';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('EscapeSkill');

/**
 * Escape skill - Flee from danger
 */
export default {
  name: 'escape',
  description: 'Foge de perigo',

  parameters: {
    reason: {
      type: 'string',
      required: false,
      description: 'Motivo da fuga'
    }
  },

  async execute(bot, params, state) {
    const { reason } = params;

    logger.info(`Escaping${reason ? `: ${reason}` : ''}`);
    bot.chat(`Fugindo${reason ? ` de ${reason}` : '...'}!`);

    // Find hostile entities nearby
    const hostiles = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'];
    const entities = Object.values(bot.entities);

    const nearbyHostiles = entities.filter(e =>
      hostiles.some(h => e.name?.includes(h)) &&
      e.position.distanceTo(bot.entity.position) < 20
    );

    if (nearbyHostiles.length === 0) {
      bot.chat('Nenhum perigo detectado');
      return { success: true, fled: false };
    }

    // Calculate escape direction (opposite to average hostile position)
    const avgX = nearbyHostiles.reduce((sum, e) => sum + e.position.x, 0) / nearbyHostiles.length;
    const avgZ = nearbyHostiles.reduce((sum, e) => sum + e.position.z, 0) / nearbyHostiles.length;

    const dirX = bot.entity.position.x - avgX;
    const dirZ = bot.entity.position.z - avgZ;
    const length = Math.sqrt(dirX * dirX + dirZ * dirZ);

    const escapeX = bot.entity.position.x + (dirX / length) * 30;
    const escapeZ = bot.entity.position.z + (dirZ / length) * 30;

    // Escape!
    try {
      await bot.pathfinder.goto(new GoalBlock(
        Math.floor(escapeX),
        bot.entity.position.y,
        Math.floor(escapeZ)
      ));

      bot.chat('Escapei!');
      return { success: true, fled: true };
    } catch (error) {
      bot.chat('Não consegui escapar!');
      throw error;
    }
  },

  canExecute(bot, params) {
    return true;
  }
};
```

- [ ] **Step 7: Run tests**

```bash
npm test -- tests/unit/skills/base/
# Expected: PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/skills/base/store.js src/skills/base/inventory.js src/skills/base/say.js src/skills/base/escape.js tests/unit/skills/base/
git commit -m "feat(skills): add utility skills

- Add store skill for storing items in chests
- Add inventory skill for listing inventory
- Add say skill for chat messages
- Add escape skill for fleeing danger
- Add tests"
```

---

## Task 5: Skill Executor with Sandbox

**Files:**
- Create: `src/skills/executor.js`
- Create: `src/skills/turnLimiter.js`
- Create: `tests/unit/skills/executor.test.js`

- [ ] **Step 1: Write failing test for executor**

```javascript
// tests/unit/skills/executor.test.js

import { SkillExecutor } from '../../../src/skills/executor.js';

describe('SkillExecutor', () => {
  let executor;
  let mockBot;
  let mockState;

  beforeEach(() => {
    mockBot = {
      chat: jest.fn(),
      pathfinder: { goto: jest.fn() }
    };
    mockState = { isBusy: () => false };
    executor = new SkillExecutor(mockBot, mockState);
  });

  describe('execute', () => {
    it('should execute base skill', async () => {
      const skill = {
        name: 'test',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      const result = await executor.execute(skill, {});

      expect(skill.execute).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle skill timeout', async () => {
      const skill = {
        name: 'slow',
        execute: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(resolve, 10000))
        )
      };

      await expect(
        executor.execute(skill, {}, { timeout: 100 })
      ).rejects.toThrow('timeout');
    });

    it('should handle skill error', async () => {
      const skill = {
        name: 'fail',
        execute: jest.fn().mockRejectedValue(new Error('Skill failed'))
      };

      await expect(
        executor.execute(skill, {})
      ).rejects.toThrow('Skill failed');
    });
  });

  describe('sandbox', () => {
    it('should validate code safety', () => {
      const unsafeCode = 'require("fs")';

      const result = executor.validateSafety(unsafeCode);

      expect(result.safe).toBe(false);
    });

    it('should allow safe methods', () => {
      const safeCode = 'bot.pathfinder.goto(goal)';

      const result = executor.validateSafety(safeCode);

      expect(result.safe).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/executor.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement executor**

```javascript
// src/skills/executor.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('SkillExecutor');

// Patterns that are NOT allowed in dynamic skills
const FORBIDDEN_PATTERNS = [
  /require\s*\(/,
  /import\s+/,
  /eval\s*\(/,
  /Function\s*\(/,
  /this\s*\[\s*['"]constructor['"]\s*\]/,
  /constructor\s*\.\s*constructor/,
  /__proto__/,
  /globalThis/,
  /global\s*\(/,
  /process\s*\./,
  /__dirname/,
  /__filename/,
  /Reflect\s*\./,
  /Proxy\s*\(/,
  /fs\./,
  /child_process/,
  /http\./,
  /https\./,
  /net\./,
  /Buffer\s*\(/,
  /vm\s*\./
];

// Allowed bot methods
const ALLOWED_BOT_METHODS = [
  'bot.pathfinder',
  'bot.dig',
  'bot.placeBlock',
  'bot.findBlocks',
  'bot.inventory',
  'bot.equip',
  'bot.toss',
  'bot.chat',
  'bot.lookAt',
  'bot.health',
  'bot.food',
  'bot.entity.position',
  'bot.blockAt',
  'bot.entities',
  'bot.nearestEntity',
  'bot.attack',
  'bot.openChest',
  'bot.closeWindow',
  'bot.craft'
];

class SkillExecutor {
  constructor(bot, state, config = {}) {
    this.bot = bot;
    this.state = state;
    this.config = {
      timeout: config.timeout || 30000,
      sandboxType: config.sandboxType || 'auto',
      ...config
    };
  }

  /**
   * Execute a skill
   */
  async execute(skill, params, options = {}) {
    const timeout = options.timeout || skill.timeout || this.config.timeout;
    const startTime = Date.now();

    try {
      // Set state
      this.state.setTask({
        type: skill.name,
        params,
        started: startTime
      }, timeout);

      logger.info(`Executing skill: ${skill.name}`);

      // Execute with timeout
      const result = await Promise.race([
        skill.execute(this.bot, params, this.state),
        this.createTimeout(timeout, skill.name)
      ]);

      const duration = Date.now() - startTime;
      logger.info(`Skill ${skill.name} completed in ${duration}ms`);

      return {
        success: true,
        ...result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Skill ${skill.name} failed after ${duration}ms:`, error.message);

      return {
        success: false,
        error: error.message,
        duration
      };
    } finally {
      this.state.clearTask();
    }
  }

  /**
   * Create timeout promise
   */
  createTimeout(ms, skillName) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Skill ${skillName} timeout after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Validate code safety
   */
  validateSafety(code) {
    // Check for forbidden patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        return {
          safe: false,
          reason: `Forbidden pattern detected: ${pattern}`,
          pattern: pattern.toString()
        };
      }
    }

    // Check for allowed methods
    const violations = [];
    const methodPattern = /bot\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;
    const matches = code.match(methodPattern) || [];

    for (const match of matches) {
      const allowed = ALLOWED_BOT_METHODS.some(m => match.startsWith(m));
      if (!allowed) {
        violations.push(match);
      }
    }

    if (violations.length > 0) {
      return {
        safe: false,
        reason: `Unknown bot methods: ${violations.join(', ')}`,
        violations
      };
    }

    return { safe: true };
  }

  /**
   * Execute dynamic skill in sandbox
   */
  async executeDynamic(code, params) {
    // Validate safety first
    const safety = this.validateSafety(code);
    if (!safety.safe) {
      throw new Error(`Unsafe code: ${safety.reason}`);
    }

    // Create sandbox context
    const context = {
      bot: this.createBotProxy(),
      params,
      console: this.createSafeConsole(),
      Math,
      Date,
      JSON
    };

    try {
      // For now, use Function constructor (less secure but more portable)
      // In production, use isolated-vm or SES
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction(
        'bot', 'params', 'console', 'Math', 'Date', 'JSON',
        code
      );

      const result = await fn(
        context.bot,
        context.params,
        context.console,
        Math,
        Date,
        JSON
      );

      return { success: true, result };
    } catch (error) {
      logger.error('Dynamic skill execution failed:', error);
      throw error;
    }
  }

  /**
   * Create proxy for bot to limit access
   */
  createBotProxy() {
    const bot = this.bot;
    const proxy = {};

    // Only expose allowed methods
    for (const method of ALLOWED_BOT_METHODS) {
      const parts = method.split('.');
      let obj = bot;
      let target = proxy;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) {
          target[parts[i]] = {};
        }
        target = target[parts[i]];
        obj = obj[parts[i]];
      }

      // Bind method or copy value
      const lastPart = parts[parts.length - 1];
      if (typeof obj[lastPart] === 'function') {
        target[lastPart] = obj[lastPart].bind(obj);
      } else {
        target[lastPart] = obj[lastPart];
      }
    }

    return proxy;
  }

  /**
   * Create safe console for sandbox
   */
  createSafeConsole() {
    return {
      log: (...args) => logger.debug('[Sandbox]', ...args),
      warn: (...args) => logger.warn('[Sandbox]', ...args),
      error: (...args) => logger.error('[Sandbox]', ...args)
    };
  }
}

export { SkillExecutor };
```

- [ ] **Step 4: Implement turn limiter**

```javascript
// src/skills/turnLimiter.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('TurnLimiter');

/**
 * Limits retry attempts for dynamic skill generation
 */
class TurnLimiter {
  constructor(config = {}) {
    this.maxAttempts = config.maxAttempts || 3;
    this.escalationThreshold = config.escalationThreshold || 2;
    this.currentAttempts = 0;
    this.errorHistory = [];
    this.task = null;
  }

  /**
   * Start new generation cycle
   */
  startGeneration(task) {
    this.currentAttempts = 0;
    this.errorHistory = [];
    this.task = task;
    logger.debug(`Starting generation for: ${task?.intent || 'unknown'}`);
  }

  /**
   * Check if retry is allowed
   */
  canRetry(error) {
    this.currentAttempts++;
    this.errorHistory.push({
      attempt: this.currentAttempts,
      error: error.message,
      timestamp: Date.now()
    });

    // Check for repeated errors
    const sameErrorCount = this.errorHistory
      .filter(e => e.error === error.message)
      .length;

    if (sameErrorCount >= 2) {
      logger.warn(`Repeated error detected: ${error.message}`);
      return false;
    }

    // Check max attempts
    if (this.currentAttempts >= this.maxAttempts) {
      logger.warn(`Max attempts (${this.maxAttempts}) reached`);
      return false;
    }

    return true;
  }

  /**
   * Generate error context for re-prompting
   */
  generateErrorContext() {
    return {
      task: this.task,
      attempts: this.currentAttempts,
      errors: this.errorHistory,
      lastError: this.errorHistory[this.errorHistory.length - 1]
    };
  }

  /**
   * Handle when limit is reached
   */
  handleLimitReached() {
    const errorMessage = this.errorHistory.length > 0
      ? `Não consegui executar após ${this.currentAttempts} tentativas. Último erro: ${this.errorHistory[0].error}`
      : `Não consegui executar após ${this.currentAttempts} tentativas.`;

    this.logFailure();

    return {
      success: false,
      reason: 'turn_limit_reached',
      message: errorMessage,
      attempts: this.currentAttempts,
      shouldFallback: this.shouldUseFallback()
    };
  }

  /**
   * Check if fallback should be used
   */
  shouldUseFallback() {
    return this.currentAttempts >= this.escalationThreshold;
  }

  /**
   * Log failure for analysis
   */
  logFailure() {
    logger.error('Turn limit reached', {
      task: this.task,
      attempts: this.currentAttempts,
      errors: this.errorHistory
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      attempts: this.currentAttempts,
      maxAttempts: this.maxAttempts,
      errors: this.errorHistory.length,
      canRetry: this.currentAttempts < this.maxAttempts
    };
  }

  /**
   * Reset limiter
   */
  reset() {
    this.currentAttempts = 0;
    this.errorHistory = [];
    this.task = null;
  }
}

export { TurnLimiter };
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/unit/skills/executor.test.js
# Expected: PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/skills/executor.js src/skills/turnLimiter.js tests/unit/skills/executor.test.js
git commit -m "feat(skills): add skill executor with sandbox

- Implement SkillExecutor with timeout
- Add safety validation for dynamic skills
- Add bot proxy for limited access
- Add TurnLimiter for retry control
- Add tests"
```

---

## Task 6: Test-First Skill Generation

**Files:**
- Create: `src/skills/testFirst.js`
- Create: `tests/unit/skills/testFirst.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/skills/testFirst.test.js

import { TestFirstLoop } from '../../../src/skills/testFirst.js';

describe('TestFirstLoop', () => {
  let testFirst;
  let mockBot;
  let mockSandbox;

  beforeEach(() => {
    mockBot = {
      inventory: {
        items: () => [{ name: 'dirt', count: 64 }]
      },
      entity: { position: { x: 0, y: 64, z: 0 } },
      pathfinder: { goto: jest.fn() }
    };

    mockSandbox = {
      executeInMock: jest.fn()
    };

    testFirst = new TestFirstLoop(mockBot, mockSandbox);
  });

  describe('runSimulatedTest', () => {
    it('should pass for safe code', async () => {
      const code = `
        async function execute(bot, params) {
          try {
            await bot.pathfinder.goto(params.goal);
            return { success: true };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }
      `;

      mockSandbox.executeInMock.mockResolvedValue({ success: true });

      const result = await testFirst.runSimulatedTest(code, {});

      expect(result.passed).toBe(true);
    });

    it('should fail for unsafe code', async () => {
      const code = 'require("fs")';

      const result = await testFirst.runSimulatedTest(code, {});

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Forbidden');
    });

    it('should fail code without try/catch', async () => {
      const code = 'bot.pathfinder.goto(goal)';

      const result = await testFirst.runSimulatedTest(code, {});

      expect(result.passed).toBe(false);
    });
  });

  describe('checkBasicRequirements', () => {
    it('should require try/catch', () => {
      const code = 'await bot.pathfinder.goto(goal)';

      const violations = testFirst.checkBasicRequirements(code, {});

      expect(violations).toContainEqual(expect.stringContaining('try/catch'));
    });

    it('should require async', () => {
      const code = 'function execute() { return true; }';

      const violations = testFirst.checkBasicRequirements(code, {});

      expect(violations).toContainEqual(expect.stringContaining('async'));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/skills/testFirst.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement test-first loop**

```javascript
// src/skills/testFirst.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('TestFirstLoop');

/**
 * Test-First Loop for skill generation
 * Validates generated code before executing in real world
 */
class TestFirstLoop {
  constructor(bot, sandbox, config = {}) {
    this.bot = bot;
    this.sandbox = sandbox;
    this.maxTestAttempts = config.maxTestAttempts || 2;
  }

  /**
   * Generate and test skill code
   */
  async generateAndTest(task, llmProvider) {
    let code = null;
    let testResult = null;
    let attempts = 0;

    // Phase 1: Initial generation
    code = await llmProvider.generateCode(task);

    // Phase 2: Simulated tests
    while (attempts < this.maxTestAttempts) {
      testResult = await this.runSimulatedTest(code, task);

      if (testResult.passed) {
        logger.info('[TestFirst] Code passed simulated tests');
        return { success: true, code };
      }

      attempts++;
      logger.warn(`[TestFirst] Test failed (${attempts}/${this.maxTestAttempts})`);

      if (attempts < this.maxTestAttempts) {
        // Generate corrected version with error context
        code = await llmProvider.regenerateWithErrors(
          code,
          testResult.error,
          task
        );
      }
    }

    // Phase 3: Max tests reached
    logger.warn('[TestFirst] Max tests reached, executing anyway');
    return {
      success: false,
      code,
      testError: testResult?.error,
      warning: 'Code did not pass simulated tests'
    };
  }

  /**
   * Run simulated test in mock environment
   */
  async runSimulatedTest(code, task) {
    // Create mock environment
    const mockBot = this.createMockBot();
    const mockState = { currentTask: task };

    try {
      // Check safety first
      const safetyCheck = this.checkSafety(code);
      if (!safetyCheck.safe) {
        return {
          passed: false,
          error: `Safety violation: ${safetyCheck.reason}`
        };
      }

      // Check basic requirements
      const violations = this.checkBasicRequirements(code, task);
      if (violations.length > 0) {
        return {
          passed: false,
          error: `Requirements not met: ${violations.join(', ')}`
        };
      }

      // Try to execute in mock
      if (this.sandbox?.executeInMock) {
        await this.sandbox.executeInMock(code, {
          bot: mockBot,
          state: mockState
        });
      }

      return { passed: true };

    } catch (error) {
      return {
        passed: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Create mock bot for testing
   */
  createMockBot() {
    return {
      inventory: {
        items: () => [{ name: 'dirt', count: 64 }],
        count: (item) => item === 'dirt' ? 64 : 0
      },
      entity: {
        position: { x: 0, y: 64, z: 0 }
      },
      pathfinder: {
        goto: async () => {},
        stop: () => {}
      },
      findBlocks: () => [],
      blockAt: () => ({ name: 'air', position: { x: 0, y: 64, z: 0 } }),
      chat: (msg) => logger.debug(`[Mock] ${msg}`),
      health: 20,
      food: 20
    };
  }

  /**
   * Check code safety
   */
  checkSafety(code) {
    const forbiddenPatterns = [
      /require\s*\(/,
      /import\s+/,
      /eval\s*\(/,
      /Function\s*\(/,
      /process\s*\./,
      /fs\./,
      /child_process/,
      /http\./,
      /https\./,
      /__dirname/,
      /__filename/,
      /globalThis/,
      /global\s*\(/,
      /__proto__/,
      /Reflect\s*\./,
      /Proxy\s*\(/
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(code)) {
        return { safe: false, reason: `Forbidden pattern detected: ${pattern}` };
      }
    }

    return { safe: true };
  }

  /**
   * Check basic requirements for skill code
   */
  checkBasicRequirements(code, task) {
    const violations = [];

    // Must have try/catch
    if (!code.includes('try') || !code.includes('catch')) {
      violations.push('Code must have error handling (try/catch)');
    }

    // Must be async
    if (!code.includes('async') && !code.includes('await')) {
      violations.push('Code must be async');
    }

    // Must use bot parameter
    if (!code.includes('bot.')) {
      violations.push('Code must use bot parameter');
    }

    return violations;
  }
}

export { TestFirstLoop };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/skills/testFirst.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/skills/testFirst.js tests/unit/skills/testFirst.test.js
git commit -m "feat(skills): add test-first loop for dynamic skills

- Implement simulated testing before execution
- Add safety checks for generated code
- Check basic requirements (async, try/catch)
- Add mock bot for testing
- Add tests"
```

---

## Task 7: Integration Test for Skills

**Files:**
- Create: `tests/integration/skills.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration/skills.test.js

import { SkillRegistry } from '../../src/skills/index.js';
import { SkillExecutor } from '../../src/skills/executor.js';
import { TurnLimiter } from '../../src/skills/turnLimiter.js';
import { createMockBot } from '../mocks/bot.mock.js';

describe('Skills Integration', () => {
  let registry;
  let executor;
  let mockBot;

  beforeEach(() => {
    mockBot = createMockBot();
    const mockState = {
      isBusy: () => false,
      setTask: jest.fn(),
      clearTask: jest.fn()
    };

    registry = new SkillRegistry(mockBot);
    executor = new SkillExecutor(mockBot, mockState);
  });

  describe('Registry + Executor', () => {
    it('should register and execute skill', async () => {
      const skill = {
        name: 'test_skill',
        description: 'Test skill',
        execute: jest.fn().mockResolvedValue({ success: true })
      };

      registry.register(skill);

      const registered = registry.get('test_skill');
      expect(registered).toBe(skill);

      await executor.execute(registered, {});
      expect(skill.execute).toHaveBeenCalled();
    });
  });

  describe('Turn Limiter', () => {
    it('should limit retries', () => {
      const limiter = new TurnLimiter({ maxAttempts: 3 });

      limiter.startGeneration({ intent: 'test' });

      expect(limiter.canRetry(new Error('fail'))).toBe(true);
      expect(limiter.canRetry(new Error('fail2'))).toBe(true);
      expect(limiter.canRetry(new Error('fail3'))).toBe(false);
    });

    it('should detect repeated errors', () => {
      const limiter = new TurnLimiter({ maxAttempts: 5 });

      limiter.startGeneration({ intent: 'test' });

      expect(limiter.canRetry(new Error('same'))).toBe(true);
      expect(limiter.canRetry(new Error('same'))).toBe(false);
    });
  });

  describe('Base Skills', () => {
    it('should load all base skills', async () => {
      await registry.loadBaseSkills('./src/skills/base');

      const names = registry.getNames();

      expect(names).toContain('walk');
      expect(names).toContain('mine');
      expect(names).toContain('collect');
      expect(names).toContain('stop');
    });
  });
});
```

- [ ] **Step 2: Create mock bot**

```javascript
// tests/mocks/bot.mock.js

function createMockBot(overrides = {}) {
  return {
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }
    },
    health: 20,
    food: 20,

    inventory: {
      items: () => [],
      count: () => 0,
      slots: []
    },

    pathfinder: {
      goto: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      setGoal: jest.fn()
    },

    dig: jest.fn().mockResolvedValue(undefined),
    placeBlock: jest.fn().mockResolvedValue(undefined),
    chat: jest.fn(),
    lookAt: jest.fn(),
    attack: jest.fn(),
    jump: jest.fn(),

    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),

    findBlocks: jest.fn().mockReturnValue([]),
    blockAt: jest.fn().mockReturnValue({ name: 'air' }),
    entities: {},

    players: {},

    ...overrides
  };
}

module.exports = { createMockBot };
```

- [ ] **Step 3: Run integration test**

```bash
npm test -- tests/integration/skills.test.js
# Expected: PASS
```

- [ ] **Step 4: Final commit for Skills Layer**

```bash
git add tests/integration/skills.test.js tests/mocks/bot.mock.js
git commit -m "test(skills): add integration tests

- Test registry + executor integration
- Test turn limiter
- Test base skill loading
- Add mock bot helper"
```

---

## Completion Checklist

- [ ] All tests passing
- [ ] All files created
- [ ] All commits made
- [ ] No linting errors (`npm run lint`)
- [ ] Integration test passes

---

**Next Plan:** [05-llm-layer.md](./2026-03-29-05-llm-layer.md)