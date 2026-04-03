// tests/integration/autonomy.test.js

import { jest } from '@jest/globals';
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
          { name: 'wooden_axe', count: 1 },
          { name: 'wood', count: 32 }
        ]
      };

      const curriculum = new CurriculumManager(mockState, null);
      curriculum.updateProgress();

      expect(curriculum.getCurrentPhase()).toBe('gathering');
    });

    it('should export CURRICULUM_PHASES', () => {
      expect(CURRICULUM_PHASES).toBeDefined();
      expect(CURRICULUM_PHASES.survival).toBeDefined();
      expect(CURRICULUM_PHASES.gathering).toBeDefined();
    });
  });

  describe('TaskScheduler', () => {
    it('should load default tasks', () => {
      const scheduler = new TaskScheduler({}, {});

      scheduler.loadFromConfig({});

      expect(scheduler.tasks.length).toBe(DEFAULT_SCHEDULED_TASKS.length);
    });

    it('should export DEFAULT_SCHEDULED_TASKS', () => {
      expect(DEFAULT_SCHEDULED_TASKS).toBeDefined();
      expect(DEFAULT_SCHEDULED_TASKS.length).toBeGreaterThan(0);
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
        setTask: jest.fn(),
        clearTask: jest.fn()
      };

      const idleLoop = new IdleLoop(
        mockCurriculum,
        mockScheduler,
        mockSurvival,
        mockState,
        { idleTimeout: 0 }
      );

      // Force idle state
      idleLoop.lastActivity = Date.now() - 60000;

      await idleLoop.tick();

      // Should call survival first
      expect(mockSurvival.check).toHaveBeenCalled();
      // Should NOT call curriculum (survival returned goal)
      expect(mockCurriculum.getNextGoal).not.toHaveBeenCalled();
    });
  });

  describe('Module Exports', () => {
    it('should export all components', async () => {
      const autonomy = await import('../../src/autonomy/index.js');

      expect(autonomy.CurriculumManager).toBeDefined();
      expect(autonomy.CURRICULUM_PHASES).toBeDefined();
      expect(autonomy.IdleLoop).toBeDefined();
      expect(autonomy.TaskScheduler).toBeDefined();
      expect(autonomy.DEFAULT_SCHEDULED_TASKS).toBeDefined();
      expect(autonomy.SurvivalMonitor).toBeDefined();
      expect(autonomy.HOSTILE_MOBS).toBeDefined();
    });
  });
});