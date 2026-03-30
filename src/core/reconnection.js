import { getLogger } from '../utils/logger.js';

const logger = getLogger().module('Reconnection');

class ReconnectionManager {
  constructor(bot, robustness, config = {}) {
    this.bot = bot;
    this.robustness = robustness;

    this.config = {
      baseDelay: config.baseDelay || 5000,
      maxDelay: config.maxDelay || 300000,
      maxAttempts: config.maxAttempts || 10,
      resetAfter: config.resetAfter || 300000
    };

    // Allow dependency injection for testing
    this._createBot = config._createBot || null;

    this.attempts = 0;
    this.lastAttempt = 0;
    this.reconnectTimer = null;
    this.isReconnecting = false;
  }

  /**
   * Initialize reconnection handlers
   */
  init() {
    this.bot.on('end', () => this.handleDisconnect('end'));
    this.bot.on('kicked', (reason) => this.handleDisconnect('kicked', reason));
    this.bot.on('error', (error) => this.handleDisconnect('error', error.message));

    // Reset counter after stable connection
    this.bot.on('spawn', () => {
      setTimeout(() => {
        if (this.bot.entity) {
          this.attempts = 0;
          this.lastAttempt = 0;
          logger.info('Conexao estavel, contador de tentativas resetado');
        }
      }, this.config.resetAfter);
    });

    logger.info('ReconnectionManager inicializado');
  }

  /**
   * Handle disconnection
   */
  async handleDisconnect(reason, details = null) {
    logger.warn(`Desconectado: ${reason}`, details);

    // Try to save checkpoint
    if (this.robustness?.checkpoint) {
      try {
        await this.robustness.checkpoint.save('disconnect');
        logger.info('Checkpoint salvo antes de reconectar');
      } catch (e) {
        logger.error('Erro ao salvar checkpoint:', e);
      }
    }

    // Check if max attempts reached
    if (this.attempts >= this.config.maxAttempts) {
      logger.error(`Maximo de ${this.config.maxAttempts} tentativas atingido`);
      this.robustness?.eventLog?.critical('CONNECTION', 'max_attempts_reached', {
        reason,
        attempts: this.attempts
      });
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.config.maxDelay,
      this.config.baseDelay * Math.pow(2, this.attempts)
    );

    this.attempts++;
    this.lastAttempt = Date.now();

    logger.info(`Tentativa ${this.attempts}/${this.config.maxAttempts} em ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect(reason);
    }, delay);
  }

  /**
   * Attempt reconnection
   */
  async reconnect(originalReason) {
    if (this.isReconnecting) {
      logger.warn('Reconexao ja em andamento');
      return;
    }

    this.isReconnecting = true;

    try {
      logger.info('Tentando reconectar...');

      // Create new bot instance (use injected function or dynamic import)
      let createBot;
      if (this._createBot) {
        createBot = this._createBot;
      } else {
        createBot = (await import('mineflayer')).createBot;
      }
      const newBot = createBot(this.bot.config.server);

      // Wait for spawn
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout ao reconectar'));
        }, 30000);

        newBot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });

        newBot.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      // Update bot reference
      Object.assign(this.bot, newBot);

      // Restore state
      await this.robustness?.restoreFromCheckpoint();

      // Reset attempts on success
      this.attempts = 0;

      logger.info('Reconectado com sucesso');
      this.robustness?.eventLog?.info('CONNECTION', 'reconnected', {
        attempts: this.attempts,
        originalReason
      });

    } catch (error) {
      logger.error('Falha na reconexao:', error.message);
      this.handleDisconnect('reconnect_failed', error.message);
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Force immediate reconnection
   */
  forceReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.attempts = 0;
    this.reconnect('manual');
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      attempts: this.attempts,
      maxAttempts: this.config.maxAttempts,
      isReconnecting: this.isReconnecting,
      lastAttempt: this.lastAttempt ? new Date(this.lastAttempt).toISOString() : null
    };
  }
}

export { ReconnectionManager };