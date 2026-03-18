# ClawMC - Design Document

**Versão:** 0.1.0
**Data:** 2026-03-17
**Autor:** Luanv + Claude
**Status:** Aprovado

---

## 1. Visão Geral

### 1.1 Objetivo

ClawMC é um bot de Minecraft autônomo com IA, projetado para operar sob restrições extremas de hardware (8GB RAM, Intel i5-1035G1) enquanto minimiza custos de API de LLM.

### 1.2 Decisões Arquiteturais Principais

| Decisão | Justificativa |
|---------|---------------|
| **Motor: Mineflayer (Node.js)** | 150-350MB RAM vs 3000MB do Fabric/Java |
| **IA: Loop OODA híbrido** | LLM apenas para situações inéditas, reduzindo custos |
| **Memória: sqlite-vec (on-disk)** | Evita OOM de soluções in-memory como ChromaDB |
| **Embeddings: Transformers.js local** | Zero custo de API para vetorização |
| **Skills: Dinâmicas + Base** | Aprendizado contínuo com fundação de habilidades pré-definidas |

### 1.3 Escopo da Versão Inicial

- Core + Memória RAG + Skills dinâmicos
- Suporte a múltiplos provedores LLM (Google, NVIDIA, OpenRouter, Ollama Cloud, OpenAI)
- Skills base: walk, mine, collect, follow, store, craft, attack, come, stop, inventory, say
- Prefixo de comando configurável (padrão: `!`)
- Timeout de tarefas + interrupção por novo comando

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        MINECRAFT SERVER                          │
│                    (Dedicado ou LAN Local)                       │
└─────────────────────────────────────────────────────────────────┘
                                ▲
                                │ Protocolo TCP (Mineflayer)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          CLAWMC BOT                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     CORE LAYER                               │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │ │
