// tests/unit/autonomy/scheduler.test.js

import { jest } from '@jest/globals';
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

    it('should return pending task', () => {
      scheduler.addTask({ name: 'test_task' });

      const task = scheduler.getNextTask();

      expect(task.name).toBe('test_task');
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

      expect(scheduler.tasks.length).toBe(2);
    });
  });

  describe('addTask', () => {
    it('should add ad-hoc task', () => {
      scheduler.addTask({ name: 'urgent_task' });

      expect(scheduler.pendingTasks.length).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return scheduler status', () => {
      scheduler.addTask({ name: 'test' });

      const status = scheduler.getStatus();

      expect(status.pendingCount).toBe(1);
    });
  });
});