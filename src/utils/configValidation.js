// src/utils/configValidation.js

import { z } from 'zod';

// Server configuration schema
const ServerSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(25565),
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/).default('1.20.4'),
  auth: z.enum(['offline', 'microsoft', 'mojang']).default('offline')
});

// Bot identity schema
const BotIdentitySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  owner: z.string().min(1),
  ownerNickname: z.string().optional().nullable(),
  role: z.string().default('assistant'),
  color: z.string().optional()
});

// Bot response configuration schema
const BotResponseSchema = z.object({
  mode: z.enum(['single', 'mention', 'auto']).default('auto'),
  defaultPrefix: z.string().default('!'),
  mentionPrefix: z.boolean().default(true),
  ownerPrivilege: z.boolean().default(true)
});

// Bot configuration schema
const BotConfigSchema = z.object({
  identity: BotIdentitySchema,
  response: BotResponseSchema.optional().default({
    mode: 'auto',
    defaultPrefix: '!',
    mentionPrefix: true,
    ownerPrivilege: true
  }),
  taskTimeout: z.number().positive().default(1800000),
  reconnectDelay: z.number().positive().default(5000),
  maxReconnectAttempts: z.number().int().positive().default(10)
});

// LLM provider schema
const LLMProviderSchema = z.object({
  type: z.enum(['google', 'nvidia', 'openrouter', 'ollama', 'openai']),
  model: z.string(),
  apiKey: z.string()
});

// LLM configuration schema
const LLMConfigSchema = z.object({
  mode: z.enum(['single', 'tiered']).default('single'),
  model: z.string().optional(),
  primary: LLMProviderSchema.optional(),
  secondary: LLMProviderSchema.optional(),
  codeModel: LLMProviderSchema.optional(),
  maxFailures: z.number().int().positive().default(5),
  cooldownMs: z.number().positive().default(60000),
  temperature: z.object({
    chat: z.number().min(0).max(2).default(0.7),
    code: z.number().min(0).max(2).default(0.3)
  }).optional().default({ chat: 0.7, code: 0.3 })
});

// Memory configuration schema
const MemoryConfigSchema = z.object({
  dbPath: z.string().default('./data/brain.db'),
  mode: z.enum(['local', 'api']).default('local'),
  embeddingModel: z.string().default('Xenova/multilingual-e5-small'),
  similarityThreshold: z.number().min(0).max(1).default(0.85),
  maxCacheSize: z.number().int().positive().default(500)
});

// Robustness configuration schema
const RobustnessConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logDir: z.string().default('./logs'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  checkpointInterval: z.number().positive().default(300000),
  autoRecover: z.boolean().default(true),
  deathRecovery: z.object({
    enabled: z.boolean().default(true),
    autoRecover: z.boolean().default(true),
    recoverBody: z.boolean().default(true),
    maxDeathAttempts: z.number().int().positive().default(3),
    deathCooldown: z.number().positive().default(30000)
  }).optional().default({
    enabled: true,
    autoRecover: true,
    recoverBody: true,
    maxDeathAttempts: 3,
    deathCooldown: 30000
  }),
  stuckDetection: z.object({
    enabled: z.boolean().default(true),
    positionCheckInterval: z.number().positive().default(5000),
    stuckThreshold: z.number().int().positive().default(3),
    maxStuckTime: z.number().positive().default(120000)
  }).optional().default({
    enabled: true,
    positionCheckInterval: 5000,
    stuckThreshold: 3,
    maxStuckTime: 120000
  }),
  alerts: z.object({
    memoryHighThreshold: z.number().int().min(0).max(100).default(85),
    memoryCriticalThreshold: z.number().int().min(0).max(100).default(91),
    llmErrorRateThreshold: z.number().int().min(0).max(100).default(20),
    skillFailureRateThreshold: z.number().int().min(0).max(100).default(30),
    taskStuckTime: z.number().positive().default(1800000)
  }).optional().default({
    memoryHighThreshold: 85,
    memoryCriticalThreshold: 91,
    llmErrorRateThreshold: 20,
    skillFailureRateThreshold: 30,
    taskStuckTime: 1800000
  })
});

// Complete configuration schema
const ConfigSchema = z.object({
  server: ServerSchema.default({
    host: 'localhost',
    port: 25565,
    version: '1.20.4',
    auth: 'offline'
  }),
  bot: BotConfigSchema,
  llm: LLMConfigSchema.optional(),
  memory: MemoryConfigSchema.optional().default({
    dbPath: './data/brain.db',
    mode: 'local',
    embeddingModel: 'Xenova/multilingual-e5-small',
    similarityThreshold: 0.85,
    maxCacheSize: 500
  }),
  robustness: RobustnessConfigSchema.optional().default({
    enabled: true,
    logDir: './logs',
    logLevel: 'info',
    checkpointInterval: 300000,
    autoRecover: true,
    deathRecovery: {
      enabled: true,
      autoRecover: true,
      recoverBody: true,
      maxDeathAttempts: 3,
      deathCooldown: 30000
    },
    stuckDetection: {
      enabled: true,
      positionCheckInterval: 5000,
      stuckThreshold: 3,
      maxStuckTime: 120000
    },
    alerts: {
      memoryHighThreshold: 85,
      memoryCriticalThreshold: 91,
      llmErrorRateThreshold: 20,
      skillFailureRateThreshold: 30,
      taskStuckTime: 1800000
    }
  })
}).passthrough(); // Allow additional fields

/**
 * Validate configuration against schema and apply defaults
 * @param {object} config - Raw configuration object
 * @returns {object} Validated configuration with defaults applied
 * @throws {Error} If validation fails
 */
export function validateConfig(config) {
  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e =>
        `Config inválida em ${e.path.join('.')}: ${e.message}`
      );
      throw new Error(`Erro de validação:\n${messages.join('\n')}`);
    }
    throw error;
  }
}

export { ConfigSchema };