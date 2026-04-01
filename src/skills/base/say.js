// src/skills/base/say.js
// Say skill - Send chat message

import { getLogger } from '../../utils/logger.js';

const logger = getLogger().module('SaySkill');

// Maximum message length for Minecraft chat
const MAX_MESSAGE_LENGTH = 256;

/**
 * Say skill
 *
 * Send a chat message to the server.
 *
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} state - State manager instance
 * @param {Object} params - Skill parameters
 * @param {string} params.message - Message to send (required)
 * @returns {Promise<Object>} Result object {success, message, error}
 */
async function execute(bot, state, params) {
  const { message } = params || {};

  // Validate bot
  if (!bot || typeof bot.chat !== 'function') {
    const error = 'Bot or chat function not available';
    logger.error(error);
    return { success: false, error, message: null };
  }

  // Validate message
  if (!message) {
    const error = 'Message is required';
    logger.error(error);
    return { success: false, error, message: null };
  }

  if (typeof message !== 'string') {
    const error = 'Message must be a string';
    logger.error(error);
    return { success: false, error, message: null };
  }

  if (message.trim().length === 0) {
    const error = 'Message cannot be empty';
    logger.error(error);
    return { success: false, error, message: null };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    const error = `Message exceeds maximum length (${MAX_MESSAGE_LENGTH} characters)`;
    logger.error(error);
    return { success: false, error, message: null };
  }

  const trimmedMessage = message.trim();

  logger.info(`Sending chat message: "${trimmedMessage}"`);

  try {
    // Send the message
    bot.chat(trimmedMessage);

    logger.debug(`Message sent successfully`);

    return {
      success: true,
      message: trimmedMessage
    };

  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    return {
      success: false,
      error: error.message,
      message: null
    };
  }
}

// Skill metadata
export const saySkill = {
  name: 'say',
  description: 'Send a chat message to the server.',
  execute,
  parameters: {
    message: {
      type: 'string',
      required: true,
      description: 'Message to send (max 256 characters)'
    }
  },
  returns: {
    success: { type: 'boolean', description: 'Whether the message was sent successfully' },
    message: { type: 'string', description: 'The message that was sent' },
    error: { type: 'string', description: 'Error message if failed' }
  }
};

export default saySkill;