│  │  │  Bot     │  │  OODA    │  │ Commands │  │  State   │    │ │
│  │  │(Mineflayer)│  │  Loop   │  │  Parser  │  │ Manager  │    │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │ │
│  └───────┼─────────────┼─────────────┼─────────────┼──────────┘ │
│          │             │             │             │            │
│  ┌───────┼─────────────┼─────────────┼─────────────┼──────────┐ │
│  │       │      MEMORY LAYER         │             │          │ │
│  │  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐    │ │
│  │  │Embeddings│  │   RAG    │  │  Facts   │  │ Database │    │ │
│  │  │(Transformers│  │(sqlite-vec)│  │ Manager │  │(SQLite) │    │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      SKILLS LAYER                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │ │
│  │  │  Base    │  │ Dynamic  │  │ Executor │                    │ │
│  │  │  Skills  │  │  Skills  │  │ (Sandbox)│                    │ │
│  │  └──────────┘  └──────────┘  └──────────┘                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                       LLM LAYER                                │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │ │
│  │  │Providers │  │  Router  │  │ Prompts  │                    │ │
│  │  │(GPT/Gemini│  │+ Fallback│  │ Templates│                    │ │
│  │  └──────────┘  └──────────┘  └──────────┘                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                       UTILS LAYER                              │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │ │
│  │  │  Logger  │  │  Config  │  │ Helpers  │                    │ │
│  │  └──────────┘  └──────────┘  └──────────┘                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Fluxo OODA

1. **Observe:** Eventos do Mineflayer (chat, spawns, danos) → Core Layer
2. **Orient:** Parser identifica comando → Memory Layer busca skills/fatos similares
3. **Decide:** Se não encontrou skill local → LLM Layer gera código ou resposta
4. **Act:** Skills Layer executa (base ou dinâmica em sandbox)

---

## 3. Estrutura de Diretórios

```
ClawMC/
├── package.json
├── config.json
├── .env.example
├── .gitignore
├── README.md
│
├── src/
│   ├── index.js                 # Entry point, inicializa tudo
│   │
│   ├── core/
│   │   ├── bot.js               # Conexão Mineflayer, eventos
│   │   ├── ooda.js              # Loop OODA principal
│   │   ├── commands.js          # Parser de comandos (prefixo)
│   │   └── state.js             # Estado do bot (tarefa atual, timeout)
│   │
│   ├── memory/
│   │   ├── embeddings.js        # Transformers.js (all-MiniLM-L6-v2)
│   │   ├── rag.js               # Consultas sqlite-vec
│   │   ├── facts.js             # CRUD de fatos do mundo
│   │   └── database.js          # Inicialização SQLite
│   │
│   ├── skills/
│   │   ├── base/                 # Skills pré-definidas
│   │   │   ├── walk.js           # Andar até coordenada
│   │   │   ├── mine.js           # Minerar bloco
│   │   │   ├── collect.js        # Coletar itens
│   │   │   ├── follow.js         # Seguir jogador
│   │   │   ├── store.js          # Guardar em baú
│   │   │   ├── craft.js          # Craftar itens
│   │   │   ├── attack.js         # Atacar entidade
│   │   │   ├── come.js           # Vir até o jogador
│   │   │   ├── stop.js           # Parar tarefa
│   │   │   ├── inventory.js      # Listar inventário
│   │   │   ├── say.js            # Enviar mensagem
│   │   │   └── index.js          # Registro de skills base
│   │   ├── dynamic/               # Skills aprendidas (geradas)
│   │   │   └── .gitkeep
│   │   ├── executor.js           # Sandbox de execução
│   │   └── registry.js           # Registro de todas skills
│   │
│   ├── llm/
│   │   ├── providers/
│   │   │   ├── google.js         # Gemini API
│   │   │   ├── openai-compat.js  # OpenAI-compatible
│   │   │   ├── factory.js        # Factory de providers
│   │   │   └── index.js          # Lista de providers
│   │   ├── router.js             # Roteamento + fallback
│   │   └── prompts.js            # Templates de prompt
│   │
│   └── utils/
│       ├── logger.js             # Sistema de logs
│       ├── config.js             # Carregador de config.json
│       └── helpers.js             # Funções utilitárias
│
├── data/
│   └── brain.db                  # SQLite + sqlite-vec
│
├── logs/                          # Arquivos de log
│   └── .gitkeep
│
└── tests/
    ├── core/
    ├── memory/
    ├── skills/
    └── llm/
```

---

## 4. Core Layer

### 4.1 `bot.js` - Conexão Mineflayer

**Responsabilidades:**
- Conectar ao servidor Minecraft (dedicado ou LAN)
- Registrar listeners de eventos (chat, spawn, death, etc.)
- Emitir eventos para o OODA loop

**Eventos principais:**
- `'chat'`: mensagem recebida → OODA.process()
- `'spawn'`: bot entrou no mundo → state.reset()
- `'death'`: bot morreu → state.handleDeath()
- `'kicked'`: bot foi expulso → reconexão com backoff

**Configuração de conexão:**
```json
{
  "server": {
    "host": "localhost",
    "port": 25565,
    "username": "ClawMC",
    "version": "1.20.4",
    "auth": "offline"
  }
}
```

### 4.2 `ooda.js` - Loop OODA Principal

```javascript
async function process(chatMessage, username) {
  // OBSERVE: Recebe evento do bot.js

  // ORIENT: Parser extrai comando → RAG busca similaridade
  const parsed = commands.parse(chatMessage);
  const similar = await rag.search(parsed.intent);

  // Usa threshold do config (padrão: 0.85)
  const threshold = config.get('memory.similarityThreshold', 0.85);

  if (similar.confidence > threshold) {
    // Skill encontrada localmente → executa sem LLM
    return await skills.execute(similar.skill, parsed.args);
  }

  // DECIDE: Nenhuma skill local → consulta LLM
  const llmResponse = await router.generate(parsed);

  // ACT: Executa resposta ou novo skill
  return await executeResponse(llmResponse);
}
```

> **Nota:** O threshold de similaridade é configurável em `config.json` (`memory.similarityThreshold`). Valores mais altos exigem correspondência mais precisa, valores mais baixos permitem mais flexibilidade mas podem retornar skills incorretas.

### 4.3 `commands.js` - Parser de Comandos

**Função:** Extrai intenção e argumentos do chat

**Input:** `"!construa uma casa de pedra perto de mim"`
**Output:**
```javascript
{
  prefix: "!",
  intent: "construir",
  action: "casa",
  material: "pedra",
  location: "perto do jogador",
  raw: "!construa uma casa de pedra perto de mim"
}
```

**Prefixos suportados:** `!`, `@nome`, `nome` (configurável)

### 4.4 `state.js` - Gerenciador de Estado

**Estrutura de estado:**
```javascript
{
  currentTask: {
    type: "mining",
    started: "2026-03-17T...",
    timeout: 1800000,
    args: { block: "stone", count: 64 }
  },
  position: { x: 100, y: 64, z: -200 },
  inventory: [...],
  health: 20,
  following: null
}
```

**Métodos:**
- `setTask(task)` → inicia com timeout
- `clearTask()` → cancela tarefa atual
- `isBusy()` → verifica se ocupado
- `checkTimeout()` → auto-cancela se expirado

---

## 5. Memory Layer

### 5.1 `database.js` - Inicialização SQLite

**Tabelas:**

```sql
-- Skills aprendidas (código gerado) - sqlite-vec armazena apenas vetores
CREATE VIRTUAL TABLE skills_vss USING vec0(
  embedding FLOAT[384]
);

-- Metadados das skills (linkado via rowid)
CREATE TABLE skills_metadata (
  id INTEGER PRIMARY KEY,
  rowid INTEGER,        -- link para skills_vss
  name TEXT UNIQUE,
  description TEXT,
  file_path TEXT,
  created_at DATETIME,
  FOREIGN KEY (rowid) REFERENCES skills_vss(rowid)
);

-- Fatos do mundo (coordenadas, regras, localizações)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  type TEXT,           -- 'location', 'rule', 'chest', 'player'
  key TEXT,
  value TEXT,          -- JSON
  embedding BLOB,
  created_at DATETIME,
  updated_at DATETIME
);

-- Histórico de execuções
CREATE TABLE executions (
  id INTEGER PRIMARY KEY,
  command TEXT,
  skill_used TEXT,
  success BOOLEAN,
  duration_ms INTEGER,
  timestamp DATETIME
);
```

### 5.2 `embeddings.js` - Transformers.js

**Função:** Gera embeddings localmente (sem API)

**Modelo:** `Xenova/all-MiniLM-L6-v2` (384 dimensões, quantizado)

**Uso:** ~150-200MB RAM durante inferência, ~50-100ms por texto

### 5.2.1 Gerenciamento de Memória

```javascript
// Gerenciamento de memória para embeddings
class EmbeddingsManager {
  constructor() {
    this.model = null;
    this.lastUsed = null;
    this.unloadTimeout = null;
  }

  // Carrega modelo sob demanda
  async loadModel() {
    if (!this.model) {
      logger.info('Carregando modelo de embeddings...');
      this.model = await pipeline('feature-extraction',
        'Xenova/all-MiniLM-L6-v2', { quantized: true });
    }
    this.lastUsed = Date.now();
    this.scheduleUnload();
    return this.model;
  }

  // Agenda descarregamento após 5 minutos de inatividade
  scheduleUnload() {
    if (this.unloadTimeout) clearTimeout(this.unloadTimeout);

    this.unloadTimeout = setTimeout(() => {
      if (Date.now() - this.lastUsed > 300000) { // 5 minutos
        logger.info('Descarregando modelo de embeddings para liberar memória');
        this.model = null;
      }
    }, 300000);
  }

  async vectorize(text) {
    const model = await this.loadModel();
    const tensor = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(tensor.data);
  }
}

export default new EmbeddingsManager();
```

### 5.3 `rag.js` - Consultas Semânticas

**Função:** Busca skills e fatos por similaridade

**Exemplo:**
- Input: `"onde está o baú de ferro?"`
- Output: `{ skills: [], facts: [{ type: 'chest', key: 'chest_iron', value: {x: 150, ...} }] }`

### 5.4 `facts.js` - Gerenciador de Fatos

**Tipos suportados:**
- `'location'`: coordenadas importantes (base, fazenda, vila)
- `'chest'`: localização de baús e seus conteúdos
- `'rule'`: regras do jogador ("sempre feche portas")
- `'player'`: informações sobre jogadores

**Exemplos:**
```javascript
saveFact('location', 'base', {x: 100, y: 64, z: -200})
saveFact('rule', 'close_doors', 'Sempre feche portas após passar')
saveFact('chest', 'chest_iron', {x: 150, y: 63, z: 100, items: ['iron_ingot']})
```

### 5.4.1 Aprendizado Automático de Fatos

Fatos são criados automaticamente quando:

1. **Comando explícito:** `!lembra que o baú de ferro está em 150 63 100`
2. **Contexto de tarefa:** Após completar tarefa com sucesso, salva localização relevante
3. **Feedback do jogador:** `!isso é importante` após comando executado

**Limites:**
- Máximo de 1000 fatos (política FIFO)
- Deduplicação: Verifica similaridade semântica antes de salvar
- Fatos antigos (30+ dias sem acesso) são removidos automaticamente

---

## 6. Skills Layer

### 6.1 Skills Base (Pré-definidas)

| Skill | Descrição | Dependências |
|-------|-----------|--------------|
| `walk` | Anda até coordenada | mineflayer-pathfinder |
| `mine` | Minera bloco específico | mineflayer-pathfinder |
| `collect` | Coleta itens no chão | mineflayer-pathfinder |
| `follow` | Segue jogador | mineflayer-pathfinder |
| `store` | Guarda itens em baú | mineflayer-pathfinder |
| `craft` | Crafta itens | mineflayer |
| `attack` | Ataca entidade | mineflayer |
| `come` | Vem até o jogador | mineflayer-pathfinder |
| `stop` | Para tarefa atual | - |
| `inventory` | Lista inventário | - |
| `say` | Envia mensagem no chat | - |

### 6.2 Formato de Skill Base

```javascript
// skills/base/walk.js
export default {
  name: 'walk',
  description: 'Anda até uma coordenada ou entidade',
  parameters: {
    target: { type: 'coordinates|entity', required: true },
    timeout: { type: 'number', default: 60000 }
  },

  async execute(bot, params, state) {
    const { x, y, z } = params.target;
    const goal = new GoalBlock(x, y, z);
    await bot.pathfinder.goto(goal);
    return { success: true, message: `Cheguei em ${x}, ${y}, ${z}` };
  },

  async canExecute(bot, params) {
    return bot.entity.position.distanceTo(params.target) < 1000;
  }
};
```

### 6.3 `executor.js` - Sandbox de Execução

**Segurança:**
- Sem acesso a filesystem
- Sem acesso a network
- Sem acesso a process
- Timeout obrigatório (30s)

### 6.3.1 Validação de Código Gerado

Antes de executar código gerado pelo LLM:

```javascript
// 1. Validação de sintaxe com parser JavaScript
import * as acorn from 'acorn';

function validateSyntax(code) {
  try {
    acorn.parse(code, { ecmaVersion: 2020 });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// 2. Análise estática de padrões proibidos
const FORBIDDEN_PATTERNS = [
  /require\s*\(/,
  /import\s+/,
  /eval\s*\(/,
  /Function\s*\(/,
  /process\./,
  /global\./,
  /__dirname/,
  /__filename/,
  /fs\./,
  /child_process/
];

function analyzeCodeSafety(code) {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Padrão proibido detectado: ${pattern}` };
    }
  }
  return { safe: true };
}

