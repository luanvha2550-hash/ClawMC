// src/llm/minifiedDocs.js

/**
 * Minified Mineflayer API documentation for prompts
 */
class MinifiedDocs {
  constructor() {
    this.allowedMethods = {
      // Movement
      'bot.pathfinder.goto': 'Vai até coordenada. Args: GoalBlock(x,y,z)',
      'bot.pathfinder.stop': 'Para movimento.',
      'bot.setControlState': 'Define estado. Args: control(str), state(bool)',
      'bot.jump': 'Pula.',

      // Blocks
      'bot.dig': 'Quebra bloco. Args: block, forceAnimate(bool)',
      'bot.placeBlock': 'Coloca bloco. Args: referenceBlock, faceVector',
      'bot.findBlocks': 'Encontra blocos. Args: matching, maxDistance, count',
      'bot.blockAt': 'Bloco em posição. Args: position',

      // Inventory
      'bot.inventory.items': 'Lista itens do inventário.',
      'bot.equip': 'Equipa item. Args: item, destination',
      'bot.unequip': 'Desequipa. Args: destination',
      'bot.toss': 'Joga item. Args: itemType, metadata, count',
      'bot.openChest': 'Abre baú. Args: chestBlock',
      'bot.closeWindow': 'Fecha janela.',

      // Entities
      'bot.entities': 'Objeto com todas entidades visíveis.',
      'bot.nearestEntity': 'Entidade mais próxima. Args: filter',
      'bot.attack': 'Ataca entidade. Args: entity',

      // Chat
      'bot.chat': 'Envia mensagem no chat. Args: message',
      'bot.whisper': 'Sussurra para jogador. Args: username, message',

      // Utilities
      'bot.lookAt': 'Olha para ponto. Args: point',
      'bot.entity.position': 'Posição atual do bot.',
      'bot.health': 'Vida atual.',
      'bot.food': 'Fome atual.'
    };
  }

  /**
   * Generate minified documentation
   */
  generate() {
    const docs = Object.entries(this.allowedMethods)
      .map(([method, desc]) => `${method}: ${desc}`)
      .join('\n');

    return `
[API MINEFLAYER - Métodos Permitidos]
${docs}

[RESTRIÇÕES]
- NÃO use require() ou import
- NÃO acesse filesystem
- NÃO faça requisições HTTP
- Use APENAS os métodos listados acima
- Sempre use try/catch em operações assíncronas
`.trim();
  }

  /**
   * Validate code uses only allowed methods
   */
  validateCode(code) {
    const usedMethods = [];
    const unknownMethods = [];

    // Find all bot.method calls
    const methodPattern = /bot\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;
    const matches = code.match(methodPattern) || [];

    for (const match of matches) {
      if (this.allowedMethods[match]) {
        usedMethods.push(match);
      } else {
        unknownMethods.push(match);
      }
    }

    return {
      allowed: [...new Set(usedMethods)],
      unknown: [...new Set(unknownMethods)]
    };
  }
}

export { MinifiedDocs };