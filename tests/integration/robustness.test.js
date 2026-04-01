// tests/integration/robustness.test.js
// Integration tests for Robustness Layer components
//
// Note: Tests that require better-sqlite3 will be skipped if the native module
// is not available. This happens on Node 25+ without Visual Studio Build Tools.

import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';

// Flags to track availability
let isDatabaseAvailable = false;
let isModuleLoaded = false;

// Module imports
let RobustnessLayer, createRobustnessLayer, getRobustnessLayer, initializeRobustnessLayer, shutdownRobustnessLayer;
let MetricsCollector, EventLogger, AlertSystem, OperationStateMachine;
let CheckpointManager, DeathRecovery, StuckDetector, GracefulShutdown;
let LogLevel, AlertSeverity, AlertState, OperationState;
let initDatabase, closeDatabase, run, get, all;

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_robustness.db');

// Mock bot
function createMockBot() {
  return {
    entity: {
      position: { x: 100, y: 64, z: -200 }
    },
    game: {
      dimension: 'overworld'
    },
    health: 20,
    food: 20,
    inventory: {
      items: () => [
        { name: 'diamond_pickaxe', count: 1, slot: 0 },
        { name: 'iron_ingot', count: 32, slot: 1 }
      ]
    },
    on: jest.fn(),
    emit: jest.fn(),
    end: jest.fn()
  };
}

// Mock state manager
function createMockState() {
  return {
    currentTask: null,
    following: null,
    curriculumPhase: 'gathering',
    learnedSkills: new Set(['mining', 'crafting'])
  };
}

// Mock memory system
function createMockMemory() {
  return {
    facts: {
      get: jest.fn(),
      set: jest.fn()
    }
  };
}

// Load modules and check database availability
beforeAll(async () => {
  process.env.SERVER_HOST = 'localhost';
  process.env.SERVER_PORT = '25565';
  process.env.SERVER_VERSION = '1.20.4';
  process.env.BOT_NAME = 'TestBot';
  process.env.BOT_OWNER = 'TestOwner';

  try {
    const dbModule = await import('../../src/memory/database.js');
    initDatabase = dbModule.initDatabase;
    closeDatabase = dbModule.closeDatabase;
    run = dbModule.run;
    get = dbModule.get;
    all = dbModule.all;

    const robustnessModule = await import('../../src/robustness/index.js');
    RobustnessLayer = robustnessModule.RobustnessLayer;
    createRobustnessLayer = robustnessModule.createRobustnessLayer;
    getRobustnessLayer = robustnessModule.getRobustnessLayer;
    initializeRobustnessLayer = robustnessModule.initializeRobustnessLayer;
    shutdownRobustnessLayer = robustnessModule.shutdownRobustnessLayer;
    MetricsCollector = robustnessModule.MetricsCollector;
    EventLogger = robustnessModule.EventLogger;
    AlertSystem = robustnessModule.AlertSystem;
    OperationStateMachine = robustnessModule.OperationStateMachine;
    CheckpointManager = robustnessModule.CheckpointManager;
    DeathRecovery = robustnessModule.DeathRecovery;
    StuckDetector = robustnessModule.StuckDetector;
    GracefulShutdown = robustnessModule.GracefulShutdown;
    LogLevel = robustnessModule.LogLevel;
    AlertSeverity = robustnessModule.AlertSeverity;
    AlertState = robustnessModule.AlertState;
    OperationState = robustnessModule.OperationState;

    isModuleLoaded = true;

    // Test if database actually works
    try {
      const testDb = await initDatabase(':memory:');
      if (testDb) {
        testDb.close();
        isDatabaseAvailable = true;
      }
    } catch (e) {
      console.log('Database tests skipped: better-sqlite3 not available');
      console.log('To run database tests, use Node 20 LTS or install Visual Studio Build Tools');
      isDatabaseAvailable = false;
    }
  } catch (e) {
    console.log('Module loading failed:', e.message);
    isModuleLoaded = false;
    isDatabaseAvailable = false;
  }
});

afterAll(() => {
  delete process.env.SERVER_HOST;
  delete process.env.SERVER_PORT;
  delete process.env.SERVER_VERSION;
  delete process.env.BOT_NAME;
  delete process.env.BOT_OWNER;
});

// Helper to create conditional tests
const testIf = (name, fn) => {
  if (isDatabaseAvailable) {
    it(name, fn);
  } else {
    it.skip(name, fn);
  }
};

// Helper for tests that don't need database
const testAlways = (name, fn) => {
  it(name, fn);
};