// 3. Timeout de compilação (5 segundos)
const COMPILATION_TIMEOUT = 5000;
```

**Fluxo de validação:**
1. Parse de sintaxe → rejeita se houver erros
2. Análise de segurança → rejeita se detectar padrões maliciosos
3. Compilação com timeout → rejeita se demorar mais de 5s
4. Execução em sandbox → timeout de 30s

### 6.4 `registry.js` - Registro de Skills

**Métodos:**
- `loadBaseSkills()` - carrega do diretório
- `loadDynamicSkills()` - carrega do banco
- `register(skill, isBase)` - registra nova skill
- `findSimilar(description)` - busca por embedding

---

## 7. LLM Layer

### 7.1 Providers Suportados

| Provider | Modelos | Classe |
|----------|---------|--------|
| **Google** | gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash, gemini-2.5-flash-preview | GoogleProvider |
| **NVIDIA NIM** | deepseek-ai/deepseek-v3.2, minimaxai/minimax-m2.1, nvidia/nemotron-nano-12b-v2-vl, stepfun-ai/step-3.5-flash, z-ai/glm4.7 | OpenAICompatProvider |
| **OpenRouter** | claude-3-haiku, gpt-4o-mini, stepfun/step-3.5-flash:free, gemini-2.5-flash | OpenAICompatProvider |
| **Ollama Cloud** | gemini-2.5-flash-preview, glm-4.7, minimax-m2.1, nemotron-3-nano:30b, qwen3.5, kimi-k2.5, rnj-1 | OpenAICompatProvider |
| **OpenAI** | gpt-4o-mini, gpt-4o, gpt-3.5-turbo | OpenAICompatProvider |

> **Nota:** Modelos Gemini 3.x são placeholders para futuros lançamentos. Verificar documentação oficial do Google para modelos disponíveis.

### 7.2 `router.js` - Roteamento + Fallback

**Estratégia:**
- `primary`: modelo para conversação (mais barato)
- `secondary`: fallback se primary falhar
- `codeModel`: modelo para gerar código (melhor em programação)

**Fallback automático:**
1. Tenta provider configurado
2. Se falhar, tenta secondary
3. Desabilita provider temporariamente após N falhas
4. Reabilita após cooldown

### 7.3 `prompts.js` - Templates

**chatSystem:** Sistema conversacional em pt-BR, respostas concisas
**codeSystem:** Geração de código JavaScript para Mineflayer
**buildCodePrompt:** Template para gerar código com contexto do bot

---

## 8. Utils Layer

### 8.1 `logger.js` - Sistema de Logs

**Níveis:** debug, info, warn, error
**Output:** Console + arquivo (`logs/bot-YYYY-MM-DD.log`)
**Módulos:** `logger.module('nome')` para logs específicos

### 8.2 `config.js` - Carregador de Configuração

**Variáveis de ambiente:** `${VAR_NAME}` substituído por `process.env[VAR_NAME]`
**Validação:** Campos obrigatórios, valores padrão
**Métodos:** `get(path, default)`, `set(path, value)`, `save()`

### 8.3 `helpers.js` - Funções Utilitárias

- `formatCoords(x, y, z)` - formata coordenadas
- `parseCoords(str)` - parseia string de coordenadas
- `sleep(ms)` - delay assíncrono
- `retry(fn, options)` - retry com backoff exponencial
- `getInventoryItems(bot)` - extrai itens do inventário
- `findItem(bot, itemName)` - encontra item no inventário
- `distance(pos1, pos2)` - calcula distância
- `truncate(text, maxLength)` - trunca texto
- `sanitizeFilename(name)` - sanitiza nome de arquivo
- `timestamp()` - timestamp para skills dinâmicas

---

## 9. Configuração

### 9.1 `config.json`

```json
{
  "server": {
    "host": "localhost",
    "port": 25565,
    "username": "ClawMC",
    "version": "1.20.4",
    "auth": "offline"
  },

  "llm": {
    "primary": {
      "type": "google",
      "model": "gemini-1.5-flash",
      "apiKey": "${GOOGLE_API_KEY}"
    },
    "secondary": {
      "type": "openrouter",
      "model": "stepfun/step-3.5-flash:free",
      "apiKey": "${OPENROUTER_API_KEY}"
    },
    "codeModel": {
      "type": "nvidia",
      "model": "deepseek-ai/deepseek-v3.2",
      "apiKey": "${NVIDIA_API_KEY}"
    },
    "maxFailures": 3,
    "cooldownMs": 60000,
    "temperature": {
      "chat": 0.7,
      "code": 0.3
    }
  },

  "bot": {
    "prefix": "!",
    "taskTimeout": 1800000,
    "reconnectDelay": 5000,
    "maxReconnectAttempts": 10
  },

  "memory": {
    "dbPath": "./data/brain.db",
    "embeddingModel": "Xenova/all-MiniLM-L6-v2",
    "similarityThreshold": 0.85
  },

  "logging": {
    "level": "info",
    "logDir": "./logs",
    "maxFileSize": 10485760,
    "maxFiles": 7
  }
}
```

### 9.2 `.env.example`

```env
# Google Gemini
GOOGLE_API_KEY=your_google_api_key

