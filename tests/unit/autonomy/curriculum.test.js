// tests/unit/autonomy/curriculum.test.js

import { jest } from '@jest/globals';
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
      getVitals: jest.fn().mockReturnValue({ health: 20, food: 20 }),
      learnedSkills: new Set()
    };

    mockMemory = {
      getFacts: jest.fn().mockReturnValue([])
    };

    curriculum = new CurriculumManager(mockState, mockMemory);
  });

  describe('getCurrentPhase', () => {
    it('should return survival for new bot', () => {
      mockState.getVitals.mockReturnValue({ health: 10, food: 10 });
      mockState.hasShelter.mockReturnValue(false);

      const phase = curriculum.getCurrentPhase();
      expect(phase).toBe('survival');
    });

    it('should progress to gathering after survival', () => {
      mockState.hasShelter.mockReturnValue(true);
      mockState.getVitals.mockReturnValue({ health: 20, food: 20 });
      mockState.getInventory.mockReturnValue([
        { name: 'wooden_pickaxe', count: 1 },
        { name: 'wooden_axe', count: 1 },
        { name: 'wood', count: 32 }
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

  describe('updateProgress', () => {
    it('should calculate phase progress', () => {
      mockState.getVitals.mockReturnValue({ health: 20, food: 20 });
      mockState.hasShelter.mockReturnValue(true);
      mockState.getInventory.mockReturnValue([
        { name: 'wooden_pickaxe', count: 1 },
        { name: 'wooden_axe', count: 1 }
      ]);

      curriculum.updateProgress();

      expect(curriculum.phaseProgress.survival).toBeGreaterThan(0.5);
    });
  });

  describe('setTimeOfDay', () => {
    it('should track day count on nightfall', () => {
      curriculum.timeOfDay = 0; // Dawn
      curriculum.dayCount = 0;

      curriculum.setTimeOfDay(13000); // Night

      expect(curriculum.dayCount).toBe(1);
    });
  });

  describe('export/import', () => {
    it('should export and import state', () => {
      curriculum.markLearned('mine_iron');
      curriculum.currentPhase = 'gathering';

      const exported = curriculum.export();

      const newCurriculum = new CurriculumManager(mockState, mockMemory);
      newCurriculum.import(exported);

      expect(newCurriculum.learnedSkills.has('mine_iron')).toBe(true);
      expect(newCurriculum.currentPhase).toBe('gathering');
    });
  });
});