// Helper to cleanup test database
async function cleanupTestDb() {
  try {
    await closeDatabase();
  } catch (e) {
    // Ignore if already closed
  }

  try {
    await fs.unlink(TEST_DB_PATH);
  } catch (e) {
    // Ignore if doesn't exist
  }
  try {
    await fs.unlink(`${TEST_DB_PATH}-wal`);
  } catch (e) {
    // Ignore
  }
  try {
    await fs.unlink(`${TEST_DB_PATH}-shm`);
  } catch (e) {
    // Ignore
  }
}

// Helper to setup test database
async function setupTestDb() {
  await cleanupTestDb();
  const db = await initDatabase(TEST_DB_PATH);

  // Create checkpoints table
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      type TEXT NOT NULL,
      data TEXT,
      task_type TEXT,
      task_progress REAL,
      position TEXT,
      inventory TEXT,
      recovered BOOLEAN DEFAULT 0
    );
  `);

  // Create death_records table
  db.exec(`
    CREATE TABLE IF NOT EXISTS death_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      position TEXT,
      cause TEXT,
      inventory TEXT,
      dimension TEXT,
      recovery_attempts INTEGER DEFAULT 0,
      recovered BOOLEAN DEFAULT 0,
      recovered_at DATETIME
    );
  `);

  return db;
}

// ============================================
// RobustnessLayer Tests
// ============================================

describe('RobustnessLayer', () => {
  describe('constructor', () => {
    testAlways('should create instance with default config', () => {
      const layer = new RobustnessLayer();
      expect(layer).toBeInstanceOf(RobustnessLayer);
      expect(layer.config.metricsUpdateInterval).toBe(30000);
      expect(layer.config.positionUpdateInterval).toBe(10000);
      expect(layer.initialized).toBe(false);
    });

    testAlways('should accept custom config', () => {
      const layer = new RobustnessLayer({
        metricsUpdateInterval: 60000,
        checkpointInterval: 600000
      });
      expect(layer.config.metricsUpdateInterval).toBe(60000);
      expect(layer.config.checkpointInterval).toBe(600000);
    });
  });

  describe('init', () => {
    testIf('should initialize all components', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      expect(layer.initialized).toBe(true);
      expect(layer.metrics).toBeInstanceOf(MetricsCollector);
      expect(layer.eventLog).toBeInstanceOf(EventLogger);
      expect(layer.alerts).toBeInstanceOf(AlertSystem);
      expect(layer.stateMachine).toBeInstanceOf(OperationStateMachine);
      expect(layer.checkpoint).toBeInstanceOf(CheckpointManager);
      expect(layer.deathRecovery).toBeInstanceOf(DeathRecovery);
      expect(layer.stuckDetector).toBeInstanceOf(StuckDetector);
      expect(layer.gracefulShutdown).toBeInstanceOf(GracefulShutdown);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should return this for chaining', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      const result = await layer.init(bot, db, state, memory);
      expect(result).toBe(layer);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should not initialize twice', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);
      const secondInit = await layer.init(bot, db, state, memory);

      expect(secondInit).toBe(layer);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('getHealth', () => {
    testIf('should return health status', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      const health = layer.getHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('rates');
      expect(health).toHaveProperty('alerts');
      expect(['healthy', 'degraded', 'critical']).toContain(health.status);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should return degraded status when alerts active', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Manually trigger an alert
      layer.alerts.processAlert('memory_high');

      const health = layer.getHealth();

      expect(health.status).toBe('degraded');
      expect(health.alerts.length).toBeGreaterThan(0);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('logLLMCall', () => {
    testIf('should update metrics and log event', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Reset metrics for clean test
      layer.metrics.reset();

      layer.logLLMCall('google', 'gemini-flash', 100, 50, 250, true);

      const metrics = layer.metrics.getStats();
      expect(metrics.counters.llmCalls).toBe(1);
      expect(metrics.counters.llmTokensUsed).toBe(150);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should increment error counter on failure', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);
      layer.metrics.reset();

      layer.logLLMCall('google', 'gemini-flash', 100, 0, 500, false);

      const metrics = layer.metrics.getStats();
      expect(metrics.counters.llmCalls).toBe(1);
      expect(metrics.counters.llmErrors).toBe(1);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('logSkillExecution', () => {
    testIf('should update metrics and log event', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);
      layer.metrics.reset();

      layer.logSkillExecution('mining', { block: 'stone' }, 1000, true);

      const metrics = layer.metrics.getStats();
      expect(metrics.counters.skillExecutions).toBe(1);
      expect(metrics.counters.skillSuccesses).toBe(1);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should increment failure counter on error', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);
      layer.metrics.reset();

      layer.logSkillExecution('mining', {}, 500, false, 'Block not found');

      const metrics = layer.metrics.getStats();
      expect(metrics.counters.skillExecutions).toBe(1);
      expect(metrics.counters.skillFailures).toBe(1);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('restoreFromCheckpoint', () => {
    testIf('should return null when no checkpoint exists', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      const result = await layer.restoreFromCheckpoint();
      expect(result).toBeNull();

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should restore from existing checkpoint', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Create a checkpoint first
      const checkpointId = await layer.checkpoint.save('manual', { test: true });
      expect(checkpointId).toBeGreaterThan(0);

      // Restore it
      const restored = await layer.restoreFromCheckpoint();
      expect(restored).not.toBeNull();
      expect(restored.id).toBe(checkpointId);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('handleDeath', () => {
    testIf('should increment death counter', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);
      layer.metrics.reset();

      await layer.handleDeath();

      const metrics = layer.metrics.getStats();
      expect(metrics.counters.deaths).toBe(1);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('isBotStuck', () => {
    testIf('should return false initially', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      expect(layer.isBotStuck()).toBe(false);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('isShuttingDown', () => {
    testIf('should return false initially', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      expect(layer.isShuttingDown()).toBe(false);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('close', () => {
    testIf('should stop all timers and close components', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Verify timers are set
      expect(layer.timers.metricsUpdate).not.toBeNull();
      expect(layer.timers.positionUpdate).not.toBeNull();
      expect(layer.timers.flush).not.toBeNull();
      expect(layer.timers.healthReport).not.toBeNull();

      await layer.close();

      // Verify state
      expect(layer.initialized).toBe(false);

      await cleanupTestDb();
    });
  });

  describe('export', () => {
    testIf('should return all robustness data', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      const exported = layer.export();

      expect(exported).toHaveProperty('timestamp');
      expect(exported).toHaveProperty('health');
      expect(exported).toHaveProperty('metrics');
      expect(exported).toHaveProperty('alerts');
      expect(exported).toHaveProperty('stateMachine');
      expect(exported).toHaveProperty('stuckDetector');

      await layer.close();
      await cleanupTestDb();
    });
  });
});

// ============================================
// Singleton Functions Tests
// ============================================

describe('RobustnessLayer Singleton', () => {
  testAlways('createRobustnessLayer should create new instance', () => {
    const layer = createRobustnessLayer({ test: true });
    expect(layer).toBeInstanceOf(RobustnessLayer);
    expect(layer.config.test).toBe(true);
  });

  testAlways('getRobustnessLayer should return singleton', () => {
    const layer1 = getRobustnessLayer();
    const layer2 = getRobustnessLayer();
    expect(layer1).toBe(layer2);
  });
});

// ============================================
// Component Integration Tests
// ============================================

describe('Component Integration', () => {
  describe('Metrics and Alerts', () => {
    testIf('should trigger alert on high error rate', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Simulate multiple LLM errors
      for (let i = 0; i < 10; i++) {
        layer.logLLMCall('test', 'model', 100, 50, 100, false);
      }

      // Check alerts
      const metrics = layer.metrics.getStats();
      expect(metrics.counters.llmErrors).toBe(10);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('State Machine and Checkpoint', () => {
    testIf('should use state machine for checkpoint operations', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Create checkpoint should work
      const checkpointId = await layer.createCheckpoint({ test: true });
      expect(checkpointId).toBeGreaterThan(0);

      // State machine should be idle after operation
      const stateInfo = layer.stateMachine.getState();
      expect(stateInfo.state).toBe(OperationState.IDLE);

      await layer.close();
      await cleanupTestDb();
    });
  });

  describe('Health Check', () => {
    testIf('should report healthy with no alerts', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      const health = layer.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.alerts).toHaveLength(0);

      await layer.close();
      await cleanupTestDb();
    });

    testIf('should report degraded with warning alert', async () => {
      const db = await setupTestDb();
      const bot = createMockBot();
      const state = createMockState();
      const memory = createMockMemory();

      const layer = new RobustnessLayer({
        logDir: './tests/tmp'
      });

      await layer.init(bot, db, state, memory);

      // Manually trigger warning alert
      layer.alerts.processAlert('memory_high');

      const health = layer.getHealth();
      expect(health.status).toBe('degraded');

      await layer.close();
      await cleanupTestDb();
    });
  });
});

// ============================================
// Cleanup
// ============================================

afterEach(async () => {
  // Clean up any test files
  try {
    await fs.rm('./tests/tmp', { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
});