// src/index.js
// ClawMC - Main Entry Point
//
// Initializes all layers in order and starts the bot

import { createLogger } from './utils/logger.js';
import { loadConfig, validateConfig } from './utils/config.js';
import { checkEnvironment, printEnvironmentReport } from './utils/environmentCheck.js';
import { getTimeoutManager } from './utils/timeoutManager.js';
import { HealthServer } from './utils/healthServer.js';

import { StateManager } from './core/state.js';
import { CommandParser } from './core/commands.js';
import { ReconnectionManager } from './core/reconnection.js';
import { CircadianEvents } from './core/circadianEvents.js';

import { initDatabase, runMigrations } from './memory/database.js';
import { EmbeddingsManager, createEmbeddingsManager } from './memory/embeddings.js';
import { RAGSystem, createRAGSystem } from './memory/rag.js';
import { FactsManager, createFactsManager } from './memory/facts.js';

import { RobustnessLayer, initializeRobustnessLayer } from './robustness/index.js';

import { SkillRegistry, createSkillRegistry } from './skills/index.js';
import { SkillExecutor } from './skills/executor.js';

import { ProviderFactory } from './llm/providers/factory.js';
import { LLMRouter } from './llm/router.js';
import { PromptTemplates } from './llm/prompts.js';
import { CostTracker } from './llm/costTracker.js';
import { CircuitBreaker } from './llm/circuitBreaker.js';

import { CurriculumManager } from './autonomy/curriculum.js';
import { IdleLoop } from './autonomy/idle.js';
import { TaskScheduler } from './autonomy/scheduler.js';
import { SurvivalMonitor } from './autonomy/survival.js';

import { BotIdentity } from './community/identity.js';
import { CommunicationProtocol } from './community/protocol.js';
import { PeerManager } from './community/manager.js';
import { RoleManager } from './community/roles.js';

import dotenv from 'dotenv';
import { createBot } from 'mineflayer';

dotenv.config();

let logger;

/**
 * Main bot class
 */
class ClawMC {
  constructor() {
    this.initialized = false;
    this.shutdownInProgress = false;
    this.components = {};

    // Configuration
    this.config = null;

    // Core components
    this.bot = null;
    this.state = null;
    this.commands = null;
    this.reconnection = null;
    this.circadian = null;

    // Memory components
    this.db = null;
    this.embeddings = null;
    this.rag = null;
    this.facts = null;

    // Robustness
    this.robustness = null;

    // Skills
    this.skills = null;
    this.executor = null;

    // LLM
    this.router = null;
    this.prompts = null;
    this.costTracker = null;

    // Autonomy
    this.curriculum = null;
    this.scheduler = null;
    this.survival = null;
    this.idle = null;

    // Community
    this.identity = null;
    this.protocol = null;
    this.peers = null;
    this.roles = null;

    // Utils
    this.timeoutManager = null;
    this.healthServer = null;
  }

  /**
   * Initialize bot
   */
  async init() {
    logger.info('=== ClawMC Starting ===');

    try {
      // 1. Check environment
      logger.info('[Init] Checking environment...');
      const envReport = await checkEnvironment();
      printEnvironmentReport(envReport);

      if (!envReport.isReady) {
        logger.error('Environment check failed. Please fix issues before starting.');
        process.exit(1);
      }

      // 2. Load configuration
      logger.info('[Init] Loading configuration...');
      const rawConfig = loadConfig('./config.json');
      this.config = validateConfig(rawConfig);

      // 3. Initialize logger with config
      logger = createLogger({
        level: this.config.logging?.level || 'info',
        logDir: this.config.logging?.logDir || './logs'
      });

      // 4. Initialize timeout manager
      this.timeoutManager = getTimeoutManager();

      // 5. Initialize database
      logger.info('[Init] Initializing database...');
      this.db = await initDatabase(this.config.memory.dbPath);
      await runMigrations(this.db);

      // 6. Initialize robustness layer (without bot for now)
      logger.info('[Init] Initializing robustness layer...');
      this.robustness = new RobustnessLayer(this.config.robustness);

      // 7. Create bot connection
      logger.info('[Init] Connecting to Minecraft server...');
      this.bot = await this.createBotConnection();

      // 8. Initialize core components
      logger.info('[Init] Initializing core...');
      await this.initCore();

      // 9. Initialize robustness with bot
      await this.robustness.init(this.bot, this.db, this.state, this.rag);

      // 10. Initialize memory
      logger.info('[Init] Initializing memory...');
      await this.initMemory();

      // 11. Initialize skills
      logger.info('[Init] Initializing skills...');
      await this.initSkills();

      // 12. Initialize LLM
      logger.info('[Init] Initializing LLM...');
      await this.initLLM();

      // 13. Initialize autonomy
      logger.info('[Init] Initializing autonomy...');
      await this.initAutonomy();

      // 14. Initialize community
      logger.info('[Init] Initializing community...');
      await this.initCommunity();

      // 15. Start health server
      if (this.config.healthServer?.enabled) {
        logger.info('[Init] Starting health server...');
        this.healthServer = new HealthServer(this.components, this.config.healthServer);
        await this.healthServer.start();
      }

      // 16. Setup graceful shutdown
      this.setupGracefulShutdown();

      // 17. Start main loop
      logger.info('[Init] Starting main loop...');
      this.startMainLoop();

      this.initialized = true;
      logger.info('=== ClawMC Ready ===');

      // Announce presence
      if (this.identity) {
        await this.identity.init();
      }

    } catch (error) {
      logger.error('Failed to initialize:', error);
      await this.shutdown('init-failed');
      throw error;
    }
  }

