import { jest } from '@jest/globals';
import { saySkill } from '../../../../src/skills/base/say.js';

// Mock logger
jest.mock('../../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    module: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  })
}));

describe('SaySkill', () => {
  let mockBot;
  let mockState;
  let execute;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock bot with chat
    mockBot = {
      chat: jest.fn()
    };

    // Create mock state
    mockState = {};

    execute = saySkill.execute;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('execute', () => {
    it('should return error when bot is not available', async () => {
      const result = await execute(null, mockState, { message: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
      expect(result.message).toBeNull();
    });

    it('should return error when chat function is not available', async () => {
      const result = await execute({ chat: null }, mockState, { message: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when message is missing', async () => {
      const result = await execute(mockBot, mockState, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
      expect(result.message).toBeNull();
    });

    it('should return error when message is empty', async () => {
      const result = await execute(mockBot, mockState, { message: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error when message is only whitespace', async () => {
      const result = await execute(mockBot, mockState, { message: '   ' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return error when message is not a string', async () => {
      const result = await execute(mockBot, mockState, { message: 123 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('should return error when message exceeds max length', async () => {
      const longMessage = 'a'.repeat(300); // More than 256 characters

      const result = await execute(mockBot, mockState, { message: longMessage });

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum length');
    });

    it('should send message successfully', async () => {
      const result = await execute(mockBot, mockState, { message: 'Hello world!' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Hello world!');
      expect(mockBot.chat).toHaveBeenCalledWith('Hello world!');
    });

    it('should trim whitespace from message', async () => {
      const result = await execute(mockBot, mockState, { message: '  Hello world!  ' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Hello world!');
      expect(mockBot.chat).toHaveBeenCalledWith('Hello world!');
    });

    it('should send message at max length successfully', async () => {
      const maxMessage = 'a'.repeat(256);

      const result = await execute(mockBot, mockState, { message: maxMessage });

      expect(result.success).toBe(true);
      expect(result.message).toBe(maxMessage);
      expect(mockBot.chat).toHaveBeenCalledWith(maxMessage);
    });

    it('should handle chat error gracefully', async () => {
      mockBot.chat.mockImplementation(() => {
        throw new Error('Chat error');
      });

      const result = await execute(mockBot, mockState, { message: 'Hello' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Chat error');
    });

    it('should send special characters', async () => {
      const result = await execute(mockBot, mockState, { message: '!@#$%^&*()' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('!@#$%^&*()');
      expect(mockBot.chat).toHaveBeenCalledWith('!@#$%^&*()');
    });

    it('should send message with numbers', async () => {
      const result = await execute(mockBot, mockState, { message: 'Coordinates: 100, 64, 200' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Coordinates: 100, 64, 200');
    });

    it('should handle undefined params gracefully', async () => {
      const result = await execute(mockBot, mockState, undefined);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('skill metadata', () => {
    it('should have correct name', () => {
      expect(saySkill.name).toBe('say');
    });

    it('should have description', () => {
      expect(saySkill.description).toBeDefined();
      expect(saySkill.description.length).toBeGreaterThan(0);
    });

    it('should have execute function', () => {
      expect(typeof saySkill.execute).toBe('function');
    });

    it('should have required parameters defined', () => {
      expect(saySkill.parameters).toBeDefined();
      expect(saySkill.parameters.message).toBeDefined();
      expect(saySkill.parameters.message.required).toBe(true);
      expect(saySkill.parameters.message.type).toBe('string');
    });

    it('should have returns defined', () => {
      expect(saySkill.returns).toBeDefined();
      expect(saySkill.returns.success).toBeDefined();
      expect(saySkill.returns.message).toBeDefined();
      expect(saySkill.returns.error).toBeDefined();
    });
  });
});