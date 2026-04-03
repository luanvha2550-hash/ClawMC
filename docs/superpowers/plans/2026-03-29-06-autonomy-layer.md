# Autonomy Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar Autonomy Layer com Curriculum Manager (Voyager-style), Idle Loop, Scheduler (cron) e Survival Monitor para comportamento proativo do bot.

**Architecture:** Node.js com node-cron para agendamento, sistema de fases (survival → gathering → exploration → advanced), priorização de tarefas autônomas.

**Tech Stack:** Node.js 18+, node-cron, sistema de triggers baseado em estado.

---

## Task 1: Curriculum Manager

**Files:**
- Create: `src/autonomy/curriculum.js`
- Create: `tests/unit/autonomy/curriculum.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/autonomy/curriculum.test.js

import { CurriculumManager } from '../../../src/autonomy/curriculum.js';

describe('CurriculumManager', () => {
  let curriculum;
  let mockState;
  let mockMemory;

  beforeEach(() => {
    mockState = {
      getInventory: jest.fn().mockReturnValue([
        { name: 'dirt', count: 64 },
        { name: 'stone', count: 32 }
      ]),
      getPosition: jest.fn().mockReturnValue({ x: 0, y: 64, z: 0 }),
      hasShelter: jest.fn().mockReturnValue(false),
      learnedSkills: new Set()
    };

    mockMemory = {
      getFacts: jest.fn().mockReturnValue([])
    };

    curriculum = new CurriculumManager(mockState, mockMemory);
  });

  describe('getCurrentPhase', () => {
    it('should return survival for new bot', () => {
      const phase = curriculum.getCurrentPhase();
      expect(phase).toBe('survival');
    });

    it('should progress to gathering after survival', () => {
      mockState.hasShelter.mockReturnValue(true);
      mockState.getInventory.mockReturnValue([
        { name: 'wooden_pickaxe', count: 1 },
        { name: 'wooden_axe', count: 1 }
      ]);

      curriculum.updateProgress();
      const phase = curriculum.getCurrentPhase();

      expect(phase).toBe('gathering');
    });
  });

  describe('getNextGoal', () => {
    it('should return food goal when hungry', () => {
      mockState.getVitals = jest.fn().mockReturnValue({ health: 20, food: 5 });

      const goal = curriculum.getNextGoal();

      expect(goal.skill).toBe('find_food');
      expect(goal.priority).toBe(10);
    });

    it('should return shelter goal at night', () => {
      curriculum.timeOfDay = 13000; // Night
      mockState.hasShelter.mockReturnValue(false);

      const goal = curriculum.getNextGoal();

      expect(goal.skill).toBe('build_shelter');
    });
  });

  describe('markLearned', () => {
    it('should add skill to learned set', () => {
      curriculum.markLearned('mine_iron');

      expect(curriculum.learnedSkills.has('mine_iron')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/autonomy/curriculum.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement curriculum manager**

```javascript
// src/autonomy/curriculum.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Curriculum');

/**
 * Curriculum phases in order of progression
 */
const CURRICULUM_PHASES = {
  survival: [
    { skill: 'collect_wood', trigger: 'inventory.wood < 16', priority: 10 },
    { skill: 'craft_tools', trigger: 'no_pickaxe && no_axe', priority: 9 },
    { skill: 'find_food', trigger: 'food < 10', priority: 10 },
    { skill: 'build_shelter', trigger: 'night_coming && no_shelter', priority: 8 }
  ],
  gathering: [
    { skill: 'mine_stone', trigger: 'inventory.stone < 32', priority: 7 },
    { skill: 'mine_iron', trigger: 'has_iron_pickaxe && inventory.iron < 16', priority: 6 },
    { skill: 'smelt_ores', trigger: 'has_furnace && has_raw_ores', priority: 5 },
    { skill: 'store_resources', trigger: 'inventory.full', priority: 8 }
  ],
  exploration: [
    { skill: 'explore_chunk', trigger: 'unexplored_chunks_nearby', priority: 4 },
    { skill: 'map_location', trigger: 'interesting_location_found', priority: 3 },
    { skill: 'find_village', trigger: 'days > 1 && !found_village', priority: 3 },
    { skill: 'discover_biomes', trigger: 'biomes_discovered < 5', priority: 2 }
  ],
  advanced: [
    { skill: 'mine_diamonds', trigger: 'has_iron_pickaxe && inventory.diamond < 5', priority: 5 },
    { skill: 'enchant_tools', trigger: 'has_enchanting_table && levels > 30', priority: 4 },
    { skill: 'build_farm', trigger: 'has_farmland_nearby && !has_farm', priority: 3 }
  ]
};

/**
 * Curriculum Manager - Inspired by Voyager
 * Manages autonomous goal selection based on bot state
 */
class CurriculumManager {
  constructor(state, memory, config = {}) {
    this.state = state;
    this.memory = memory;
    this.config = config;

    this.currentPhase = 'survival';
    this.learnedSkills = new Set();
    this.completedGoals = [];

    // Time tracking
    this.timeOfDay = 0;
    this.dayCount = 0;

    // Phase progress
    this.phaseProgress = {
      survival: 0,
      gathering: 0,
      exploration: 0,
      advanced: 0
    };
  }

