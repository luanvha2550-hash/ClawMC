// tests/unit/utils/healthServer.test.js

import { jest } from '@jest/globals';
import { HealthServer } from '../../../src/utils/healthServer.js';

describe('HealthServer', () => {
  let healthServer;
  let mockComponents;

  beforeEach(() => {
    mockComponents = {
      bot: {
        entity: { position: { x: 0, y: 64, z: 0 } },
        health: 20,
        food: 20
      },
      db: {
        get: jest.fn().mockResolvedValue({ result: 1 })
      },
      embeddings: {
        mode: 'local',
        cache: { size: 0 }
      },
      llm: {
        router: {
          primary: { name: 'google' }
        }
      }
    };

    healthServer = new HealthServer(mockComponents, { port: 8080 });
  });

  afterEach(() => {
    if (healthServer) {
      healthServer.stop();
    }
  });

  describe('start', () => {
    it('should start HTTP server', async () => {
      await healthServer.start();

      expect(healthServer.server).toBeDefined();
      expect(healthServer.server.listening).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop HTTP server', async () => {
      await healthServer.start();
      healthServer.stop();

      expect(healthServer.server).toBeNull();
    });
  });

  describe('checkAll', () => {
    it('should return healthy status', async () => {
      const status = await healthServer.checkAll();

      expect(status.overall).toBe('healthy');
      expect(status.components.minecraft.status).toBe('healthy');
      expect(status.components.database.status).toBe('healthy');
      expect(status.timestamp).toBeDefined();
    });

    it('should return degraded status when bot entity is null', async () => {
      mockComponents.bot.entity = null;

      const status = await healthServer.checkAll();

      expect(status.overall).toBe('unhealthy');
      expect(status.components.minecraft.status).toBe('unhealthy');
    });

    it('should return unhealthy when database fails', async () => {
      mockComponents.db.get.mockRejectedValue(new Error('DB error'));

      const status = await healthServer.checkAll();

      expect(status.components.database.status).toBe('unhealthy');
    });
  });

  describe('checkMinecraft', () => {
    it('should return healthy when bot is connected', () => {
      const result = healthServer.checkMinecraft();

      expect(result.status).toBe('healthy');
      expect(result.connected).toBe(true);
      expect(result.position).toBeDefined();
    });

    it('should return unhealthy when bot is null', () => {
      healthServer.components.bot = null;

      const result = healthServer.checkMinecraft();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Bot not initialized');
    });

    it('should return unhealthy when bot.entity is null', () => {
      healthServer.components.bot.entity = null;

      const result = healthServer.checkMinecraft();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Not connected to server');
    });
  });

  describe('checkDatabase', () => {
    it('should return healthy when database is available', async () => {
      const result = await healthServer.checkDatabase();

      expect(result.status).toBe('healthy');
      expect(result.type).toBe('sqlite');
    });

    it('should return unhealthy when database fails', async () => {
      mockComponents.db.get.mockRejectedValue(new Error('Connection failed'));

      const result = await healthServer.checkDatabase();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('checkEmbeddings', () => {
    it('should return healthy when embeddings available', () => {
      const result = healthServer.checkEmbeddings();

      expect(result.status).toBe('healthy');
      expect(result.mode).toBe('local');
    });

    it('should return degraded when embeddings not initialized', () => {
      healthServer.components.embeddings = null;

      const result = healthServer.checkEmbeddings();

      expect(result.status).toBe('degraded');
    });
  });

  describe('checkLLM', () => {
    it('should return healthy when LLM configured', async () => {
      const result = await healthServer.checkLLM();

      expect(result.status).toBe('healthy');
      expect(result.provider).toBe('google');
    });

    it('should return degraded when no LLM configured', async () => {
      healthServer.components.llm = null;

      const result = await healthServer.checkLLM();

      expect(result.status).toBe('degraded');
    });
  });

  describe('checkMemory', () => {
    it('should return healthy when memory usage is normal', () => {
      const result = healthServer.checkMemory();

      expect(result.status).toBeDefined();
      expect(result.heapUsedMB).toBeDefined();
      expect(result.heapTotalMB).toBeDefined();
      expect(result.rssMB).toBeDefined();
    });
  });

  describe('isReady', () => {
    it('should return true when all components healthy', async () => {
      const ready = await healthServer.isReady();

      expect(ready).toBe(true);
    });

    it('should return false when components unhealthy', async () => {
      mockComponents.bot.entity = null;

      const ready = await healthServer.isReady();

      expect(ready).toBe(false);
    });
  });

  describe('getDetailedStatus', () => {
    it('should include system info', async () => {
      const status = await healthServer.getDetailedStatus();

      expect(status.uptime).toBeDefined();
      expect(status.nodeVersion).toBeDefined();
      expect(status.platform).toBeDefined();
      expect(status.pid).toBeDefined();
    });
  });

  describe('endpoints', () => {
    it('should have /health endpoint', () => {
      expect(healthServer.endpoints).toContain('/health');
    });

    it('should have /status endpoint', () => {
      expect(healthServer.endpoints).toContain('/status');
    });

    it('should have /ready endpoint', () => {
      expect(healthServer.endpoints).toContain('/ready');
    });
  });
});