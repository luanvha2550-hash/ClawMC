#!/usr/bin/env node
// scripts/setup.js
// Interactive configuration wizard for ClawMC

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

function clear() {
  console.clear();
}

function printBanner() {
  console.log(`
${colors.cyan}${colors.bright}
   ██████╗██╗      ██╗ ██████╗ ██████╗ ██████╗
  ██╔════╝██║      ██║██╔════╝██╔═══██╗██╔══██╗
  ██║     ██║██████╗██║██║     ██║   ██║██████╔╝
  ██║     ██║╚═════╝██║██║     ██║   ██║██╔═══╝
  ╚██████╗██║      ██║╚██████╗╚██████╔╝██║
   ╚═════╝╚═╝      ╚═╝ ╚═════╝ ╚═════╝ ╚═╝
${colors.reset}
${colors.yellow}  Bot de Minecraft autônomo com IA${colors.reset}
${colors.green}  Configuração Interativa${colors.reset}

`);
}

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, prompt, defaultValue = null) {
  return new Promise((resolve) => {
    const displayPrompt = defaultValue
      ? `${colors.cyan}${prompt}${colors.reset} ${colors.yellow}[${defaultValue}]${colors.reset}: `
      : `${colors.cyan}${prompt}${colors.reset}: `;

    rl.question(displayPrompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function questionSelect(rl, prompt, options) {
  return new Promise((resolve) => {
    console.log(`\n${colors.cyan}${prompt}${colors.reset}`);
    options.forEach((opt, i) => {
      console.log(`  ${colors.yellow}${i + 1}.${colors.reset} ${opt}`);
    });

    rl.question(`\n${colors.cyan}Escolha (1-${options.length})${colors.reset}: `, (answer) => {
      const num = parseInt(answer.trim());
      if (num >= 1 && num <= options.length) {
        resolve(options[num - 1]);
      } else {
        resolve(options[0]);
      }
    });
  });
}

function questionYesNo(rl, prompt, defaultValue = true) {
  return new Promise((resolve) => {
    const defaultStr = defaultValue ? 'S/n' : 's/N';
    rl.question(`${colors.cyan}${prompt}${colors.reset} ${colors.yellow}[${defaultStr}]${colors.reset}: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === 's' || a === 'y' || a === 'sim' || a === 'yes') resolve(true);
      else if (a === 'n' || a === 'no' || a === 'não' || a === 'nao') resolve(false);
      else resolve(defaultValue);
    });
  });
}

async function main() {
  clear();
  printBanner();

  const rl = createRL();
  const config = {};
  const envVars = {};

  console.log(`${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}📝 CONFIGURAÇÃO DO BOT${colors.reset}\n`);

  // Bot configuration
  config.botName = await question(rl, '🤖 Nome do bot', 'ClawBot');
  config.ownerName = await question(rl, '👤 Nome do dono (seu nick no Minecraft)', 'Player');
  config.displayName = await question(rl, '🏷️  Nome de exibição do bot', config.botName);

  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}🌐 CONFIGURAÇÃO DO SERVIDOR${colors.reset}\n`);

  // Server configuration
  config.serverHost = await question(rl, '🖥️  IP do servidor Minecraft', 'localhost');
  config.serverPort = await question(rl, '🔌 Porta do servidor', '25565');
  config.serverVersion = await question(rl, '📦 Versão do Minecraft', '1.20.4');

  const authOptions = ['offline (sem login)', 'online (requer conta Mojang/Microsoft)'];
  config.authMode = await questionSelect(rl, '🔐 Modo de autenticação', authOptions);
  config.auth = config.authMode.includes('offline') ? 'offline' : 'microsoft';

  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}🧠 CONFIGURAÇÃO DO LLM${colors.reset}\n`);

  // LLM Mode selection
  const llmModes = ['single (um modelo)', 'tiered (primário + secundário)'];
  config.llmMode = await questionSelect(rl, '📊 Modo de uso do LLM', llmModes);
  config.mode = config.llmMode.includes('single') ? 'single' : 'tiered';

  // Primary LLM
  const llmProviders = [
    'google (Gemini - gratuito com limites)',
    'openai (GPT-4, GPT-3.5)',
    'openrouter (vários modelos)',
    'ollama (local, gratuito)',
    'nvidia (NIM API)'
  ];

  console.log(`\n${colors.yellow}Modelo Principal:${colors.reset}`);
  config.primaryProvider = await questionSelect(rl, '🤖 Provedor LLM principal', llmProviders);

  // Extract provider name
  if (config.primaryProvider.includes('google')) {
    config.primaryType = 'google';
    config.primaryModel = await question(rl, '📦 Modelo Gemini', 'gemini-2.0-flash');
    envVars.GOOGLE_API_KEY = await question(rl, '🔑 Google API Key');
  } else if (config.primaryProvider.includes('openai')) {
    config.primaryType = 'openai';
    config.primaryModel = await question(rl, '📦 Modelo OpenAI', 'gpt-4o-mini');
    envVars.OPENAI_API_KEY = await question(rl, '🔑 OpenAI API Key');
  } else if (config.primaryProvider.includes('openrouter')) {
    config.primaryType = 'openrouter';
    config.primaryModel = await question(rl, '📦 Modelo (formato: provider/model)', 'openai/gpt-4o-mini');
    envVars.OPENROUTER_API_KEY = await question(rl, '🔑 OpenRouter API Key');
  } else if (config.primaryProvider.includes('ollama')) {
    config.primaryType = 'ollama';
    config.primaryModel = await question(rl, '📦 Modelo Ollama', 'llama3.2');
    config.ollamaHost = await question(rl, '🌐 Host Ollama', 'http://localhost:11434');
  } else if (config.primaryProvider.includes('nvidia')) {
    config.primaryType = 'nvidia';
    config.primaryModel = await question(rl, '📦 Modelo NVIDIA', 'deepseek-ai/deepseek-v3');
    envVars.NVIDIA_API_KEY = await question(rl, '🔑 NVIDIA API Key');
  }

  // Secondary LLM (if tiered mode)
  if (config.mode === 'tiered') {
    console.log(`\n${colors.yellow}Modelo Secundário (fallback):${colors.reset}`);
    config.secondaryProvider = await questionSelect(rl, '🤖 Provedor LLM secundário', llmProviders);

    if (config.secondaryProvider.includes('google')) {
      config.secondaryType = 'google';
      config.secondaryModel = await question(rl, '📦 Modelo Gemini', 'gemini-2.0-flash');
      if (!envVars.GOOGLE_API_KEY) {
        envVars.GOOGLE_API_KEY = await question(rl, '🔑 Google API Key');
      }
    } else if (config.secondaryProvider.includes('openai')) {
      config.secondaryType = 'openai';
      config.secondaryModel = await question(rl, '📦 Modelo OpenAI', 'gpt-3.5-turbo');
      if (!envVars.OPENAI_API_KEY) {
        envVars.OPENAI_API_KEY = await question(rl, '🔑 OpenAI API Key');
      }
    } else if (config.secondaryProvider.includes('ollama')) {
      config.secondaryType = 'ollama';
      config.secondaryModel = await question(rl, '📦 Modelo Ollama', 'llama3.2');
    }
  }

  // Embeddings configuration
  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}🔢 CONFIGURAÇÃO DE EMBEDDINGS${colors.reset}\n`);

  const embedModes = ['local (offline, modelo pequeno)', 'api (online, modelo maior)'];
  config.embedMode = await questionSelect(rl, '📊 Modo de embeddings', embedModes);
  config.memoryMode = config.embedMode.includes('local') ? 'local' : 'api';

  if (config.memoryMode === 'local') {
    config.embeddingModel = await question(rl, '📦 Modelo de embeddings', 'Xenova/multilingual-e5-small');
  } else {
    config.embeddingModel = await question(rl, '📦 Modelo de embeddings', 'text-embedding-3-small');
    // API mode typically uses the same provider
  }

  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}🤝 CONFIGURAÇÃO MULTI-BOT${colors.reset}\n`);

  // Multi-bot configuration
  config.communityEnabled = await questionYesNo(rl, '🤖 Habilitar modo multi-bot?', false);

  if (config.communityEnabled) {
    envVars.COMMUNITY_SECRET = await question(rl, '🔐 Chave secreta compartilhada (mínimo 32 chars)', 'change-this-to-a-long-secret-key-32chars');
    config.communityName = await question(rl, '🏷️  Nome da comunidade', 'Vila dos Bots');
  }

  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}⚙️  CONFIGURAÇÃO DE SAÚDE${colors.reset}\n`);

  // Health server configuration
  config.healthEnabled = await questionYesNo(rl, '🏥 Habilitar servidor de saúde?', true);

  if (config.healthEnabled) {
    config.healthPort = await question(rl, '🔌 Porta do servidor de saúde', '8080');
  }

  console.log(`\n${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}📊 RESUMO DA CONFIGURAÇÃO${colors.reset}\n`);

  // Print summary
  console.log(`${colors.cyan}Bot:${colors.reset}`);
  console.log(`  Nome: ${colors.yellow}${config.botName}${colors.reset}`);
  console.log(`  Dono: ${colors.yellow}${config.ownerName}${colors.reset}`);
  console.log(`  Display: ${colors.yellow}${config.displayName}${colors.reset}`);

  console.log(`\n${colors.cyan}Servidor:${colors.reset}`);
  console.log(`  Host: ${colors.yellow}${config.serverHost}:${config.serverPort}${colors.reset}`);
  console.log(`  Versão: ${colors.yellow}${config.serverVersion}${colors.reset}`);
  console.log(`  Auth: ${colors.yellow}${config.auth}${colors.reset}`);

  console.log(`\n${colors.cyan}LLM:${colors.reset}`);
  console.log(`  Modo: ${colors.yellow}${config.mode}${colors.reset}`);
  console.log(`  Primário: ${colors.yellow}${config.primaryType}/${config.primaryModel}${colors.reset}`);
  if (config.mode === 'tiered') {
    console.log(`  Secundário: ${colors.yellow}${config.secondaryType}/${config.secondaryModel}${colors.reset}`);
  }

  console.log(`\n${colors.cyan}Embeddings:${colors.reset}`);
  console.log(`  Modo: ${colors.yellow}${config.memoryMode}${colors.reset}`);
  console.log(`  Modelo: ${colors.yellow}${config.embeddingModel}${colors.reset}`);

  console.log(`\n${colors.cyan}Outros:${colors.reset}`);
  console.log(`  Multi-bot: ${colors.yellow}${config.communityEnabled ? 'Sim' : 'Não'}${colors.reset}`);
  console.log(`  Health Server: ${colors.yellow}${config.healthEnabled ? `Porta ${config.healthPort}` : 'Desabilitado'}${colors.reset}`);

  const confirm = await questionYesNo(rl, '\n✅ Confirma a configuração?', true);

  if (!confirm) {
    console.log(`\n${colors.red}Configuração cancelada.${colors.reset}`);
    rl.close();
    process.exit(0);
  }

  rl.close();

  // Generate config.json
  const configJson = {
    server: {
      host: `\${SERVER_HOST}`,
      port: `\${SERVER_PORT}`,
      version: `\${SERVER_VERSION}`,
      auth: config.auth
    },
    bot: {
      identity: {
        name: `\${BOT_NAME}`,
        displayName: config.displayName,
        owner: `\${BOT_OWNER}`,
        ownerNickname: null,
        role: 'assistant'
      },
      response: {
        mode: 'auto',
        defaultPrefix: '!',
        mentionPrefix: true,
        ownerPrivilege: true
      },
      taskTimeout: 1800000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10
    },
    llm: {
      mode: config.mode,
      model: config.primaryModel,
      primary: {
        type: config.primaryType,
        model: config.primaryModel,
        apiKey: `\${${config.primaryType.toUpperCase()}_API_KEY}`
      },
      secondary: config.mode === 'tiered' ? {
        type: config.secondaryType,
        model: config.secondaryModel,
        apiKey: `\${${config.secondaryType.toUpperCase()}_API_KEY}`
      } : undefined,
      maxFailures: 5,
      cooldownMs: 60000,
      temperature: {
        chat: 0.7,
        code: 0.3
      }
    },
    memory: {
      dbPath: './data/brain.db',
      mode: config.memoryMode,
      embeddingModel: config.embeddingModel,
      similarityThreshold: 0.85,
      maxCacheSize: 500
    },
    skills: {
      maxAttempts: 3,
      escalationThreshold: 2,
      executionTimeout: 30000,
      logFailures: true
    },
    autonomy: {
      enabled: true,
      idleTimeout: 30000,
      survival: {
        minFood: 10,
        minHealth: 10,
        maxDanger: 3
      },
      curriculum: {
        enabled: true,
        phases: ['survival', 'gathering', 'exploration', 'advanced'],
        autoProgress: true
      },
      scheduledTasks: [
        { name: 'patrol_base', cron: '*/5 * * * *', enabled: true },
        { name: 'check_chests', cron: '*/30 * * * *', enabled: true }
      ]
    },
    community: {
      enabled: config.communityEnabled,
      name: config.communityName || 'Vila dos Bots',
      sharedSecret: `\${COMMUNITY_SECRET}`,
      discovery: {
        autoAnnounce: true,
        peerTimeout: 120000
      }
    },
    robustness: {
      enabled: true,
      logDir: './logs',
      logLevel: 'INFO',
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
    },
    logging: {
      level: 'info',
      logDir: './logs',
      maxFileSize: 10485760,
      maxFiles: 7
    },
    telemetry: {
      enabled: false,
      endpoint: `\${TELEMETRY_ENDPOINT}`,
      apiKey: `\${TELEMETRY_API_KEY}`
    },
    healthServer: {
      enabled: config.healthEnabled,
      port: parseInt(config.healthPort) || 8080
    }
  };

  // Remove undefined values
  Object.keys(configJson).forEach(key => {
    if (configJson[key] === undefined) {
      delete configJson[key];
    }
  });

  // Generate .env
  const envLines = [
    '# ClawMC Configuration',
    '# Generated by setup.js',
    '',
    '# Bot Identity',
    `BOT_NAME=${config.botName}`,
    `BOT_OWNER=${config.ownerName}`,
    '',
    '# Server Configuration',
    `SERVER_HOST=${config.serverHost}`,
    `SERVER_PORT=${config.serverPort}`,
    `SERVER_VERSION=${config.serverVersion}`,
    ''
  ];

  // Add API keys
  if (envVars.GOOGLE_API_KEY) {
    envLines.push(`GOOGLE_API_KEY=${envVars.GOOGLE_API_KEY}`);
  }
  if (envVars.OPENAI_API_KEY) {
    envLines.push(`OPENAI_API_KEY=${envVars.OPENAI_API_KEY}`);
  }
  if (envVars.OPENROUTER_API_KEY) {
    envLines.push(`OPENROUTER_API_KEY=${envVars.OPENROUTER_API_KEY}`);
  }
  if (envVars.NVIDIA_API_KEY) {
    envLines.push(`NVIDIA_API_KEY=${envVars.NVIDIA_API_KEY}`);
  }
  if (envVars.COMMUNITY_SECRET) {
    envLines.push('');
    envLines.push('# Multi-bot Configuration');
    envLines.push(`COMMUNITY_SECRET=${envVars.COMMUNITY_SECRET}`);
  }

  // Write files
  const configPath = path.join(rootDir, 'config.json');
  const envPath = path.join(rootDir, '.env');

  // Backup existing files
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, configPath + '.backup');
  }
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, envPath + '.backup');
  }

  fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2));
  fs.writeFileSync(envPath, envLines.join('\n'));

  console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.green}${colors.bright}✅ CONFIGURAÇÃO CONCLUÍDA!${colors.reset}\n`);

  console.log(`${colors.cyan}Arquivos criados:${colors.reset}`);
  console.log(`  📄 config.json`);
  console.log(`  📄 .env\n`);

  console.log(`${colors.yellow}Próximos passos:${colors.reset}`);
  console.log(`  1. Revise o arquivo ${colors.cyan}.env${colors.reset} e ajuste as API keys`);
  console.log(`  2. Execute ${colors.cyan}npm install${colors.reset} para instalar dependências`);
  console.log(`  3. Execute ${colors.cyan}npm start${colors.reset} para iniciar o bot\n`);

  console.log(`${colors.green}Obrigado por usar o ClawMC! 🎮${colors.reset}\n`);
}

main().catch(console.error);