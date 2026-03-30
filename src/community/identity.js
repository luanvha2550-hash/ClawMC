import { getLogger } from '../utils/logger.js';

class BotIdentity {
  constructor(config, bot) {
    this.config = config.bot;
    this.bot = bot;

    this.name = this.config.identity.name;
    this.displayName = this.config.identity.displayName || this.name;
    this.owner = this.config.identity.owner;
    this.ownerNickname = this.config.identity.ownerNickname;

    // Response mode
    this.responseMode = this.config.response.mode;
    this.defaultPrefix = this.config.response.defaultPrefix;

    // Known peers
    this.knownPeers = new Map();
    this.isMultiBotMode = false;

    // Logger
    const logger = getLogger();
    this.logger = logger.module ? logger.module('BotIdentity') : { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  }

  /**
   * Initialize identity and detection
   */
  async init() {
    // Announce presence
    this.announcePresence();

    // Listen for other bots
    this.bot.on('chat', (username, message) => {
      this.detectOtherBot(username, message);
    });

    // If auto mode, check after timeout
    if (this.responseMode === 'auto') {
      setTimeout(() => this.checkMultiBotMode(), 30000);
    }

    this.logger.info(`BotIdentity inicializado: ${this.name} (owner: ${this.owner})`);
  }

  /**
   * Announce presence on server
   */
  announcePresence() {
    const announcement = `[COMM:HELLO] ${JSON.stringify({
      name: this.name,
      displayName: this.displayName,
      owner: this.owner,
      role: this.config.identity.role,
      timestamp: Date.now()
    })}`;

    this.bot.chat(announcement);
  }

  /**
   * Detect other bots from chat messages
   */
  detectOtherBot(username, message) {
    if (username === this.bot.username) return;

    if (message.startsWith('[COMM:HELLO]')) {
      try {
        const data = JSON.parse(message.replace('[COMM:HELLO]', '').trim());
        this.knownPeers.set(data.name, {
          ...data,
          lastSeen: Date.now()
        });

        this.logger.info(`Bot detectado: ${data.name} (owner: ${data.owner})`);

        if (this.responseMode === 'auto') {
          this.enableMultiBotMode();
        }
      } catch (e) {
        // Not a valid bot announcement
      }
    }
  }

  /**
   * Check if should switch to multi-bot mode
   */
  checkMultiBotMode() {
    if (this.knownPeers.size > 0) {
      this.enableMultiBotMode();
    } else {
      this.logger.info('Nenhum outro bot detectado, mantendo modo single');
    }
  }

  /**
   * Enable multi-bot response mode
   */
  enableMultiBotMode() {
    if (this.isMultiBotMode) return;

    this.isMultiBotMode = true;
    this.logger.info(`Modo multi-bot ativado. Respondendo apenas a @${this.name}`);

    this.bot.chat(`Modo multi-bot ativado. Use @${this.name} para me chamar.`);
  }

  /**
   * Check if message is for this bot
   */
  isForMe(username, message) {
    // Single mode: accept prefix
    if (!this.isMultiBotMode) {
      return message.startsWith(this.defaultPrefix);
    }

    // Multi mode: require mention
    const mentionPattern = new RegExp(`@${this.name}|@${this.displayName}`, 'i');
    if (mentionPattern.test(message)) {
      return true;
    }

    // Owner can use prefix without mention
    if (username === this.owner || username === this.ownerNickname) {
      // But only if message doesn't mention another bot
      const otherBotMention = Array.from(this.knownPeers.values())
        .some(peer =>
          message.includes(`@${peer.name}`) ||
          message.includes(`@${peer.displayName}`)
        );

      if (!otherBotMention && message.startsWith(this.defaultPrefix)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse command from message
   */
  parseCommand(username, message) {
    let command = message;

    // Remove mention
    command = command.replace(new RegExp(`@${this.name}|@${this.displayName}`, 'gi'), '').trim();

    // Remove prefix
    if (command.startsWith(this.defaultPrefix)) {
      command = command.slice(this.defaultPrefix.length).trim();
    }

    return command;
  }

  /**
   * List known peers
   */
  listKnownPeers() {
    return Array.from(this.knownPeers.values());
  }

  /**
   * Check if owner is online
   */
  isOwnerOnline() {
    const players = Object.keys(this.bot.players);
    return players.includes(this.owner) || players.includes(this.ownerNickname);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      name: this.name,
      displayName: this.displayName,
      owner: this.owner,
      responseMode: this.responseMode,
      isMultiBotMode: this.isMultiBotMode,
      knownPeers: this.listKnownPeers()
    };
  }
}

export { BotIdentity };