# OpenRouter
OPENROUTER_API_KEY=your_openrouter_api_key

# NVIDIA NIM
NVIDIA_API_KEY=your_nvidia_api_key

# Ollama Cloud
OLLAMA_CLOUD_API_KEY=your_ollama_cloud_api_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

---

## 10. Fluxo de Dados Detalhado

```
jogador digita: "!construa uma casa de pedra 10x10"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. OBSERVE (bot.js)                                                          │
│    • Evento 'chat' recebido                                                  │
│    • Dados: { username: 'Steve', message: '!construa uma casa de pedra...' } │
│    • Emite para: ooda.process()                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. ORIENT (commands.js + rag.js)                                            │
│                                                                              │
│    commands.parse('!construa uma casa de pedra 10x10')                      │
│    → { intent: 'construir', action: 'casa', material: 'pedra', ... }        │
│                                                                              │
│    rag.search('construir casa de pedra')                                     │
│    → { found: false, confidence: 0.62 }                                      │
│    → Fatos: base próxima, regra de construir perto                           │
│                                                                              │
│    Decisão: confidence < 0.85 → precisa de LLM                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. DECIDE (router.js)                                                        │
│                                                                              │
│    router.generateCode('construir casa de pedra 10x10', context)            │
│    → Envia para codeModel (NVIDIA → deepseek-v3.2)                          │
│    → Recebe código JavaScript assíncrono                                     │
│    → Salva em skills/dynamic/construir_casa_2026-03-17.js                    │
│    → Salva embedding em skills_vss                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. ACT (executor.js)                                                         │
│                                                                              │
│    executor.executeSkill(skill, params, bot, state)                        │
│    → Executa em sandbox (timeout 30s)                                        │
│    → Atualiza state com tarefa atual                                         │
│    → Envia mensagens de progresso no chat                                    │
│    → Ao concluir: limpa state, salva execução no histórico                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Tratamento de Erros

### 11.1 Reconexão Automática

- Backoff exponencial: 5s → 10s → 20s → 40s...
- Máximo de 10 tentativas
- Reconecta automaticamente em caso de disconnect/kick

### 11.2 Timeout de Tarefas

- Timeout padrão: 30 minutos (configurável)
- Auto-cancela tarefa se exceder
- Notifica via chat

### 11.3 Fallback de Provider LLM

- Rate limit (429): aguarda `retry-after` segundos
- Erro de auth (401/403): desabilita provider permanentemente
- Erro de servidor (5xx): tenta próximo provider
- Timeout de conexão: retry após 3s

### 11.4 Sandbox de Execução

- Timeout de 30 segundos
- Sem acesso a: filesystem, network, process, require
- Apenas: bot, params, console limitado, Math, Date

### 11.5 Falha Total de Providers LLM

Quando **todos** os providers falham:

```javascript
async function handleTotalLLMFailure() {
  // 1. Responde no chat
  bot.chat('Não consegui processar o comando. Tente novamente em alguns segundos.');

  // 2. Registra erro no log
  logger.error('Todos os providers LLM falharam', {
    timestamp: new Date(),
    failedProviders: ['primary', 'secondary', 'codeModel']
  });

  // 3. Aguarda 5 segundos
  await sleep(5000);

  // 4. Mantém state atual (não limpa tarefa em andamento)
  // 5. Reabilita providers gradualmente
}
```

### 11.6 Concorrência de Comandos

Modelo de tarefa única (single-task):

```javascript
// Regras de concorrência:
// 1. Comandos com prefixo `!` têm prioridade sobre tarefas longas
// 2. `!stop` pode interromper qualquer tarefa (independentemente do jogador)
// 3. Novo comando substitui tarefa atual
// 4. Bot anuncia no chat: "Interrompendo tarefa anterior..."

