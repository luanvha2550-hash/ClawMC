// tests/unit/autonomy/survival.test.js

import { jest } from '@jest/globals';
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
      const botPos = { x: 0, y: 64, z: 0 };
      mockBot.entities = {
        1: { name: 'zombie', position: { x: 5, y: 64, z: 5, distanceTo: () => 8.66 } },
        2: { name: 'skeleton', position: { x: 7, y: 64, z: 7, distanceTo: () => 9.9 } },
        3: { name: 'creeper', position: { x: 3, y: 64, z: 3, distanceTo: () => 4.24 } },
        4: { name: 'spider', position: { x: 4, y: 64, z: 4, distanceTo: () => 5.66 } }
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
        1: { name: 'zombie', position: { x: 5, y: 64, z: 5, distanceTo: () => 8.66 } },
        2: { name: 'cow', position: { x: 10, y: 64, z: 10, distanceTo: () => 14.14 } },
        3: { name: 'skeleton', position: { x: 15, y: 64, z: 15, distanceTo: () => 18 } }
      };

      const count = survival.countHostileMobs(20);

      expect(count).toBe(2);
    });

    it('should return 0 when no hostiles', () => {
      mockBot.entities = {
        1: { name: 'cow', position: { x: 5, y: 64, z: 5, distanceTo: () => 7.07 } },
        2: { name: 'pig', position: { x: 10, y: 64, z: 10, distanceTo: () => 14.14 } }
      };

      const count = survival.countHostileMobs(20);

      expect(count).toBe(0);
    });
  });

  describe('isSafe', () => {
    it('should return true when safe', () => {
      expect(survival.isSafe()).toBe(true);
    });

    it('should return false when hungry', () => {
      mockBot.food = 5;
      mockState.getVitals.mockReturnValue({ health: 20, food: 5 });

      expect(survival.isSafe()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return survival status', () => {
      const status = survival.getStatus();

      expect(status.health).toBe(20);
      expect(status.food).toBe(20);
      expect(status.isSafe).toBe(true);
    });
  });

  describe('getAlerts', () => {
    it('should return empty array when safe', () => {
      const alerts = survival.getAlerts();

      expect(alerts).toHaveLength(0);
    });

    it('should return alerts when in danger', () => {
      mockBot.food = 5;
      mockState.getVitals.mockReturnValue({ health: 20, food: 5 });

      const alerts = survival.getAlerts();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('food');
    });
  });
});