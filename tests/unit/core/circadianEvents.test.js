// tests/unit/core/circadianEvents.test.js

import { jest } from '@jest/globals';
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

  describe('getTimeInfo', () => {
    it('should return time info', () => {
      mockBot.time.timeOfDay = 5000;

      const info = circadian.getTimeInfo();

      expect(info.dayTime).toBe(5000);
      expect(info.isDay).toBe(true);
      expect(info.phase).toBeDefined();
    });
  });

  describe('getPhase', () => {
    it('should return correct phase', () => {
      expect(circadian.getPhase(500)).toBe('sunrise');
      expect(circadian.getPhase(3000)).toBe('morning');
      expect(circadian.getPhase(8000)).toBe('afternoon');
      expect(circadian.getPhase(11500)).toBe('sunset');
      expect(circadian.getPhase(12500)).toBe('dusk');
      expect(circadian.getPhase(15000)).toBe('night');
      expect(circadian.getPhase(22000)).toBe('dawn');
    });
  });
});