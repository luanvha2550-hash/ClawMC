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

  if (similar.confidence > 0.85) {
    // Skill encontrada localmente → executa sem LLM
    return await skills.execute(similar.skill, parsed.args);
  }

  // DECIDE: Nenhuma skill local → consulta LLM
  const llmResponse = await router.generate(parsed);

  // ACT: Executa resposta ou novo skill
  return await executeResponse(llmResponse);
}
```

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
    started: "2024-03-17T...",
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
-- Skills aprendidas (código gerado)
CREATE VIRTUAL TABLE skills_vss USING vec0(
  embedding FLOAT[384],
  name TEXT,
  description TEXT,
  file_path TEXT,
  created_at DATETIME
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
| **Google** | gemini-1.5-flash, gemini-1.5-pro, gemini-2.5-flash, gemini-3.1-flash-lite-preview, gemini-3-flash-preview | GoogleProvider |
| **NVIDIA NIM** | deepseek-ai/deepseek-v3.2, minimaxai/minimax-m2.1, nvidia/nemotron-nano-12b-v2-vl, stepfun-ai/step-3.5-flash, z-ai/glm4.7 | OpenAICompatProvider |
| **OpenRouter** | claude-3-haiku, gpt-4o-mini, stepfun/step-3.5-flash:free, gemini-2.5-flash, gemini-3-flash-preview | OpenAICompatProvider |
| **Ollama Cloud** | gemini-3-flash-preview, glm-4.7, minimax-m2.1, nemotron-3-nano:30b, qwen3.5, kimi-k2.5, rnj-1 | OpenAICompatProvider |
| **OpenAI** | gpt-4o-mini, gpt-4o, gpt-3.5-turbo | OpenAICompatProvider |

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
│    → Salva em skills/dynamic/construir_casa_2024-03-17.js                    │
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
    "vm2": "^3.9.0",
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

## 13. Próximos Passos

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