  /**
   * Create bot connection
   */
  async createBotConnection() {
    return new Promise((resolve, reject) => {
      const botConfig = {
        host: this.config.server.host,
        port: this.config.server.port,
        username: this.config.bot.identity.name,
        version: this.config.server.version,
        auth: this.config.server.auth || 'offline'
      };

      logger.info(`[Bot] Connecting to ${botConfig.host}:${botConfig.port}...`);

      const bot = createBot(botConfig);

      // Timeout after 30 seconds
      const timeoutId = this.timeoutManager.setTimeout('bot-connect', () => {
        bot.quit();
        reject(new Error('Connection timeout'));
      }, 30000);

      bot.once('spawn', () => {
        this.timeoutManager.clearTimeout('bot-connect');
        logger.info(`[Bot] Connected as ${bot.username}`);
        resolve(bot);
      });

      bot.once('error', (error) => {
        this.timeoutManager.clearTimeout('bot-connect');
        logger.error('[Bot] Connection error:', error);
        reject(error);
      });
    });
  }

  /**
   * Initialize core components
   */
  async initCore() {
    // State manager
    this.state = new StateManager(this.bot);

    // Identity
    this.identity = new BotIdentity(this.config, this.bot);

    // Command parser
    this.commands = new CommandParser(this.identity);

    // Reconnection manager
    this.reconnection = new ReconnectionManager(this.bot, this.robustness, this.config.bot);

    // Circadian events
    this.circadian = new CircadianEvents(this.bot);
    this.circadian.start();

    // Add to components
    this.components.bot = this.bot;
    this.components.state = this.state;
    this.components.identity = this.identity;
  }

  /**
   * Initialize memory
   */
  async initMemory() {
    // Embeddings
    this.embeddings = createEmbeddingsManager({
      mode: this.config.memory.mode,
      model: this.config.memory.embeddingModel,
      maxCacheSize: this.config.memory.maxCacheSize
    });
    await this.embeddings.init();

    // RAG
    this.rag = createRAGSystem({
      db: this.db,
      embeddingsManager: this.embeddings,
      config: {
        similarityThreshold: this.config.memory.similarityThreshold
      }
    });
    await this.rag.init();

    // Facts
    this.facts = createFactsManager({
      db: this.db,
      embeddingsManager: this.embeddings
    });
    await this.facts.init();

    // Add to components
    this.components.embeddings = this.embeddings;
    this.components.db = this.db;
    this.components.rag = this.rag;
    this.components.facts = this.facts;
  }

  /**
   * Initialize skills
   */
  async initSkills() {
    this.skills = createSkillRegistry();

    // Load base skills from directory
    try {
      await this.skills.loadBaseSkills('./src/skills/base');
    } catch (error) {
      logger.warn('[Skills] Could not load base skills:', error.message);
    }

    // Skill executor
    this.executor = new SkillExecutor(this.bot, this.state, this.config.skills);

    // Add to components
    this.components.skills = this.skills;
  }

  /**
   * Initialize LLM
   */
  async initLLM() {
    // Create circuit breaker
    const circuitBreaker = new CircuitBreaker(
      this.config.llm.maxFailures || 5,
      this.config.llm.cooldownMs || 60000
    );

    // Create providers
    const providers = ProviderFactory.createFromConfig(this.config.llm);

    // Create router
    this.router = new LLMRouter(providers, this.config.llm, circuitBreaker);

    // Prompt templates
    this.prompts = new PromptTemplates();

    // Cost tracker
    this.costTracker = new CostTracker();

    // Add to components
    this.components.llm = {
      router: this.router,
      prompts: this.prompts,
      costTracker: this.costTracker
    };
  }

  /**
   * Initialize autonomy
   */
  async initAutonomy() {
    // Curriculum
    this.curriculum = new CurriculumManager(this.state, this.rag, this.config.autonomy?.curriculum);

    // Task scheduler
    this.scheduler = new TaskScheduler(this.state, this.config);

    // Load scheduled tasks from config
    if (this.config.autonomy?.scheduledTasks) {
      for (const task of this.config.autonomy.scheduledTasks) {
        if (task.enabled) {
          this.scheduler.addTask(task.name, task.cron, task.params || {});
        }
      }
    }

    // Survival monitor
    this.survival = new SurvivalMonitor(this.bot, this.state, this.config.autonomy?.survival);

    // Idle loop
    this.idle = new IdleLoop(
      this.curriculum,
      this.scheduler,
      this.survival,
      this.state,
      this.config.autonomy
    );

    // Start scheduler
    this.scheduler.start();

    // Add to components
    this.components.autonomy = {
      curriculum: this.curriculum,
      scheduler: this.scheduler,
      survival: this.survival,
      idle: this.idle
    };
  }

