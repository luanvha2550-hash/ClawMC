// tests/unit/llm/prompts.test.js

import { jest } from '@jest/globals';
import { PromptTemplates } from '../../../src/llm/prompts.js';
import { SemanticSnapshot } from '../../../src/llm/snapshots.js';

describe('PromptTemplates', () => {
  let templates;

  beforeEach(() => {
    templates = new PromptTemplates();
  });

  describe('chatSystem', () => {
    it('should return system prompt for chat', () => {
      const prompt = templates.chatSystem;

      expect(prompt).toContain('assistente');
      expect(prompt.length).toBeLessThan(2000);
    });
  });

  describe('codeSystem', () => {
    it('should include API documentation', () => {
      const prompt = templates.codeSystem;

      expect(prompt).toContain('bot.pathfinder');
      expect(prompt).toContain('bot.dig');
    });

    it('should include restrictions', () => {
      const prompt = templates.codeSystem;

      expect(prompt).toContain('NÃO use require');
      expect(prompt).toContain('NÃO acesse filesystem');
    });
  });

  describe('buildCodePrompt', () => {
    it('should build prompt with context', () => {
      const prompt = templates.buildCodePrompt('mine iron', {
        position: { x: 100, y: 64, z: -200 }
      });

      expect(prompt).toContain('mine iron');
      expect(prompt).toContain('100');
    });
  });
});

describe('SemanticSnapshot', () => {
  let snapshot;
  let mockBot;
  let mockState;

  beforeEach(() => {
    mockBot = {
      entity: { position: { x: 0, y: 64, z: 0 } },
      game: { dimension: 'minecraft:overworld' },
      time: { day: 1000 },
      health: 20,
      food: 20,
      inventory: { items: () => [{ name: 'stone', count: 64 }] },
      entities: {},
      players: {}
    };

    mockState = {
      currentTask: null,
      getInventory: () => [{ name: 'stone', count: 64 }],
      getPosition: () => ({ x: 0, y: 64, z: 0 }),
      getVitals: () => ({ health: 20, food: 20 })
    };

    snapshot = new SemanticSnapshot(mockBot, mockState);
  });

  describe('generate', () => {
    it('should generate compact snapshot', () => {
      const snap = snapshot.generate();

      expect(snap.position).toBeDefined();
      expect(snap.health).toBe(20);
      expect(snap.food).toBe(20);
    });

    it('should include inventory', () => {
      const snap = snapshot.generate();

      expect(snap.inventory).toContain('stone:64');
    });
  });

  describe('formatForPrompt', () => {
    it('should format for LLM', () => {
      const formatted = snapshot.formatForPrompt();

      expect(formatted).toContain('ESTADO ATUAL');
      expect(formatted).toContain('Vida');
      expect(formatted).toContain('Fome');
    });
  });
});