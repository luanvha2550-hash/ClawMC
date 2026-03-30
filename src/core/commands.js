/**
 * CommandParser
 *
 * Parses chat commands into structured objects.
 * Works with BotIdentity to handle prefixes and mentions.
 *
 * Features:
 * - Extract intent (first word)
 * - Extract arguments (remaining words)
 * - Extract common patterns (coordinates, materials, counts)
 * - Detect high priority commands
 * - Map command aliases
 */
class CommandParser {
  constructor(identity) {
    if (!identity || typeof identity.isForMe !== 'function' || typeof identity.parseCommand !== 'function') {
      throw new Error('CommandParser requires identity with isForMe and parseCommand methods');
    }
    this.identity = identity;
  }

  /**
   * Parse command from message
   * @param {string} username - Username of the sender
   * @param {string} message - Raw message
   * @returns {Object|null} - Parsed command or null if not for bot
   */
  parse(username, message) {
    // Check if message is for this bot
    if (!this.identity.isForMe(username, message)) {
      return null;
    }

    // Extract command text
    const commandText = this.identity.parseCommand(username, message);

    if (!commandText) {
      return null;
    }

    // Parse intent and arguments
    const parts = commandText.split(/\s+/).filter(p => p.length > 0);

    if (parts.length === 0) {
      return null;
    }

    const intent = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Build parsed result
    const parsed = {
      intent,
      args,
      raw: message,
      username,
      timestamp: Date.now()
    };

    // Try to extract common patterns
    this.extractPatterns(parsed, commandText);

    return parsed;
  }

  /**
   * Extract intent (first word)
   * @param {string} commandText - Cleaned command text
   * @returns {string} - Intent (first word, lowercase)
   */
  extractIntent(commandText) {
    const parts = commandText.trim().split(/\s+/);
    return parts[0]?.toLowerCase() || '';
  }

  /**
   * Extract arguments (remaining words after intent)
   * @param {string} commandText - Cleaned command text
   * @param {string} intent - Intent to skip
   * @returns {Array<string>} - Array of arguments
   */
  extractArgs(commandText, intent) {
    const parts = commandText.trim().split(/\s+/);
    const intentIndex = parts.findIndex(p => p.toLowerCase() === intent);
    return parts.slice(intentIndex + 1);
  }

  /**
   * Extract common patterns from command
   * @param {Object} parsed - Parsed command object to enhance
   * @param {string} commandText - Cleaned command text
   */
  extractPatterns(parsed, commandText) {
    const text = commandText.toLowerCase();

    // Coordinates: x y z or (x, y, z)
    const coordMatch = text.match(/(-?\d+)\s*[,\s]\s*(-?\d+)\s*[,\s]\s*(-?\d+)/);
    if (coordMatch) {
      parsed.coordinates = {
        x: parseInt(coordMatch[1]),
        y: parseInt(coordMatch[2]),
        z: parseInt(coordMatch[3])
      };
    }

    // Material: "de pedra", "de ferro", "de madeira"
    const materialMatch = text.match(/de\s+(\w+)/);
    if (materialMatch) {
      parsed.material = materialMatch[1];
    }

    // Count: number followed by noun
    const countMatch = text.match(/(\d+)\s+\w+/);
    if (countMatch) {
      parsed.count = parseInt(countMatch[1]);
    }

    // Location hints: "perto de mim", "aqui", "lá"
    if (text.includes('perto de mim') || text.includes('aqui')) {
      parsed.nearby = true;
    }

    // Direction: "norte", "sul", "leste", "oeste"
    const directions = ['norte', 'sul', 'leste', 'oeste'];
    for (const dir of directions) {
      if (text.includes(dir)) {
        parsed.direction = dir;
        break;
      }
    }

    // Player mention - specifically look for @ mentions
    const playerMatch = text.match(/@(\w+)/);
    if (playerMatch && /^[a-zA-Z0-9_]{3,16}$/.test(playerMatch[1])) {
      parsed.targetPlayer = playerMatch[1];
    }
  }

  /**
   * Check if command is high priority
   * @param {string} intent - Command intent
   * @returns {boolean} - True if high priority
   */
  isHighPriority(intent) {
    const highPriorityCommands = ['stop', 'pare', 'fuja', 'escape', 'socorro'];
    return highPriorityCommands.includes(intent.toLowerCase());
  }

  /**
   * Get command aliases
   * @param {string} intent - Command intent
   * @returns {Array<string>} - Array of aliases including original
   */
  getAliases(intent) {
    const aliases = {
      'mine': ['minerar', 'mine', 'picareta'],
      'walk': ['andar', 'ir', 'walk', 'vá'],
      'come': ['vem', 'vir', 'come', 'aqui'],
      'follow': ['sigue', 'follow', 'siga', 'acompanhe'],
      'stop': ['pare', 'stop', 'pause'],
      'collect': ['colete', 'collect', 'pegue'],
      'store': ['guarde', 'store', 'baú'],
      'craft': ['faça', 'craft', 'construa'],
      'attack': ['ataque', 'attack', 'mate'],
      'inventory': ['inventário', 'inventory', 'itens'],
      'say': ['diga', 'say', 'fale']
    };
    return aliases[intent.toLowerCase()] || [intent];
  }
}

export { CommandParser };