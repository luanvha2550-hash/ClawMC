// tests/unit/autonomy/idle.test.js

import { jest } from '@jest/globals';
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
      idleLoop.idleTimeout = 0; // Force immediate action

      await idleLoop.tick();

      expect(mockSurvival.check).toHaveBeenCalled();
    });

    it('should check scheduled tasks second', async () => {
      mockScheduler.getNextTask.mockReturnValue({
        name: 'patrol_base'
      });
      idleLoop.idleTimeout = 0; // Force immediate action

      await idleLoop.tick();

      expect(mockScheduler.getNextTask).toHaveBeenCalled();
    });

    it('should check curriculum goals last', async () => {
      mockCurriculum.getNextGoal.mockReturnValue({
        skill: 'mine_stone'
      });
      idleLoop.idleTimeout = 0; // Force immediate action

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
      idleLoop.lastActivity = Date.now(); // Just now

      expect(idleLoop.shouldAct()).toBe(false);
    });

    it('should return true when idle and time met', () => {
      mockState.isBusy.mockReturnValue(false);
      idleLoop.lastActivity = Date.now() - 60000; // 1 minute ago

      expect(idleLoop.shouldAct()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return idle loop status', () => {
      const status = idleLoop.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('idleTime');
      expect(status).toHaveProperty('idleTimeout');
    });
  });

  describe('start/stop', () => {
    it('should start and stop idle loop', () => {
      idleLoop.start(1000);
      expect(idleLoop.isRunning).toBe(true);

      idleLoop.stop();
      expect(idleLoop.isRunning).toBe(false);
    });
  });
});