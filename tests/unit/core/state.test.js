import { jest } from '@jest/globals';
import { StateManager } from '../../../src/core/state.js';

describe('StateManager', () => {
  let state;
  let mockBot;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      health: 20,
      food: 20,
      inventory: { items: () => [] }
    };
    state = new StateManager(mockBot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('setTask', () => {
    it('should set current task', () => {
      state.setTask({ type: 'mining', args: { block: 'stone' } });
      expect(state.currentTask).toBeDefined();
      expect(state.currentTask.type).toBe('mining');
    });

    it('should set timeout for task', () => {
      state.setTask({ type: 'mining' }, 30000);
      expect(state.taskTimeout).toBeDefined();
    });

    it('should emit taskStarted event', () => {
      const listener = jest.fn();
      state.on('taskStarted', listener);
      state.setTask({ type: 'mining' });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'mining' }));
    });

    it('should clear existing task when setting new task', () => {
      state.setTask({ type: 'mining' });
      const firstTask = state.currentTask;
      state.setTask({ type: 'crafting' });
      expect(state.currentTask.type).toBe('crafting');
      expect(state.currentTask).not.toBe(firstTask);
    });
  });

  describe('clearTask', () => {
    it('should clear current task', () => {
      state.setTask({ type: 'mining' });
      state.clearTask();
      expect(state.currentTask).toBeNull();
      expect(state.taskTimeout).toBeNull();
    });

    it('should emit taskCleared event', () => {
      state.setTask({ type: 'mining' });
      const listener = jest.fn();
      state.on('taskCleared', listener);
      state.clearTask();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('isBusy', () => {
    it('should return true when task is set', () => {
      state.setTask({ type: 'mining' });
      expect(state.isBusy()).toBe(true);
    });

    it('should return false when no task', () => {
      expect(state.isBusy()).toBe(false);
    });
  });

  describe('checkTimeout', () => {
    it('should clear task when timeout exceeded', () => {
      jest.useFakeTimers();
      state.setTask({ type: 'mining' }, 1000);

      jest.advanceTimersByTime(1100);
      state.checkTimeout();

      expect(state.currentTask).toBeNull();
    });

    it('should not clear task when timeout not exceeded', () => {
      jest.useFakeTimers();
      state.setTask({ type: 'mining' }, 1000);

      jest.advanceTimersByTime(500);
      const result = state.checkTimeout();

      expect(result).toBe(false);
      expect(state.currentTask).not.toBeNull();
    });
  });

  describe('getInventory', () => {
    it('should return inventory items', () => {
      mockBot.inventory.items = () => [
        { name: 'stone', count: 64, slot: 0 }
      ];

      const items = state.getInventory();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('stone');
      expect(items[0].count).toBe(64);
    });

    it('should return empty array when no inventory', () => {
      mockBot.inventory.items = () => [];
      const items = state.getInventory();
      expect(items).toHaveLength(0);
    });

    it('should return empty array when bot has no inventory', () => {
      const stateNoBot = new StateManager(null);
      const items = stateNoBot.getInventory();
      expect(items).toEqual([]);
    });
  });

  describe('getPosition', () => {
    it('should return current position', () => {
      const pos = state.getPosition();
      expect(pos).toEqual({ x: 0, y: 64, z: 0 });
    });

    it('should return null when no bot', () => {
      const stateNoBot = new StateManager(null);
      expect(stateNoBot.getPosition()).toBeNull();
    });
  });

  describe('getVitals', () => {
    it('should return health and food', () => {
      const vitals = state.getVitals();
      expect(vitals).toEqual({ health: 20, food: 20 });
    });

    it('should return default values when no bot', () => {
      const stateNoBot = new StateManager(null);
      const vitals = stateNoBot.getVitals();
      expect(vitals).toEqual({ health: 20, food: 20 });
    });
  });

  describe('setFollowing', () => {
    it('should set following target', () => {
      state.setFollowing('PlayerName');
      expect(state.following).toBe('PlayerName');
    });

    it('should emit following event', () => {
      const listener = jest.fn();
      state.on('following', listener);
      state.setFollowing('PlayerName');
      expect(listener).toHaveBeenCalledWith('PlayerName');
    });
  });

  describe('clearFollowing', () => {
    it('should clear following', () => {
      state.setFollowing('PlayerName');
      state.clearFollowing();
      expect(state.following).toBeNull();
    });

    it('should emit stoppedFollowing event', () => {
      state.setFollowing('PlayerName');
      const listener = jest.fn();
      state.on('stoppedFollowing', listener);
      state.clearFollowing();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('handleDeath', () => {
    it('should save current task as pending', () => {
      state.setTask({ type: 'mining' });
      state.handleDeath();
      expect(state.pendingTask).not.toBeNull();
      expect(state.pendingTask.type).toBe('mining');
    });

    it('should clear current task on death', () => {
      state.setTask({ type: 'mining' });
      state.handleDeath();
      expect(state.currentTask).toBeNull();
    });

    it('should emit death event', () => {
      const listener = jest.fn();
      state.on('death', listener);
      state.handleDeath();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('should export state for checkpoint', () => {
      state.setTask({ type: 'mining' });
      state.setFollowing('Player');
      const exported = state.export();

      expect(exported.currentTask).toBeDefined();
      expect(exported.following).toBe('Player');
      expect(exported.position).toBeDefined();
      expect(exported.vitals).toBeDefined();
      expect(exported.inventory).toBeDefined();
      expect(exported.curriculumPhase).toBe('survival');
      expect(Array.isArray(exported.learnedSkills)).toBe(true);
    });
  });

  describe('import', () => {
    it('should import state from checkpoint', () => {
      const data = {
        currentTask: { type: 'crafting', started: 1000 },
        following: 'OtherPlayer',
        lastPosition: { x: 100, y: 64, z: 200 },
        curriculumPhase: 'gathering',
        learnedSkills: ['mining', 'crafting']
      };

      state.import(data);

      expect(state.pendingTask.type).toBe('crafting');
      expect(state.following).toBe('OtherPlayer');
      expect(state.lastPosition).toEqual({ x: 100, y: 64, z: 200 });
      expect(state.curriculumPhase).toBe('gathering');
      expect(state.learnedSkills.has('mining')).toBe(true);
      expect(state.learnedSkills.has('crafting')).toBe(true);
    });

    it('should handle partial import', () => {
      state.import({ following: 'TestPlayer' });
      expect(state.following).toBe('TestPlayer');
    });
  });
});