  /**
   * Get current phase based on progress
   */
  getCurrentPhase() {
    // Check phase progression
    this.updateProgress();

    if (this.phaseProgress.survival < 0.7) {
      return 'survival';
    }
    if (this.phaseProgress.gathering < 0.7) {
      return 'gathering';
    }
    if (this.phaseProgress.exploration < 0.7) {
      return 'exploration';
    }
    return 'advanced';
  }

  /**
   * Get next autonomous goal
   */
  getNextGoal() {
    // First check survival needs (always priority)
    const survivalGoal = this.checkSurvivalNeeds();
    if (survivalGoal) {
      return survivalGoal;
    }

    // Then check scheduled tasks
    // (handled by Scheduler)

    // Then check curriculum goals
    const phase = this.getCurrentPhase();
    const goals = CURRICULUM_PHASES[phase] || [];

    // Filter by trigger and sort by priority
    const activeGoals = goals
      .filter(g => this.evaluateTrigger(g.trigger))
      .sort((a, b) => b.priority - a.priority);

    // Skip already learned skills if possible
    const newGoal = activeGoals.find(g => !this.learnedSkills.has(g.skill));

    return newGoal || activeGoals[0] || null;
  }

  /**
   * Check survival needs (highest priority)
   */
  checkSurvivalNeeds() {
    const vitals = this.state.getVitals?.() || { health: 20, food: 20 };

    // Critical food
    if (vitals.food < 10) {
      return {
        skill: 'find_food',
        priority: 10,
        reason: `Fome crítica: ${vitals.food}/20`,
        params: { minFood: 10 }
      };
    }

    // Critical health
    if (vitals.health < 10) {
      return {
        skill: 'regenerate',
        priority: 10,
        reason: `Vida crítica: ${vitals.health}/20`,
        params: { minHealth: 10 }
      };
    }

    // Night coming without shelter
    if (this.timeOfDay > 11000 && !this.state.hasShelter?.()) {
      return {
        skill: 'build_shelter',
        priority: 9,
        reason: 'Anoitecer - sem abrigo',
        params: { urgent: true }
      };
    }

    return null;
  }

  /**
   * Evaluate trigger expression
   */
  evaluateTrigger(trigger) {
    const inventory = this.state.getInventory?.() || [];
    const position = this.state.getPosition?.() || { x: 0, y: 64, z: 0 };

    // Simple trigger evaluation
    // Format: "condition" with && and || operators

    const conditions = {
      'inventory.wood < 16': () => this.countItem(inventory, 'wood') < 16,
      'inventory.stone < 32': () => this.countItem(inventory, 'stone') < 32,
      'inventory.iron < 16': () => this.countItem(inventory, 'iron') < 16,
      'no_pickaxe': () => !this.hasItem(inventory, 'pickaxe'),
      'no_axe': () => !this.hasItem(inventory, 'axe'),
      'has_iron_pickaxe': () => this.hasItem(inventory, 'iron_pickaxe'),
      'food < 10': () => (this.state.getVitals?.()?.food || 20) < 10,
      'night_coming': () => this.timeOfDay > 11000,
      'no_shelter': () => !this.state.hasShelter?.(),
      'inventory.full': () => this.isInventoryFull(inventory)
    };

    // Simple evaluation
    if (conditions[trigger]) {
      return conditions[trigger]();
    }

    // Complex evaluation with && and ||
    if (trigger.includes('&&')) {
      return trigger.split('&&').every(t => this.evaluateTrigger(t.trim()));
    }

    if (trigger.includes('||')) {
      return trigger.split('||').some(t => this.evaluateTrigger(t.trim()));
    }

    // Unknown trigger - return false
    return false;
  }

  /**
   * Count items by name pattern
   */
  countItem(inventory, pattern) {
    return inventory
      .filter(item => item.name.toLowerCase().includes(pattern))
      .reduce((sum, item) => sum + item.count, 0);
  }