async function handleNewCommand(parsed, username) {
  const highPriority = ['pare', 'stop', 'fuja', 'escape'];

  // Comandos de alta prioridade sempre interrompem
  if (highPriority.includes(parsed.intent)) {
    logger.info(`Interrupção de prioridade alta: ${parsed.intent}`);
    await state.clearTask();
    bot.chat('Interrompendo tarefa atual!');
    return true;
  }

  // Se ocupado, aguarda ou rejeita
  if (state.isBusy()) {
    bot.chat(`Estou ocupado com: ${state.currentTask.type}. Use '!stop' para interromper.`);
    return false;
  }

  return true;
}
```

### 11.7 Estado Durante Morte/Respawn

```javascript
// Em state.js

handleDeath() {
  // Salva tarefa atual antes do respawn
  this.lastTask = this.currentTask;
  this.currentTask = null;

  // Limpa estado de seguimento
  this.following = null;

  // Emite evento para re-planejamento
  logger.info('Bot morreu. Tarefa salva para possível retomada.');
}

restoreAfterRespawn() {
  // Notifica jogador do estado
  if (this.lastTask) {
    bot.chat(`Morri durante: ${this.lastTask.type}. Deseja retomar? Use '!continuar'`);
  }
}
```

### 11.8 Recuperação de Skills Dinâmicas Corrompidas

Se uma skill dinâmica falhar ao carregar:

```javascript
function handleCorruptedSkill(filePath, error) {
  // 1. Move arquivo corrompido para diretório de falhas
  const failedDir = './skills/dynamic/failed/';
  fs.renameSync(filePath, path.join(failedDir, path.basename(filePath)));

  // 2. Registra erro no log
  logger.error(`Skill corrompida: ${filePath}`, error);

  // 3. Remove entrada do banco de dados
  db.prepare('DELETE FROM skills_metadata WHERE file_path = ?').run(filePath);

  // 4. Continua operação normal
  logger.info('Skill removida. Operação continuará normalmente.');
}
```

---

## 12. Dependências NPM

```json
{
  "dependencies": {
    "mineflayer": "^4.0.0",
    "mineflayer-pathfinder": "^2.0.0",
    "mineflayer-collectblock": "^1.0.0",
    "prismarine-viewer": "^1.0.0",
    "better-sqlite3": "^9.0.0",
    "sqlite-vec": "^0.1.0",
    "@huggingface/transformers": "^3.0.0",
    "@google/generative-ai": "^0.1.0",
    "openai": "^4.0.0",
    "isolated-vm": "^4.0.0",
    "uuid": "^9.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

---

## 14. Gerenciamento de Custos

### 14.1 Rastreamento de Uso

```javascript
class CostTracker {
  constructor() {
    this.usage = {
      totalTokens: { input: 0, output: 0 },
      byProvider: {},
      byDay: {}
    };
  }

  trackUsage(provider, model, inputTokens, outputTokens) {
    // Contagem total
    this.usage.totalTokens.input += inputTokens;
    this.usage.totalTokens.output += outputTokens;

    // Por provider
    if (!this.usage.byProvider[provider]) {
      this.usage.byProvider[provider] = { input: 0, output: 0 };
    }
    this.usage.byProvider[provider].input += inputTokens;
    this.usage.byProvider[provider].output += outputTokens;

    // Por dia
    const today = new Date().toISOString().slice(0, 10);
    if (!this.usage.byDay[today]) {
      this.usage.byDay[today] = { input: 0, output: 0 };
    }
    this.usage.byDay[today].input += inputTokens;
    this.usage.byDay[today].output += outputTokens;
  }

  getDailyCost() {
    const today = new Date().toISOString().slice(0, 10);
    const usage = this.usage.byDay[today] || { input: 0, output: 0 };
    // Estimativa de custo (varia por provider)
    return {
      inputTokens: usage.input,
      outputTokens: usage.output,
      estimatedCost: this.calculateCost(usage.input, usage.output)
    };
  }
}
```

### 14.2 Rate Limiting

```javascript
// Configuração de rate limiting
const RATE_LIMITS = {
  maxRequestsPerMinute: 10,
  maxRequestsPerHour: 100,
  maxTokensPerDay: 500000
};

class RateLimiter {
  constructor(limits) {
    this.limits = limits;
    this.requests = { minute: [], hour: [] };
    this.tokensToday = 0;
  }

  canMakeRequest() {
    const now = Date.now();

    // Limpa requisições antigas
    this.requests.minute = this.requests.minute.filter(t => now - t < 60000);
    this.requests.hour = this.requests.hour.filter(t => now - t < 3600000);

    // Verifica limites
    if (this.requests.minute.length >= this.limits.maxRequestsPerMinute) {
      return { allowed: false, reason: 'Limite por minuto atingido' };
    }
    if (this.requests.hour.length >= this.limits.maxRequestsPerHour) {
      return { allowed: false, reason: 'Limite por hora atingido' };
    }
    if (this.tokensToday >= this.limits.maxTokensPerDay) {
      return { allowed: false, reason: 'Limite diário de tokens atingido' };
    }

    return { allowed: true };
  }

  recordRequest(tokensUsed) {
    const now = Date.now();
    this.requests.minute.push(now);
    this.requests.hour.push(now);
    this.tokensToday += tokensUsed;
  }

  resetDaily() {
    this.tokensToday = 0;
  }
}
```

### 14.3 Alertas de Custo

```javascript
// Alertas configuráveis
const COST_ALERTS = {
  daily: [
    { threshold: 0.50, message: 'Custo diário: $0.50' },
    { threshold: 1.00, message: 'Custo diário: $1.00' },
    { threshold: 5.00, message: 'ALERTA: Custo diário acima de $5!' }
  ]
};

function checkCostAlerts(cost) {
  for (const alert of COST_ALERTS.daily) {
    if (cost >= alert.threshold) {
      logger.warn(alert.message);
      // Opcional: enviar notificação via webhook
    }
  }
}
```

---

## 15. Dependências Nativas (Windows)

### 15.1 better-sqlite3

**Aviso:** `better-sqlite3` requer compilação nativa.

**Windows:** Requer Visual Studio Build Tools

```bash
# Instalar Build Tools
npm install --global windows-build-tools

# Ou usar alternativa WebAssembly
npm install sql.js  # Mais lento, mas sem dependências nativas
```

### 15.2 isolated-vm

**Aviso:** `isolated-vm` também requer compilação nativa.

```bash
# Verificar se compilação funciona
npm rebuild isolated-vm

# Se falhar, usar alternativa Node.js built-in
# Nota: vm module é menos seguro, requer validação extra
```

---

## 16. Próximos Passos

Após aprovação deste design:

1. **Criar plano de implementação** (via writing-plans skill)
2. **Setup inicial do projeto** (npm init, dependências)
3. **Implementar Core Layer** (bot.js, state.js, commands.js)
4. **Implementar Memory Layer** (database, embeddings, RAG)
5. **Implementar LLM Layer** (providers, router)
6. **Implementar Skills Base** (walk, mine, collect, etc.)
7. **Implementar Skills Executor** (sandbox)
8. **Testes integrados**
9. **Documentação de uso**

---

**Documento aprovado em:** 2026-03-17
**Local:** `D:/Users/luanv/OneDrive/Área de Trabalho/GAMES/Trabalhos/ClawMC/`