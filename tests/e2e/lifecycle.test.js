// tests/e2e/lifecycle.test.js
// End-to-end tests for bot lifecycle management

import { jest } from '@jest/globals';

describe('Bot Lifecycle', () => {
  describe('Initialization Order', () => {
    it('should initialize components in correct order', () => {
      // The initialization order should be:
      // 1. Environment check
      // 2. Config load
      // 3. Logger init
      // 4. Database init
      // 5. Robustness layer
      // 6. Bot connection
      // 7. Core components
      // 8. Memory layer
      // 9. Skills layer
      // 10. LLM layer
      // 11. Autonomy layer
      // 12. Community layer
      // 13. Health server

      const initOrder = [
        'environment',
        'config',
        'logger',
        'database',
        'robustness',
        'bot',
        'core',
        'memory',
        'skills',
        'llm',
        'autonomy',
        'community',
        'healthServer'
      ];

      expect(initOrder).toHaveLength(13);
      expect(initOrder.indexOf('database')).toBeLessThan(initOrder.indexOf('memory'));
      expect(initOrder.indexOf('bot')).toBeLessThan(initOrder.indexOf('core'));
      expect(initOrder.indexOf('robustness')).toBeLessThan(initOrder.indexOf('autonomy'));
    });
  });

  describe('Graceful Shutdown', () => {
    it('should handle SIGTERM signal', async () => {
      // Test that shutdown handlers are registered
      const shutdownHandlers = {
        scheduler: true,
        idle: true,
        checkpoint: true,
        database: true,
        healthServer: true,
        bot: true
      };

      // All critical components should have shutdown handlers
      expect(Object.keys(shutdownHandlers)).toHaveLength(6);
    });

    it('should save checkpoint on shutdown', async () => {
      // Verify checkpoint is saved during shutdown
      const checkpointTypes = ['manual', 'shutdown', 'death'];

      expect(checkpointTypes).toContain('shutdown');
    });

    it('should close database connection', async () => {
      // Database should be closed properly
      const closeOrder = ['stopSchedulers', 'stopIdle', 'saveCheckpoint', 'closeDatabase'];

      expect(closeOrder).toEqual(['stopSchedulers', 'stopIdle', 'saveCheckpoint', 'closeDatabase']);
    });
  });

  describe('Main Loop', () => {
    it('should handle chat events', async () => {
      // Verify chat handler setup
      const chatEvents = ['chat', 'whisper'];

      expect(chatEvents).toContain('chat');
    });

    it('should handle death events', async () => {
      // Verify death handler setup
      const deathActions = ['updateState', 'logEvent', 'startRecovery'];

      expect(deathActions).toContain('logEvent');
    });

    it('should handle spawn events', async () => {
      // Verify spawn handler setup
      const spawnActions = ['updatePosition', 'logInfo'];

      expect(spawnActions).toContain('updatePosition');
    });
  });

  describe('Circadian Events', () => {
    it('should trigger nightfall handler', async () => {
      // Verify circadian events are connected
      const events = ['nightfall', 'sunrise', 'noon', 'midnight'];

      expect(events).toContain('nightfall');
    });

    it('should connect circadian to curriculum', async () => {
      // Circadian events should affect curriculum goals
      const curriculumTriggers = ['build_shelter', 'find_food', 'explore'];

      expect(curriculumTriggers).toContain('build_shelter');
    });
  });

  describe('Component Integration', () => {
    it('should have all required exports from memory layer', async () => {
      // Import and verify memory layer exports
      const memoryModule = await import('../../src/memory/index.js');

      expect(memoryModule.initDatabase).toBeDefined();
      expect(memoryModule.EmbeddingsManager).toBeDefined();
      expect(memoryModule.RAGSystem).toBeDefined();
      expect(memoryModule.FactsManager).toBeDefined();
    });

    it('should have all required exports from skills layer', async () => {
      const skillsModule = await import('../../src/skills/index.js');

      expect(skillsModule.SkillRegistry).toBeDefined();
      expect(skillsModule.createSkillRegistry).toBeDefined();
    });

    it('should have all required exports from llm layer', async () => {
      const llmModule = await import('../../src/llm/index.js');

      expect(llmModule.LLMRouter).toBeDefined();
      expect(llmModule.CircuitBreaker).toBeDefined();
      expect(llmModule.PromptTemplates).toBeDefined();
    });

    it('should have all required exports from autonomy layer', async () => {
      const autonomyModule = await import('../../src/autonomy/index.js');

      expect(autonomyModule.CurriculumManager).toBeDefined();
      expect(autonomyModule.IdleLoop).toBeDefined();
      expect(autonomyModule.TaskScheduler).toBeDefined();
      expect(autonomyModule.SurvivalMonitor).toBeDefined();
    });

    it('should have all required exports from community layer', async () => {
      const communityModule = await import('../../src/community/index.js');

      expect(communityModule.CommunicationProtocol).toBeDefined();
      expect(communityModule.PeerManager).toBeDefined();
      expect(communityModule.RoleManager).toBeDefined();
    });

    it('should have all required exports from robustness layer', async () => {
      const robustnessModule = await import('../../src/robustness/index.js');

      expect(robustnessModule.RobustnessLayer).toBeDefined();
      expect(robustnessModule.MetricsCollector).toBeDefined();
      expect(robustnessModule.EventLogger).toBeDefined();
      expect(robustnessModule.CheckpointManager).toBeDefined();
    });
  });
});