  /**
   * Initialize community
   */
  async initCommunity() {
    if (!this.config.community?.enabled) {
      logger.info('[Community] Disabled in config');
      return;
    }

    // Communication protocol
    this.protocol = new CommunicationProtocol({
      name: this.config.bot.identity.name,
      sharedSecret: process.env.COMMUNITY_SECRET
    });

    // Peer manager
    this.peers = new PeerManager(this.bot, this.config.community);
    await this.peers.init(this.protocol);

    // Role manager
    this.roles = new RoleManager();

    // Add to components
    this.components.community = {
      peers: this.peers,
      roles: this.roles,
      protocol: this.protocol
    };
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection:', reason);
      this.shutdown('unhandledRejection');
    });

    // Register shutdown handlers with robustness layer
    if (this.robustness) {
      this.robustness.registerShutdownHandler('stopSchedulers', async () => {
        if (this.scheduler) this.scheduler.stopAll();
      });

      this.robustness.registerShutdownHandler('stopIdle', async () => {
        if (this.idle) this.idle.stop();
      });

      this.robustness.registerShutdownHandler('closeDatabase', async () => {
        if (this.db) this.db.close();
      });
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(signal) {
    if (this.shutdownInProgress) {
      logger.warn('[Shutdown] Already in progress');
      return;
    }
    this.shutdownInProgress = true;

    logger.info(`[Shutdown] Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new tasks
      if (this.scheduler) {
        logger.info('[Shutdown] Stopping scheduler...');
        this.scheduler.stopAll();
      }

      if (this.idle) {
        logger.info('[Shutdown] Stopping idle loop...');
        this.idle.stop();
      }

      if (this.circadian) {
        logger.info('[Shutdown] Stopping circadian events...');
        this.circadian.destroy();
      }

      // Save checkpoint
      if (this.robustness?.checkpoint) {
        logger.info('[Shutdown] Saving checkpoint...');
        await this.robustness.checkpoint.save('shutdown');
      }

      // Close database
      if (this.db) {
        logger.info('[Shutdown] Closing database...');
        this.db.close();
      }

      // Stop health server
      if (this.healthServer) {
        logger.info('[Shutdown] Stopping health server...');
        this.healthServer.stop();
      }

      // Disconnect bot
      if (this.bot) {
        logger.info('[Shutdown] Disconnecting...');
        this.bot.quit();
      }

      logger.info('[Shutdown] Complete');

    } catch (error) {
      logger.error('[Shutdown] Error:', error);
    }

    process.exit(0);
  }

  /**
   * Start main loop
   */
  startMainLoop() {
    // Chat event handler
    this.bot.on('chat', (username, message) => {
      this.handleChat(username, message);
    });

    // Death event handler
    this.bot.on('death', () => {
      logger.info('[Bot] Death detected');
      this.state.handleDeath();

      if (this.robustness?.eventLog) {
        this.robustness.eventLog.critical('BOT', 'death', {
          position: this.state.lastPosition
        });
      }
    });

    // Spawn event handler
    this.bot.on('spawn', () => {
      logger.info('[Bot] Spawned');
      this.state.updatePosition();
    });

    // Time event handler for circadian events
    this.bot.on('time', () => {
      if (this.circadian) {
        this.circadian.checkTimeEvents();
      }
    });

    // Circadian event handler
    this.circadian?.on?.('event', (event) => {
      this.handleCircadian(event);
    });

    // Start idle loop
    if (this.idle) {
      this.idle.start(this.config.autonomy?.idleTimeout || 5000);
    }

    logger.info('[MainLoop] Started');
  }

  /**
   * Handle chat message
   */
  async handleChat(username, message) {
    // Ignore own messages
    if (username === this.bot.username) return;

    logger.debug(`[Chat] ${username}: ${message}`);

    // Check if command is for this bot
    const parsed = this.commands.parse(username, message);
    if (!parsed) return;

    logger.info(`[Command] ${username}: ${parsed.intent} ${parsed.args.join(' ')}`);

    // TODO: Execute command through skill system
    // For now, just acknowledge
    this.bot.chat(`Received command: ${parsed.intent}`);
  }

  /**
   * Handle circadian event
   */
  handleCircadian(event) {
    logger.info(`[Circadian] ${event.event}`);

    // Handle nightfall
    if (event.event === 'nightfall' && !this.state.hasShelter?.()) {
      // Add urgent goal to build shelter
      if (this.curriculum?.addUrgentGoal) {
        this.curriculum.addUrgentGoal('build_shelter');
      }
    }

    // Update curriculum time
    if (this.curriculum) {
      this.curriculum.setTimeOfDay(event.timeOfDay);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  // Create logger instance
  logger = createLogger({
    level: 'info',
    logDir: './logs'
  });

  const bot = new ClawMC();

  try {
    await bot.init();
  } catch (error) {
    logger.error('Failed to start:', error);
    process.exit(1);
  }

  return bot;
}

// Export for testing
export { ClawMC };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default ClawMC;