  /**
   * Check if inventory has item
   */
  hasItem(inventory, pattern) {
    return inventory.some(item =>
      item.name.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if inventory is full
   */
  isInventoryFull(inventory) {
    // Assume 36 slots
    return inventory.length >= 36;
  }

  /**
   * Mark skill as learned
   */
  markLearned(skillName) {
    this.learnedSkills.add(skillName);
    this.updateProgress();

    logger.info(`[Curriculum] Learned skill: ${skillName}`);
  }

  /**
   * Update phase progress
   */
  updateProgress() {
    // Survival: based on basic needs met
    const vitals = this.state.getVitals?.() || { health: 20, food: 20 };
    const hasShelter = this.state.hasShelter?.() || false;
    const hasTools = this.hasItem(this.state.getInventory?.() || [], 'pickaxe') &&
                     this.hasItem(this.state.getInventory?.() || [], 'axe');

    this.phaseProgress.survival = (
      (vitals.health >= 15 ? 0.3 : 0) +
      (vitals.food >= 15 ? 0.3 : 0) +
      (hasShelter ? 0.2 : 0) +
      (hasTools ? 0.2 : 0)
    );

    // Gathering: based on resources collected
    const inventory = this.state.getInventory?.() || [];
    const wood = this.countItem(inventory, 'wood') || this.countItem(inventory, 'log');
    const stone = this.countItem(inventory, 'stone');
    const iron = this.countItem(inventory, 'iron');

    this.phaseProgress.gathering = Math.min(1, (
      (wood >= 16 ? 0.3 : wood / 16 * 0.3) +
      (stone >= 32 ? 0.3 : stone / 32 * 0.3) +
      (iron >= 16 ? 0.4 : iron / 16 * 0.4)
    ));

    // Exploration: based on discoveries
    const biomesDiscovered = this.memory?.getFacts?.('biome')?.length || 0;
    this.phaseProgress.exploration = Math.min(1, biomesDiscovered / 5);

    // Advanced: based on diamond/enchanting progress
    const diamonds = this.countItem(inventory, 'diamond');
    this.phaseProgress.advanced = Math.min(1, diamonds / 5);
  }

  /**
   * Set time of day (for circadian events)
   */
  setTimeOfDay(time) {
    const wasDay = this.timeOfDay < 12000;
    this.timeOfDay = time;
    const isDay = time < 12000;

    if (wasDay && !isDay) {
      this.dayCount++;
      logger.debug(`[Curriculum] Night ${this.dayCount}`);
    }
  }

  /**
   * Export for checkpoint
   */
  export() {
    return {
      currentPhase: this.currentPhase,
      learnedSkills: Array.from(this.learnedSkills),
      phaseProgress: this.phaseProgress,
      dayCount: this.dayCount
    };
  }

  /**
   * Import from checkpoint
   */
  import(data) {
    if (data.currentPhase) this.currentPhase = data.currentPhase;
    if (data.learnedSkills) this.learnedSkills = new Set(data.learnedSkills);
    if (data.phaseProgress) this.phaseProgress = data.phaseProgress;
    if (data.dayCount) this.dayCount = data.dayCount;
  }
}

export { CurriculumManager, CURRICULUM_PHASES };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/autonomy/curriculum.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/autonomy/curriculum.js tests/unit/autonomy/curriculum.test.js
git commit -m "feat(autonomy): add curriculum manager

- Implement Voyager-style curriculum phases
- Add survival priority check
- Add trigger evaluation
- Add skill learning tracking
- Add tests"
```

---

## Task 2: Idle Loop

**Files:**
- Create: `src/autonomy/idle.js`
- Create: `tests/unit/autonomy/idle.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/autonomy/idle.test.js

import { IdleLoop } from '../../../src/autonomy/idle.js';

describe('IdleLoop', () => {
  let idleLoop;
  let mockCurriculum;
  let mockScheduler;
  let mockSurvival;
  let mockState;

  beforeEach(() => {
    mockCurriculum = {
      getNextGoal: jest.fn()
    };

    mockScheduler = {
      getNextTask: jest.fn()
    };

    mockSurvival = {
      check: jest.fn().mockResolvedValue(null)
    };

    mockState = {
      isBusy: jest.fn().mockReturnValue(false),
      setTask: jest.fn(),
      clearTask: jest.fn(),
      lastActivity: Date.now() - 60000 // 1 minute ago
    };

    idleLoop = new IdleLoop(mockCurriculum, mockScheduler, mockSurvival, mockState);
  });

  describe('tick', () => {
    it('should not act when busy', async () => {
      mockState.isBusy.mockReturnValue(true);

      await idleLoop.tick();

      expect(mockCurriculum.getNextGoal).not.toHaveBeenCalled();
    });

    it('should check survival first', async () => {
      mockSurvival.check.mockResolvedValue({
        skill: 'find_food',
        priority: 10
      });

      await idleLoop.tick();

      expect(mockSurvival.check).toHaveBeenCalled();
    });

    it('should check scheduled tasks second', async () => {
      mockScheduler.getNextTask.mockReturnValue({
        name: 'patrol_base'
      });

      await idleLoop.tick();

      expect(mockScheduler.getNextTask).toHaveBeenCalled();
    });

    it('should check curriculum goals last', async () => {
      mockCurriculum.getNextGoal.mockReturnValue({
        skill: 'mine_stone'
      });

      await idleLoop.tick();

      expect(mockCurriculum.getNextGoal).toHaveBeenCalled();
    });
  });

  describe('shouldAct', () => {
    it('should return false when busy', () => {
      mockState.isBusy.mockReturnValue(true);

      expect(idleLoop.shouldAct()).toBe(false);
    });

    it('should return false when idle time not met', () => {
      mockState.isBusy.mockReturnValue(false);
      mockState.lastActivity = Date.now(); // Just now

      expect(idleLoop.shouldAct()).toBe(false);
    });

    it('should return true when idle and time met', () => {
      mockState.isBusy.mockReturnValue(false);
      mockState.lastActivity = Date.now() - 60000; // 1 minute ago

      expect(idleLoop.shouldAct()).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/autonomy/idle.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement idle loop**

```javascript
// src/autonomy/idle.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('IdleLoop');

/**
 * Idle Loop - Manages autonomous behavior when bot is not busy
 */
class IdleLoop {
  constructor(curriculum, scheduler, survival, state, config = {}) {
    this.curriculum = curriculum;
    this.scheduler = scheduler;
    this.survival = survival;
    this.state = state;

    this.idleTimeout = config.idleTimeout || 30000; // 30 seconds
    this.lastActivity = Date.now();
    this.isRunning = false;
  }

  /**
   * Main tick - called periodically
   */
  async tick() {
    // Don't act if busy
    if (this.state.isBusy()) {
      this.lastActivity = Date.now();
      return;
    }

    // Check if idle time met
    if (!this.shouldAct()) {
      return;
    }

    // Priority 1: Survival needs
    const survivalGoal = await this.survival.check();
    if (survivalGoal) {
      logger.info(`[Idle] Survival: ${survivalGoal.skill}`);
      await this.executeGoal(survivalGoal);
      return;
    }

    // Priority 2: Scheduled tasks
    const scheduledTask = this.scheduler.getNextTask();
    if (scheduledTask) {
      logger.info(`[Idle] Scheduled: ${scheduledTask.name}`);
      await this.executeGoal(scheduledTask);
      return;
    }

    // Priority 3: Curriculum goals
    const curriculumGoal = this.curriculum.getNextGoal();
    if (curriculumGoal) {
      logger.info(`[Idle] Curriculum: ${curriculumGoal.skill}`);
      await this.executeGoal(curriculumGoal);
      return;
    }

    // Nothing to do
    logger.debug('[Idle] No autonomous goal');
  }

  /**
   * Check if should act
   */
  shouldAct() {
    if (this.state.isBusy()) {
      return false;
    }

    const idleTime = Date.now() - this.lastActivity;
    return idleTime >= this.idleTimeout;
  }

  /**
   * Execute autonomous goal
   */
  async executeGoal(goal) {
    try {
      this.state.setTask({
        type: goal.skill,
        source: 'autonomous',
        params: goal.params || {},
        started: Date.now()
      });

      // Find or generate skill
      const skill = await this.findOrGenerateSkill(goal);

      if (skill) {
        await skill.execute(this.state.bot, goal.params);
        this.curriculum.markLearned(goal.skill);
      }

    } catch (error) {
      logger.error(`[Idle] Failed to execute ${goal.skill}:`, error.message);
    } finally {
      this.state.clearTask();
      this.lastActivity = Date.now();
    }
  }

  /**
   * Find existing skill or generate new one
   */
  async findOrGenerateSkill(goal) {
    // This would integrate with the skills layer
    // For now, return null - implemented in integration
    logger.debug(`[Idle] Looking for skill: ${goal.skill}`);
    return null;
  }

  /**
   * Start idle loop
   */
  start(interval = 5000) {
    if (this.isRunning) {
      logger.warn('[Idle] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), interval);
    logger.info(`[Idle] Started with ${interval}ms interval`);
  }

  /**
   * Stop idle loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('[Idle] Stopped');
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      idleTime: Date.now() - this.lastActivity,
      idleTimeout: this.idleTimeout,
      shouldAct: this.shouldAct()
    };
  }
}

export { IdleLoop };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/autonomy/idle.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/autonomy/idle.js tests/unit/autonomy/idle.test.js
git commit -m "feat(autonomy): add idle loop

- Implement priority-based goal selection
- Add survival, scheduled, curriculum priority
- Add start/stop methods
- Add tests"
```

---

## Task 3: Task Scheduler

**Files:**
- Create: `src/autonomy/scheduler.js`
- Create: `tests/unit/autonomy/scheduler.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/autonomy/scheduler.test.js

import { TaskScheduler } from '../../../src/autonomy/scheduler.js';

describe('TaskScheduler', () => {
  let scheduler;
  let mockState;

  beforeEach(() => {
    jest.useFakeTimers();

    mockState = {
      isBusy: jest.fn().mockReturnValue(false),
      setTask: jest.fn()
    };

    scheduler = new TaskScheduler(mockState, {});
  });

  afterEach(() => {
    scheduler.stopAll();
    jest.useRealTimers();
  });

  describe('schedule', () => {
    it('should schedule task with cron', () => {
      scheduler.schedule({
        name: 'test_task',
        cron: '*/5 * * * *',
        enabled: true
      });

      expect(scheduler.scheduledJobs.has('test_task')).toBe(true);
    });

    it('should not schedule disabled tasks', () => {
      scheduler.schedule({
        name: 'disabled_task',
        cron: '* * * * *',
        enabled: false
      });

      expect(scheduler.scheduledJobs.has('disabled_task')).toBe(false);
    });
  });

  describe('getNextTask', () => {
    it('should return null when no tasks ready', () => {
      const task = scheduler.getNextTask();
      expect(task).toBeNull();
    });
  });

  describe('stop', () => {
    it('should stop specific task', () => {
      scheduler.schedule({
        name: 'test_task',
        cron: '* * * * *',
        enabled: true
      });

      scheduler.stop('test_task');

      expect(scheduler.scheduledJobs.has('test_task')).toBe(false);
    });

    it('should stop all tasks', () => {
      scheduler.schedule({ name: 'task1', cron: '* * * * *', enabled: true });
      scheduler.schedule({ name: 'task2', cron: '* * * * *', enabled: true });

      scheduler.stopAll();

      expect(scheduler.scheduledJobs.size).toBe(0);
    });
  });

  describe('loadFromConfig', () => {
    it('should load tasks from config', () => {
      const config = {
        autonomy: {
          scheduledTasks: [
            { name: 'patrol', cron: '*/5 * * * *', enabled: true },
            { name: 'check_chests', cron: '*/30 * * * *', enabled: true }
          ]
        }
      };

      scheduler.loadFromConfig(config);

      expect(scheduler.scheduledJobs.has('patrol')).toBe(true);
      expect(scheduler.scheduledJobs.has('check_chests')).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/autonomy/scheduler.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement scheduler**

```javascript
// src/autonomy/scheduler.js

import cron from 'node-cron';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Scheduler');

/**
 * Default scheduled tasks
 */
const DEFAULT_SCHEDULED_TASKS = [
  { name: 'patrol_base', cron: '*/5 * * * *', enabled: true },
  { name: 'check_chests', cron: '*/30 * * * *', enabled: true },
  { name: 'organize_inventory', cron: '*/10 * * * *', enabled: true }
];

/**
 * Task Scheduler - OpenClaw-style scheduled tasks
 */
class TaskScheduler {
  constructor(state, config = {}) {
    this.state = state;
    this.config = config;
    this.scheduledJobs = new Map();
    this.tasks = [];
    this.pendingTasks = [];
  }

  /**
   * Load tasks from config
   */
  loadFromConfig(config) {
    this.tasks = config.autonomy?.scheduledTasks || DEFAULT_SCHEDULED_TASKS;
    logger.info(`[Scheduler] Loaded ${this.tasks.length} scheduled tasks`);
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    for (const task of this.tasks) {
      if (task.enabled) {
        this.schedule(task);
      }
    }
    logger.info(`[Scheduler] Started ${this.scheduledJobs.size} scheduled tasks`);
  }

  /**
   * Schedule a task
   */
  schedule(task) {
    if (!task.enabled && task.enabled !== undefined) {
      logger.debug(`[Scheduler] Task ${task.name} is disabled`);
      return;
    }

    const job = cron.schedule(task.cron, async () => {
      // Only execute if bot is idle
      if (!this.state.isBusy()) {
        logger.info(`[Scheduler] Executing: ${task.name}`);
        this.pendingTasks.push({
          ...task,
          scheduledAt: Date.now()
        });
      }
    });

    this.scheduledJobs.set(task.name, job);
    logger.debug(`[Scheduler] Scheduled: ${task.name} (${task.cron})`);
  }

  /**
   * Get next pending task
   */
  getNextTask() {
    if (this.pendingTasks.length === 0) {
      return null;
    }

    return this.pendingTasks.shift();
  }

  /**
   * Stop a specific task
   */
  stop(taskName) {
    const job = this.scheduledJobs.get(taskName);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(taskName);
      logger.info(`[Scheduler] Stopped: ${taskName}`);
    }
  }

  /**
   * Stop all tasks
   */
  stopAll() {
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.pendingTasks = [];
    logger.info('[Scheduler] Stopped all tasks');
  }

  /**
   * Add ad-hoc task
   */
  addTask(task) {
    this.pendingTasks.push({
      ...task,
      addedAt: Date.now()
    });
    logger.debug(`[Scheduler] Added ad-hoc task: ${task.name}`);
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks() {
    return Array.from(this.scheduledJobs.keys());
  }

  /**
   * Get pending tasks
   */
  getPendingTasks() {
    return [...this.pendingTasks];
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      scheduledCount: this.scheduledJobs.size,
      pendingCount: this.pendingTasks.length,
      tasks: this.getScheduledTasks()
    };
  }
}

export { TaskScheduler, DEFAULT_SCHEDULED_TASKS };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/autonomy/scheduler.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/autonomy/scheduler.js tests/unit/autonomy/scheduler.test.js
git commit -m "feat(autonomy): add task scheduler

- Implement cron-based scheduling
- Add default tasks
- Add pending task queue
- Add start/stop methods
- Add tests"
```

---

## Task 4: Survival Monitor

**Files:**
- Create: `src/autonomy/survival.js`
- Create: `tests/unit/autonomy/survival.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/autonomy/survival.test.js

import { SurvivalMonitor } from '../../../src/autonomy/survival.js';

describe('SurvivalMonitor', () => {
  let survival;
  let mockBot;
  let mockState;

  beforeEach(() => {
    mockBot = {
      health: 20,
      food: 20,
      entities: {},
      entity: { position: { x: 0, y: 64, z: 0 } }
    };

    mockState = {
      getVitals: jest.fn().mockReturnValue({ health: 20, food: 20 })
    };

    survival = new SurvivalMonitor(mockBot, mockState, {
      minFood: 10,
      minHealth: 10,
      maxDanger: 3
    });
  });

  describe('check', () => {
    it('should return null when healthy', async () => {
      const result = await survival.check();
      expect(result).toBeNull();
    });

    it('should return food goal when hungry', async () => {
      mockBot.food = 5;
      mockState.getVitals.mockReturnValue({ health: 20, food: 5 });

      const result = await survival.check();

      expect(result.skill).toBe('find_food');
      expect(result.priority).toBe(10);
    });

    it('should return escape goal when in danger', async () => {
      mockBot.entities = {
        1: { name: 'zombie', position: { x: 5, y: 64, z: 5 } },
        2: { name: 'skeleton', position: { x: 7, y: 64, z: 7 } },
        3: { name: 'creeper', position: { x: 3, y: 64, z: 3 } },
        4: { name: 'spider', position: { x: 4, y: 64, z: 4 } }
      };

      const result = await survival.check();

      expect(result.skill).toBe('escape');
      expect(result.reason).toContain('hostis');
    });

    it('should return regenerate when low health', async () => {
      mockBot.health = 5;
      mockState.getVitals.mockReturnValue({ health: 5, food: 20 });

      const result = await survival.check();

      expect(result.skill).toBe('regenerate');
    });
  });

  describe('countHostileMobs', () => {
    it('should count nearby hostile mobs', () => {
      mockBot.entities = {
        1: { name: 'zombie', position: { x: 5, y: 64, z: 5 } },
        2: { name: 'cow', position: { x: 10, y: 64, z: 10 } },
        3: { name: 'skeleton', position: { x: 15, y: 64, z: 15 } }
      };

      const count = survival.countHostileMobs(20);

      expect(count).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/autonomy/survival.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement survival monitor**

```javascript
// src/autonomy/survival.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Survival');

/**
 * Hostile mob types
 */
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
  'witch', 'phantom', 'drowned', 'husk', 'stray'
];

/**
 * Survival Monitor - Highest priority autonomous checks
 */
class SurvivalMonitor {
  constructor(bot, state, config = {}) {
    this.bot = bot;
    this.state = state;

    this.thresholds = {
      minFood: config.minFood || 10,
      minHealth: config.minHealth || 10,
      maxDanger: config.maxDanger || 3
    };
  }

  /**
   * Check survival conditions
   * Returns a goal if action needed, null otherwise
   */
  async check() {
    const vitals = this.getVitals();

    // Priority 1: Critical food
    if (vitals.food < this.thresholds.minFood) {
      return {
        skill: 'find_food',
        priority: 10,
        reason: `Fome crítica: ${vitals.food}/20`,
        params: { minFood: this.thresholds.minFood }
      };
    }

    // Priority 2: Critical health
    if (vitals.health < this.thresholds.minHealth) {
      return {
        skill: 'regenerate',
        priority: 10,
        reason: `Vida crítica: ${vitals.health}/20`,
        params: { minHealth: this.thresholds.minHealth }
      };
    }

    // Priority 3: Danger nearby
    const hostiles = this.countHostileMobs(20);
    if (hostiles > this.thresholds.maxDanger) {
      return {
        skill: 'escape',
        priority: 10,
        reason: `${hostiles} mobs hostis próximos`,
        params: { hostiles }
      };
    }

    // All good
    return null;
  }

  /**
   * Get vitals (health, food)
   */
  getVitals() {
    return {
      health: this.bot?.health ?? 20,
      food: this.bot?.food ?? 20
    };
  }

  /**
   * Count hostile mobs in range
   */
  countHostileMobs(range) {
    const entities = Object.values(this.bot?.entities || {});
    const botPos = this.bot?.entity?.position;

    if (!botPos) return 0;

    return entities.filter(e => {
      // Check if hostile
      const isHostile = HOSTILE_MOBS.some(h =>
        e.name?.toLowerCase().includes(h)
      );

      if (!isHostile) return false;

      // Check distance
      const distance = e.position?.distanceTo?.(botPos) || 999;
      return distance < range;
    }).length;
  }

  /**
   * Check if safe to act
   */
  isSafe() {
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    return (
      vitals.health >= this.thresholds.minHealth &&
      vitals.food >= this.thresholds.minFood &&
      hostiles <= this.thresholds.maxDanger
    );
  }

  /**
   * Get survival status
   */
  getStatus() {
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    return {
      health: vitals.health,
      food: vitals.food,
      hostiles,
      isSafe: this.isSafe(),
      alerts: this.getAlerts()
    };
  }

  /**
   * Get active alerts
   */
  getAlerts() {
    const alerts = [];
    const vitals = this.getVitals();
    const hostiles = this.countHostileMobs(20);

    if (vitals.food < this.thresholds.minFood) {
      alerts.push({
        type: 'food',
        severity: 'critical',
        message: `Fome: ${vitals.food}/20`
      });
    }

    if (vitals.health < this.thresholds.minHealth) {
      alerts.push({
        type: 'health',
        severity: 'critical',
        message: `Vida: ${vitals.health}/20`
      });
    }

    if (hostiles > this.thresholds.maxDanger) {
      alerts.push({
        type: 'danger',
        severity: 'high',
        message: `${hostiles} mobs hostis`
      });
    }

    return alerts;
  }

  /**
   * Get nearest hostile mob
   */
  getNearestHostile() {
    const entities = Object.values(this.bot?.entities || {});
    const botPos = this.bot?.entity?.position;

    if (!botPos) return null;

    let nearest = null;
    let nearestDist = Infinity;

    for (const e of entities) {
      const isHostile = HOSTILE_MOBS.some(h =>
        e.name?.toLowerCase().includes(h)
      );

      if (!isHostile) continue;

      const dist = e.position?.distanceTo?.(botPos);
      if (dist && dist < nearestDist) {
        nearest = e;
        nearestDist = dist;
      }
    }

    return nearest ? { entity: nearest, distance: nearestDist } : null;
  }

  /**
   * Get escape direction
   */
  getEscapeDirection() {
    const nearest = this.getNearestHostile();
    if (!nearest) return null;

    const botPos = this.bot.entity.position;
    const hostilePos = nearest.entity.position;

    // Direction away from hostile
    const dx = botPos.x - hostilePos.x;
    const dz = botPos.z - hostilePos.z;

    // Normalize and scale
    const length = Math.sqrt(dx * dx + dz * dz);
    if (length === 0) return { x: 0, z: 0 };

    return {
      x: botPos.x + (dx / length) * 30,
      z: botPos.z + (dz / length) * 30
    };
  }
}

export { SurvivalMonitor, HOSTILE_MOBS };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/autonomy/survival.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/autonomy/survival.js tests/unit/autonomy/survival.test.js
git commit -m "feat(autonomy): add survival monitor

- Implement survival priority checks
- Add hostile mob detection
- Add escape direction calculation
- Add alerts system
- Add tests"
```

---

## Task 5: Circadian Events

**Files:**
- Create: `src/core/circadianEvents.js`
- Create: `tests/unit/core/circadianEvents.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// tests/unit/core/circadianEvents.test.js

import { CircadianEvents } from '../../../src/core/circadianEvents.js';

describe('CircadianEvents', () => {
  let circadian;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      time: { timeOfDay: 0 },
      on: jest.fn(),
      emit: jest.fn()
    };

    circadian = new CircadianEvents(mockBot);
  });

  describe('checkTimeEvents', () => {
    it('should emit nightfall at dusk', () => {
      mockBot.time.timeOfDay = 12000; // Dusk

      circadian.lastDayTime = 10000;
      circadian.checkTimeEvents();

      expect(mockBot.emit).toHaveBeenCalledWith('circadian', expect.objectContaining({
        event: 'nightfall'
      }));
    });

    it('should emit daybreak at dawn', () => {
      mockBot.time.timeOfDay = 0; // Dawn

      circadian.lastDayTime = 23000;
      circadian.checkTimeEvents();

      expect(mockBot.emit).toHaveBeenCalledWith('circadian', expect.objectContaining({
        event: 'daybreak'
      }));
    });

    it('should not emit during day', () => {
      mockBot.time.timeOfDay = 5000; // Day

      circadian.lastDayTime = 3000;
      circadian.checkTimeEvents();

      expect(mockBot.emit).not.toHaveBeenCalled();
    });
  });

  describe('isDay', () => {
    it('should return true during day', () => {
      mockBot.time.timeOfDay = 5000;

      expect(circadian.isDay()).toBe(true);
    });

    it('should return false during night', () => {
      mockBot.time.timeOfDay = 15000;

      expect(circadian.isDay()).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/core/circadianEvents.test.js
# Expected: FAIL
```

- [ ] **Step 3: Implement circadian events**

```javascript
// src/core/circadianEvents.js

import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Circadian');

/**
 * Circadian Events - Day/night cycle events
 */
class CircadianEvents {
  constructor(bot) {
    this.bot = bot;
    this.lastDayTime = null;

    // Listen for time changes
    if (this.bot.on) {
      this.bot.on('time', () => this.checkTimeEvents());
    }
  }

  /**
   * Check for circadian transitions
   */
  checkTimeEvents() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    const isDay = this.isDay();

    // First check - no previous time
    if (this.lastDayTime === null) {
      this.lastDayTime = dayTime;
      return;
    }

    const lastIsDay = this.lastDayTime < 12000;

    // Day → Night transition (dusk)
    if (lastIsDay && !isDay) {
      this.onNightfall();
    }

    // Night → Day transition (dawn)
    if (!lastIsDay && isDay) {
      this.onDaybreak();
    }

    // Sunrise (early morning)
    if (this.lastDayTime > 22000 && dayTime < 1000) {
      this.onSunrise();
    }

    // Sunset (late afternoon)
    if (this.lastDayTime < 11000 && dayTime >= 11000 && dayTime < 12000) {
      this.onSunset();
    }

    this.lastDayTime = dayTime;
  }

  /**
   * Check if currently day
   */
  isDay() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    return dayTime < 12000;
  }

  /**
   * Nightfall event
   */
  onNightfall() {
    logger.info('[Circadian] Nightfall - initiating safety protocol');

    this.emit('nightfall', {
      message: 'Está anoitecendo. Mobs hostis podem aparecer.',
      priority: 'high',
      suggestedActions: [
        'build_shelter',
        'go_home',
        'light_area'
      ]
    });
  }

  /**
   * Daybreak event
   */
  onDaybreak() {
    logger.info('[Circadian] Daybreak - area safe again');

    this.emit('daybreak', {
      message: 'Está amanhecendo. Mobs hostis vão queimar.',
      priority: 'low',
      suggestedActions: [
        'resume_tasks',
        'collect_drops'
      ]
    });
  }

  /**
   * Sunrise event
   */
  onSunrise() {
    this.emit('sunrise', { priority: 'none' });
  }

  /**
   * Sunset event
   */
  onSunset() {
    logger.info('[Circadian] Sunset - preparing for night');

    this.emit('sunset', {
      priority: 'medium',
      suggestedActions: [
        'check_shelter',
        'gather_torch'
      ]
    });
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.bot.emit) {
      this.bot.emit('circadian', { event, ...data });
    }
  }

  /**
   * Get current time info
   */
  getTimeInfo() {
    const dayTime = this.bot.time?.timeOfDay ?? 0;
    const isDay = this.isDay();
    const hours = Math.floor((dayTime / 24000) * 24);
    const minutes = Math.floor(((dayTime / 24000) * 24 * 60) % 60);

    return {
      dayTime,
      isDay,
      hours,
      minutes,
      phase: this.getPhase(dayTime)
    };
  }

  /**
   * Get time phase
   */
  getPhase(dayTime) {
    if (dayTime < 1000) return 'sunrise';
    if (dayTime < 6000) return 'morning';
    if (dayTime < 11000) return 'afternoon';
    if (dayTime < 12000) return 'sunset';
    if (dayTime < 13000) return 'dusk';
    if (dayTime < 18000) return 'night';
    return 'dawn';
  }
}

export { CircadianEvents };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/core/circadianEvents.test.js
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/core/circadianEvents.js tests/unit/core/circadianEvents.test.js
git commit -m "feat(core): add circadian events

- Implement day/night cycle detection
- Add nightfall/daybreak/sunset/sunrise events
- Add time phase tracking
- Add tests"
```

---

## Task 6: Autonomy Layer Integration

**Files:**
- Create: `src/autonomy/index.js`
- Create: `tests/integration/autonomy.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration/autonomy.test.js

import { CurriculumManager, CURRICULUM_PHASES } from '../../src/autonomy/curriculum.js';
import { IdleLoop } from '../../src/autonomy/idle.js';
import { TaskScheduler, DEFAULT_SCHEDULED_TASKS } from '../../src/autonomy/scheduler.js';
import { SurvivalMonitor } from '../../src/autonomy/survival.js';

describe('Autonomy Layer Integration', () => {
  describe('CurriculumManager', () => {
    it('should progress through phases', () => {
      const mockState = {
        getVitals: () => ({ health: 20, food: 20 }),
        hasShelter: () => true,
        getInventory: () => [
          { name: 'wooden_pickaxe', count: 1 },
          { name: 'wooden_axe', count: 1 }
        ]
      };

      const curriculum = new CurriculumManager(mockState, null);
      curriculum.updateProgress();

      expect(curriculum.getCurrentPhase()).toBe('gathering');
    });
  });

  describe('TaskScheduler', () => {
    it('should load default tasks', () => {
      const scheduler = new TaskScheduler({}, {});

      scheduler.loadFromConfig({});

      expect(scheduler.tasks.length).toBe(DEFAULT_SCHEDULED_TASKS.length);
    });
  });

  describe('SurvivalMonitor', () => {
    it('should prioritize survival', async () => {
      const mockBot = {
        health: 5,
        food: 20,
        entities: {},
        entity: { position: { x: 0, y: 64, z: 0 } }
      };

      const survival = new SurvivalMonitor(mockBot, {}, {});

      const result = await survival.check();

      expect(result.skill).toBe('regenerate');
      expect(result.priority).toBe(10);
    });
  });

  describe('IdleLoop Priority', () => {
    it('should check survival before curriculum', async () => {
      const mockCurriculum = {
        getNextGoal: jest.fn().mockReturnValue({ skill: 'mine_stone' })
      };

      const mockScheduler = {
        getNextTask: jest.fn().mockReturnValue(null)
      };

      const mockSurvival = {
        check: jest.fn().mockResolvedValue({ skill: 'find_food', priority: 10 })
      };

      const mockState = {
        isBusy: jest.fn().mockReturnValue(false),
        lastActivity: Date.now() - 60000
      };

      const idleLoop = new IdleLoop(
        mockCurriculum,
        mockScheduler,
        mockSurvival,
        mockState,
        { idleTimeout: 0 }
      );

      await idleLoop.tick();

      // Should call survival first
      expect(mockSurvival.check).toHaveBeenCalled();
      // Should NOT call curriculum (survival returned goal)
      expect(mockCurriculum.getNextGoal).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Create autonomy index**

```javascript
// src/autonomy/index.js

export { CurriculumManager, CURRICULUM_PHASES } from './curriculum.js';
export { IdleLoop } from './idle.js';
export { TaskScheduler, DEFAULT_SCHEDULED_TASKS } from './scheduler.js';
export { SurvivalMonitor, HOSTILE_MOBS } from './survival.js';
```

- [ ] **Step 3: Run integration test**

```bash
npm test -- tests/integration/autonomy.test.js
# Expected: PASS
```

- [ ] **Step 4: Final commit for Autonomy Layer**

```bash
git add src/autonomy/index.js tests/integration/autonomy.test.js
git commit -m "test(autonomy): add integration tests

- Test curriculum phase progression
- Test scheduler default tasks
- Test survival prioritization
- Test idle loop priority order"
```

---

## Completion Checklist

- [ ] All tests passing
- [ ] All files created
- [ ] All commits made
- [ ] No linting errors (`npm run lint`)
- [ ] Integration test passes

---

**Next Plan:** [07-community-layer.md](./2026-03-29-07-community-layer.md)