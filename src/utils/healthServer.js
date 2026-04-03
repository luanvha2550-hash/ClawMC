// src/utils/healthServer.js

import { createServer } from 'http';
import { getLogger } from './logger.js';

const logger = getLogger().module('HealthServer');

/**
 * HTTP Health Check Server
 * Provides endpoints for monitoring bot health and status
 */
class HealthServer {
  constructor(components, config = {}) {
    this.components = components;
    this.port = config.port || 8080;
    this.server = null;
    this.endpoints = ['/health', '/status', '/ready'];
  }

  /**
   * Start health check server
   */
  async start() {
    this.server = createServer(async (req, res) => {
      const url = req.url.split('?')[0];

      try {
        switch (url) {
          case '/health':
            await this.handleHealth(req, res);
            break;
          case '/status':
            await this.handleStatus(req, res);
            break;
          case '/ready':
            await this.handleReady(req, res);
            break;
          default:
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        logger.error(`[HealthServer] Error handling ${url}:`, error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        logger.info(`[HealthServer] Server started on port ${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop health check server
   */
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info('[HealthServer] Server stopped');
    }
  }

  /**
   * Handle /health endpoint
   */
  async handleHealth(req, res) {
    const health = await this.checkAll();

    const statusCode = health.overall === 'healthy' ? 200 :
                       health.overall === 'degraded' ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  /**
   * Handle /status endpoint
   */
  async handleStatus(req, res) {
    const status = await this.getDetailedStatus();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  /**
   * Handle /ready endpoint
   */
  async handleReady(req, res) {
    const ready = await this.isReady();

    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ready }));
  }

  /**
   * Check all components
   */
  async checkAll() {
    const result = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      components: {}
    };

    // Check Minecraft connection
    result.components.minecraft = this.checkMinecraft();

    // Check database
    result.components.database = await this.checkDatabase();

    // Check embeddings
    result.components.embeddings = this.checkEmbeddings();

    // Check LLM
    result.components.llm = await this.checkLLM();

    // Check memory
    result.components.memory = this.checkMemory();

    // Determine overall status
    const hasUnhealthy = Object.values(result.components)
      .some(c => c.status === 'unhealthy');

    if (hasUnhealthy) {
      result.overall = 'unhealthy';
    } else {
      const hasDegraded = Object.values(result.components)
        .some(c => c.status === 'degraded');
      if (hasDegraded) {
        result.overall = 'degraded';
      }
    }

    return result;
  }

  /**
   * Check Minecraft connection
   */
  checkMinecraft() {
    const bot = this.components.bot;

    if (!bot) {
      return { status: 'unhealthy', error: 'Bot not initialized' };
    }

    if (!bot.entity) {
      return { status: 'unhealthy', error: 'Not connected to server' };
    }

    return {
      status: 'healthy',
      connected: true,
      position: bot.entity.position,
      health: bot.health || 20,
      food: bot.food || 20
    };
  }

  /**
   * Check database
   */
  async checkDatabase() {
    try {
      if (!this.components.db) {
        return { status: 'unhealthy', error: 'Database not initialized' };
      }

      await this.components.db.get('SELECT 1');
      return { status: 'healthy', type: 'sqlite' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Check embeddings
   */
  checkEmbeddings() {
    const embeddings = this.components.embeddings;

    if (!embeddings) {
      return { status: 'degraded', error: 'Not initialized' };
    }

    return {
      status: 'healthy',
      mode: embeddings.mode || 'unknown',
      cacheSize: embeddings.cache?.size || 0
    };
  }

  /**
   * Check LLM
   */
  async checkLLM() {
    const llm = this.components.llm;

    if (!llm?.router?.primary) {
      return { status: 'degraded', error: 'No LLM configured' };
    }

    return {
      status: 'healthy',
      provider: llm.router.primary.name || 'unknown'
    };
  }

  /**
   * Check memory
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const MB = 1024 * 1024;

    return {
      status: usage.heapUsed / usage.heapTotal < 0.91 ? 'healthy' : 'warning',
      heapUsedMB: Math.round(usage.heapUsed / MB),
      heapTotalMB: Math.round(usage.heapTotal / MB),
      rssMB: Math.round(usage.rss / MB)
    };
  }

  /**
   * Get detailed status
   */
  async getDetailedStatus() {
    const health = await this.checkAll();

    return {
      ...health,
      uptime: process.uptime(),
      nodeVersion: process.versions.node,
      platform: process.platform,
      pid: process.pid
    };
  }

  /**
   * Check if ready
   */
  async isReady() {
    const health = await this.checkAll();
    return health.overall !== 'unhealthy';
  }
}

export { HealthServer };