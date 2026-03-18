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
| **Embeddings: Híbrido (local + API)** | Padrão multilíngue local, opção de API para maior precisão |
| **Skills: Dinâmicas + Base** | Aprendizado contínuo com fundação de habilidades pré-definidas |
| **Autonomia: Voyager + OpenClaw** | Currículo automático + agendamento cron para comportamento proativo |

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
│  │  │(local+API)│  │(sqlite-vec)│  │ Manager │  │(SQLite) │    │ │
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
│  │                    AUTONOMY LAYER (Voyager+OpenClaw)           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │ │
│  │  │Curriculum│  │  Idle   │  │Scheduler │  │ Survival │       │ │
│  │  │ Manager  │  │  Loop   │  │  (Cron)  │  │ Monitor  │       │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │ │
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

### 2.2 Autonomia (Voyager + OpenClaw)

O bot possui **comportamento proativo** baseado em três sistemas:

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO DE AUTONOMIA                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Quando IDLE por 30 segundos:                                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. SURVIVAL CHECK                                        │    │
│  │    if (fome < 10) → buscar comida                        │    │
│  │    if (vida < 10) → fugir/regenerar                      │    │
│  │    if (perigo) → defender ou escapar                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. SCHEDULED TASKS (Cron)                                │    │
│  │    Patrulhar base (a cada 5min)                          │    │
│  │    Colher plantações (ao amanhecer)                      │    │
│  │    Verificar baús (a cada 30min)                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. CURRICULUM (Voyager)                                  │    │
│  │    Avalia fase atual: survival → gathering → exploration │    │
│  │    Gera próximo objetivo autônomo                         │    │
│  │    Ex: "Explorar novo chunk", "Minerar ferro",           │    │
│  │        "Aprender skill: fazer ferramentas"               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. EXECUÇÃO                                              │    │
│  │    Executa objetivo → Salva resultado → Volta ao idle    │    │
│  │    (Interrompe se jogador der comando)                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Resultado:** O bot pode operar autonomous por horas, coletando recursos, explorando, aprendendo novas habilidades e organizando baús.

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
│   │   ├── state.js             # Estado do bot (tarefa atual, timeout)
│   │   ├── curriculum.js        # Gerenciador de currículo (Voyager)
│   │   ├── idle.js              # Loop de autonomia
│   │   ├── scheduler.js         # Tarefas agendadas (cron)
│   │   └── survival.js          # Monitor de sobrevivência
│   │
│   ├── memory/
│   │   ├── embeddings.js        # Sistema híbrido (local + API)
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
│   │   │   ├── escape.js         # Fugir de perigo
│   │   │   ├── find_food.js      # Encontrar comida
│   │   │   ├── explore.js        # Explorar chunks
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

### 5.2 `embeddings.js` - Sistema Híbrido (Local + API)

**Função:** Gera embeddings para busca semântica

**Modo padrão:** Local (sem custo de API)
**Modo opcional:** API (maior precisão)

#### 5.2.1 Comparação de Modelos

| Modelo | Idiomas | RAM | Latência | PT-BR Score | Custo |
|--------|---------|-----|----------|-------------|-------|
| **Local: multilingual-e5-small** | 100+ | ~250MB | ~70ms | ✅ 88% | Zero |
| **Local: paraphrase-multilingual-MiniLM-L12** | 50+ | ~250MB | ~80ms | ✅ 85% | Zero |
| **API: Gemini Embedding-001** | 100+ | Zero | ~200ms | ✅ 95% | Free tier |
| **API: NVIDIA NV-Embed** | 100+ | Zero | ~300ms | ✅ 95% | Free tier |

**Recomendação:** `multilingual-e5-small` (local) como padrão, com opção de API.

#### 5.2.2 Implementação Híbrida

```javascript
// memory/embeddings.js

class EmbeddingsManager {
  constructor(config) {
    this.mode = config?.mode || 'local';
    this.localModel = null;
    this.apiProvider = null;
    this.cache = new Map(); // Cache de embeddings
    this.maxCacheSize = 1000;
  }

  async init() {
    if (this.mode === 'local') {
      await this.initLocalModel();
    } else {
      await this.initApiProvider();
    }
  }

  // ========== MODO LOCAL ==========

  async initLocalModel() {
    logger.info('[Embeddings] Carregando modelo local multilíngue...');

    const { pipeline } = await import('@huggingface/transformers');

    this.localModel = await pipeline('feature-extraction',
      'Xenova/multilingual-e5-small', {
        quantized: true
      }
    );

    logger.info('[Embeddings] Modelo carregado (~250MB RAM)');
  }

  async vectorizeLocal(text) {
    if (!this.localModel) await this.initLocalModel();

    const tensor = await this.localModel(text, {
      pooling: 'mean',
      normalize: true
    });

    return Array.from(tensor.data);
  }

  // ========== MODO API ==========

  async initApiProvider() {
    const config = global.config.embeddings.api;

    if (config.provider === 'google') {
      this.apiProvider = 'google';
    } else if (config.provider === 'nvidia') {
      this.apiProvider = 'nvidia';
    } else {
      throw new Error(`Provider de embedding não suportado: ${config.provider}`);
    }
  }

  async vectorizeApi(text) {
    // Google Gemini Embedding API
    if (this.apiProvider === 'google') {
      return await this.vectorizeGoogle(text);
    }

    // NVIDIA NV-Embed API
    if (this.apiProvider === 'nvidia') {
      return await this.vectorizeNvidia(text);
    }
  }

  async vectorizeGoogle(text) {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Google Embedding API error: ${data.error?.message}`);
    }

    return data.embedding.values;
  }

  async vectorizeNvidia(text) {
    const response = await fetch(
      'https://integrate.api.nvidia.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'nvidia/nv-embed-v1',
          input: text,
          input_type: 'query'
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`NVIDIA Embedding API error: ${data.error?.message}`);
    }

    return data.data[0].embedding;
  }

  // ========== INTERFACE PRINCIPAL ==========

  async vectorize(text) {
    // Verifica cache
    const cacheKey = `${this.mode}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Gera embedding
    let embedding;
    if (this.mode === 'local') {
      embedding = await this.vectorizeLocal(text);
    } else {
      embedding = await this.vectorizeApi(text);
    }

    // Armazena em cache
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  // Gerenciamento de memória (modo local)
  scheduleUnload() {
    if (this.unloadTimeout) clearTimeout(this.unloadTimeout);

    this.unloadTimeout = setTimeout(() => {
      if (Date.now() - this.lastUsed > 300000) { // 5 minutos
        logger.info('[Embeddings] Descarregando modelo para liberar memória');
        this.localModel = null;
      }
    }, 300000);
  }
}

export default EmbeddingsManager;
```

#### 5.2.3 Configuração (`config.json`)

```json
{
  "memory": {
    "dbPath": "./data/brain.db",
    "similarityThreshold": 0.85,

    "embeddings": {
      "mode": "local",

      "local": {
        "model": "Xenova/multilingual-e5-small",
        "quantized": true,
        "maxCacheSize": 1000
      },

      "api": {
        "provider": "google",
        "google": {
          "model": "gemini-embedding-001",
          "apiKey": "${GOOGLE_API_KEY}"
        },
        "nvidia": {
          "model": "nvidia/nv-embed-v1",
          "apiKey": "${NVIDIA_API_KEY}"
        }
      }
    }
  }
}
```

#### 5.2.4 Vantagens de Cada Modo

**Modo Local:**
- ✅ Zero custo
- ✅ Funciona offline
- ✅ Privacidade total
- ❌ Usa ~250MB RAM
- ❌ Inferência mais lenta (CPU)

**Modo API:**
- ✅ Zero RAM
- ✅ Maior precisão
- ✅ Inferência rápida
- ❌ Requer internet
- ❌ Dados enviados à API
- ❌ Limite de free tier

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

### 5.5 Skill Documentation Embedding

**Problema:** Skills são salvas apenas com código, mas a busca semântica precisa de descrição textual para encontrar skills por significado.

**Solução:** Gerar documentação descritiva e embeddings para cada skill aprendida.

```javascript
// memory/skillDocs.js

class SkillDocumentation {
  constructor(embeddings, database) {
    this.embeddings = embeddings;
    this.db = database;
  }

  // Gera documentação para skill aprendida
  async generateDocumentation(skillCode, task, result) {
    // Extrai informações da task e resultado
    const doc = {
      name: this.generateName(skillCode, task),
      description: await this.generateDescription(skillCode, task, result),
      parameters: this.extractParameters(skillCode),
      returns: this.extractReturns(skillCode, result),
      examples: this.generateExamples(task),
      tags: this.extractTags(task, skillCode)
    };

    // Gera embedding da descrição
    doc.embedding = await this.embeddings.vectorize(doc.description);

    return doc;
  }

  // Gera nome descritivo para a skill
  generateName(code, task) {
    // Extrai verbo principal da task
    const verbs = {
      'construir': 'build',
      'minerar': 'mine',
      'coletar': 'collect',
      'explorar': 'explore',
      'craftar': 'craft',
      'guardar': 'store'
    };

    const verb = task.intent?.toLowerCase() || 'task';
    const object = task.action?.toLowerCase() || 'item';

    const action = verbs[verb] || verb;
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    return `${action}_${object}_${timestamp}`;
  }

  // Gera descrição semântica
  async generateDescription(code, task, result) {
    // Análise do código + task + resultado
    const parts = [];

    // O que a skill faz
    parts.push(`Skill que ${task.intent || 'executa'} ${task.action || 'tarefa'}`);

    // Parâmetros usados
    if (task.material) parts.push(`usando ${task.material}`);
    if (task.dimensions) parts.push(`com dimensões ${task.dimensions.width}x${task.dimensions.length}`);

    // Condições
    if (code.includes('findBlock')) parts.push('encontra blocos específicos');
    if (code.includes('pathfinder')) parts.push('navega automaticamente');
    if (code.includes('dig')) parts.push('minera blocos');
    if (code.includes('craft')) parts.push('crafta itens');

    // Resultado
    if (result.success) {
      parts.push(`com sucesso em ${result.duration}ms`);
    }

    return parts.join('. ') + '.';
  }

  // Extrai parâmetros do código
  extractParameters(code) {
    const params = [];
    const paramMatch = code.match(/params\.(\w+)/g);

    if (paramMatch) {
      paramMatch.forEach(p => {
        const name = p.replace('params.', '');
        params.push({ name, type: 'any' });
      });
    }

    return params;
  }

  // Extrai tipo de retorno
  extractReturns(code, result) {
    if (result.success) {
      return {
        type: 'object',
        properties: Object.keys(result.data || {})
      };
    }
    return { type: 'unknown' };
  }

  // Gera exemplos de uso
  generateExamples(task) {
    const examples = [];

    // Exemplo baseado na task original
    examples.push({
      command: `!${task.intent} ${task.action || ''}`.trim(),
      description: task.raw || ''
    });

    return examples;
  }

  // Extrai tags para busca
  extractTags(task, code) {
    const tags = new Set();

    // Tags da task
    if (task.intent) tags.add(task.intent.toLowerCase());
    if (task.action) tags.add(task.action.toLowerCase());
    if (task.material) tags.add(task.material.toLowerCase());

    // Tags do código
    if (code.includes('mine')) tags.add('mining');
    if (code.includes('build')) tags.add('building');
    if (code.includes('craft')) tags.add('crafting');
    if (code.includes('collect')) tags.add('gathering');
    if (code.includes('explore')) tags.add('exploration');

    return Array.from(tags);
  }

  // Salva skill com documentação
  async saveSkill(skillCode, task, result) {
    const doc = await this.generateDocumentation(skillCode, task, result);

    // Salva código em arquivo
    const filename = `./skills/dynamic/${doc.name}.js`;
    await fs.writeFile(filename, skillCode);

    // Salva metadados no banco
    await this.db.run(`
      INSERT INTO skills_metadata (name, description, file_path, parameters, returns, examples, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [doc.name, doc.description, filename, JSON.stringify(doc.parameters),
        JSON.stringify(doc.returns), JSON.stringify(doc.examples),
        JSON.stringify(doc.tags), Date.now()]);

    // Salva embedding na tabela vetorial
    await this.db.run(`
      INSERT INTO skills_vss (rowid, embedding)
      VALUES (?, ?)
    `, [this.db.lastInsertRowId, JSON.stringify(doc.embedding)]);

    logger.info(`[SkillDoc] Skill salva: ${doc.name}`);
    return doc;
  }

  // Busca skill por descrição semântica
  async findByDescription(query) {
    const queryEmbedding = await this.embeddings.vectorize(query);

    const results = await this.db.all(`
      SELECT sm.name, sm.description, sm.file_path, sm.tags,
             vec_distance_cosine(sv.embedding, ?) as distance
      FROM skills_metadata sm
      JOIN skills_vss sv ON sm.rowid = sv.rowid
      ORDER BY distance ASC
      LIMIT 5
    `, [JSON.stringify(queryEmbedding)]);

    return results;
  }
}
```

**Exemplo de uso:**

```javascript
// Após LLM gerar skill com sucesso
const skillDoc = new SkillDocumentation(embeddings, db);
await skillDoc.saveSkill(generatedCode, task, result);

// Buscar skill similar depois
const similar = await skillDoc.findByDescription("como faço uma casa de pedra?");
// Retorna: [{ name: "build_house_20260317", description: "Skill que constrói casa...", distance: 0.12 }]
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

### 6.3.2 Dynamic Turn Limits (Prevenção de Loop)

**Problema:** Quando o LLM gera código com erro, ele pode entrar em loop infinito tentando corrigir, gastando tokens indefinidamente.

**Solução:** Limite rígido de tentativas de correção com escalarção.

```javascript
// skills/turnLimiter.js

class DynamicTurnLimiter {
  constructor(config) {
    this.maxAttempts = config?.maxAttempts || 3;        // Máximo de tentativas
    this.currentAttempts = 0;
    this.errorHistory = [];
    this.escalationThreshold = config?.escalationThreshold || 2;
  }

  // Inicia nova geração de skill
  startGeneration(task) {
    this.currentAttempts = 0;
    this.errorHistory = [];
    this.task = task;
  }

  // Verifica se pode tentar novamente
  canRetry(error) {
    this.currentAttempts++;
    this.errorHistory.push({
      attempt: this.currentAttempts,
      error: error.message,
      timestamp: Date.now()
    });

    // Verifica se mesmo tipo de erro se repete
    const sameErrorCount = this.errorHistory
      .filter(e => e.error === error.message)
      .length;

    // Se mesmo erro 2+ vezes, provavelmente não vai resolver
    if (sameErrorCount >= 2) {
      logger.warn(`[TurnLimiter] Erro repetitivo detectado: ${error.message}`);
      return false;
    }

    // Limite absoluto
    if (this.currentAttempts >= this.maxAttempts) {
      logger.warn(`[TurnLimiter] Limite de ${this.maxAttempts} tentativas atingido`);
      return false;
    }

    return true;
  }

  // Gera contexto de erro para re-prompt
  generateErrorContext() {
    return {
      task: this.task,
      attempts: this.currentAttempts,
      errors: this.errorHistory,
      lastError: this.errorHistory[this.errorHistory.length - 1]
    };
  }

  // Ação quando limite atingido
  handleLimitReached() {
    // 1. Notifica jogador
    const errorMessage = this.errorHistory.length > 0
      ? `Não consegui executar após ${this.currentAttempts} tentativas. Último erro: ${this.errorHistory[0].error}`
      : `Não consegui executar após ${this.currentAttempts} tentativas.`;

    // 2. Registra para aprendizado futuro
    this.logFailure();

    // 3. Retorna erro estruturado
    return {
      success: false,
      reason: 'turn_limit_reached',
      message: errorMessage,
      attempts: this.currentAttempts,
      shouldFallback: this.shouldUseFallback()
    };
  }

  // Verifica se deve usar fallback (skill base similar)
  shouldUseFallback() {
    // Se tentou 2+ vezes, busca skill base similar
    return this.currentAttempts >= this.escalationThreshold;
  }

  // Log para análise futura
  logFailure() {
    // Salva no banco para análise
    // TODO: Implementar log estruturado
    logger.error('[TurnLimiter] Falha registrada', {
      task: this.task,
      attempts: this.currentAttempts,
      errors: this.errorHistory
    });
  }
}
```

**Fluxo com Turn Limiter:**

```
Tentativa 1: LLM gera código → Executa → ERRO
             ↓
             TurnLimiter.canRetry() → true
             ↓
Tentativa 2: LLM re-genera com contexto do erro → Executa → ERRO
             ↓
             TurnLimiter.canRetry() → true (mesmo erro detectado)
             ↓
             TurnLimiter verifica: mesmo erro 2x → false
             ↓
             handleLimitReached() → Notifica jogador
             ↓
             Busca skill base similar como fallback
```

**Configuração:**

```json
{
  "skills": {
    "maxAttempts": 3,
    "escalationThreshold": 2,
    "logFailures": true
  }
}
```

### 6.4 `registry.js` - Registro de Skills

**Métodos:**
- `loadBaseSkills()` - carrega do diretório
- `loadDynamicSkills()` - carrega do banco
- `register(skill, isBase)` - registra nova skill
- `findSimilar(description)` - busca por embedding

---

## 7. Autonomy Layer (Voyager + OpenClaw)

O bot possui comportamento proativo através de três subsistemas: **Curriculum Manager** (objetivos automáticos), **Idle Loop** (execução quando ocioso) e **Scheduler** (tarefas agendadas).

### 7.1 `curriculum.js` - Gerenciador de Currículo

**Inspirado no Voyager:** O bot avalia seu próprio estado e gera objetivos automaticamente.

```javascript
// Fases do currículo
const CURRICULUM_PHASES = {
  // Fase 1: Sobrevivência básica
  survival: [
    { skill: 'collect_wood', trigger: 'inventory.wood < 16', priority: 10 },
    { skill: 'craft_tools', trigger: 'no_pickaxe && no_axe', priority: 9 },
    { skill: 'find_food', trigger: 'food < 10', priority: 10 },
    { skill: 'build_shelter', trigger: 'night_coming && no_shelter', priority: 8 }
  ],

  // Fase 2: Coleta de recursos
  gathering: [
    { skill: 'mine_stone', trigger: 'inventory.stone < 32', priority: 7 },
    { skill: 'mine_iron', trigger: 'has_iron_pickaxe && inventory.iron < 16', priority: 6 },
    { skill: 'smelt_ores', trigger: 'has_furnace && has_raw_ores', priority: 5 },
    { skill: 'store_resources', trigger: 'inventory.full', priority: 8 }
  ],

  // Fase 3: Exploração
  exploration: [
    { skill: 'explore_chunk', trigger: 'unexplored_chunks_nearby', priority: 4 },
    { skill: 'map_location', trigger: 'interesting_location_found', priority: 3 },
    { skill: 'find_village', trigger: 'days > 1 && !found_village', priority: 3 },
    { skill: 'discover_biomes', trigger: 'biomes_discovered < 5', priority: 2 }
  ],

  // Fase 4: Avançado
  advanced: [
    { skill: 'mine_diamonds', trigger: 'has_iron_pickaxe && inventory.diamond < 5', priority: 5 },
    { skill: 'enchant_tools', trigger: 'has_enchanting_table && levels > 30', priority: 4 },
    { skill: 'build_farm', trigger: 'has_farmland_nearby && !has_farm', priority: 3 }
  ]
};

class CurriculumManager {
  constructor(state, memory) {
    this.state = state;
    this.memory = memory;
    this.currentPhase = 'survival';
    this.learnedSkills = new Set();
  }

  // Determina fase atual baseado em progresso
  getCurrentPhase() {
    if (!this.hasBasicTools()) return 'survival';
    if (this.needsGathering()) return 'gathering';
    if (this.needsExploration()) return 'exploration';
    return 'advanced';
  }

  // Retorna próximo objetivo autônomo
  getNextGoal() {
    const phase = this.getCurrentPhase();
    const goals = CURRICULUM_PHASES[phase];

    // Ordena por prioridade
    const activeGoals = goals
      .filter(g => this.evaluateTrigger(g.trigger))
      .sort((a, b) => b.priority - a.priority);

    if (activeGoals.length === 0) return null;

    return activeGoals[0];
  }

  // Avalia condição de gatilho
  evaluateTrigger(trigger) {
    // Parser de expressões como 'inventory.wood < 16'
    const inventory = this.state.getInventory();
    const position = this.state.getPosition();
    const worldState = this.state.getWorldState();

    // Implementação do parser de triggers...
    return evaluateTriggerExpression(trigger, { inventory, position, worldState });
  }

  // Marca skill como aprendida
  markLearned(skillName) {
    this.learnedSkills.add(skillName);
  }
}
```

### 7.2 `idle.js` - Idle Loop

**Loop principal de autonomia:** Executado quando o bot está sem tarefas.

```javascript
class IdleLoop {
  constructor(curriculum, scheduler, survivalMonitor, state) {
    this.curriculum = curriculum;
    this.scheduler = scheduler;
    this.survival = survivalMonitor;
    this.state = state;
    this.idleTimeout = 30000; // 30 segundos
    this.lastActivity = Date.now();
  }

  // Verifica se deve iniciar ação autônoma
  async tick() {
    // Ignora se ocupado
    if (this.state.isBusy()) {
      this.lastActivity = Date.now();
      return;
    }

    // Verifica tempo idle
    const idleTime = Date.now() - this.lastActivity;
    if (idleTime < this.idleTimeout) return;

    // 1. Verifica sobrevivência (prioridade máxima)
    const survivalGoal = await this.survival.check();
    if (survivalGoal) {
      logger.info(`[Autonomia] Sobrevivência: ${survivalGoal.name}`);
      await this.executeGoal(survivalGoal);
      return;
    }

    // 2. Verifica tarefas agendadas
    const scheduledTask = this.scheduler.getNextTask();
    if (scheduledTask) {
      logger.info(`[Autonomia] Agendada: ${scheduledTask.name}`);
      await this.executeGoal(scheduledTask);
      return;
    }

    // 3. Verifica currículo (Voyager)
    const curriculumGoal = this.curriculum.getNextGoal();
    if (curriculumGoal) {
      logger.info(`[Autonomia] Currículo: ${curriculumGoal.skill}`);
      await this.executeGoal(curriculumGoal);
      return;
    }

    // Nada a fazer
    logger.debug('[Autonomia] Nenhum objetivo ativo');
  }

  // Executa objetivo autônomo
  async executeGoal(goal) {
    try {
      this.state.setTask({
        type: goal.skill,
        source: 'autonomous',
        started: Date.now()
      });

      // Busca skill existente ou gera nova
      const skill = await this.findOrGenerateSkill(goal);

      if (skill) {
        await skill.execute(this.state.bot, goal.params);
        this.curriculum.markLearned(goal.skill);
      }
    } catch (error) {
      logger.error(`[Autonomia] Falha em ${goal.skill}:`, error);
    } finally {
      this.state.clearTask();
      this.lastActivity = Date.now();
    }
  }
}
```

### 7.3 `scheduler.js` - Tarefas Agendadas (Cron)

**Sistema OpenClaw-style:** Tarefas periódicas configuráveis.

```javascript
import cron from 'node-cron';

const DEFAULT_SCHEDULED_TASKS = [
  // Patrulha a base a cada 5 minutos
  { name: 'patrol_base', cron: '*/5 * * * *', enabled: true },

  // Colhe plantações ao amanhecer (Minecraft: tick 0)
  { name: 'harvest_crops', cron: '0 6 * * *', enabled: true },

  // Verifica baús a cada 30 minutos
  { name: 'check_chests', cron: '*/30 * * * *', enabled: true },

  // Organiza inventário quando cheio
  { name: 'organize_inventory', cron: '*/10 * * * *', enabled: true },

  // Explora novos chunks a cada 15 minutos (se idle)
  { name: 'explore_chunks', cron: '*/15 * * * *', enabled: true }
];

class TaskScheduler {
  constructor(state, skills) {
    this.state = state;
    this.skills = skills;
    this.scheduledJobs = new Map();
    this.tasks = [];
  }

  // Carrega tarefas da configuração
  loadFromConfig(config) {
    this.tasks = config.autonomy?.scheduledTasks || DEFAULT_SCHEDULED_TASKS;
  }

  // Inicia todas as tarefas agendadas
  start() {
    for (const task of this.tasks) {
      if (task.enabled) {
        this.schedule(task);
      }
    }
    logger.info(`[Scheduler] ${this.scheduledJobs.size} tarefas agendadas`);
  }

  // Agenda uma tarefa
  schedule(task) {
    const job = cron.schedule(task.cron, async () => {
      // Só executa se bot estiver idle
      if (!this.state.isBusy()) {
        logger.info(`[Scheduler] Executando: ${task.name}`);
        await this.executeScheduledTask(task);
      }
    });

    this.scheduledJobs.set(task.name, job);
  }

  // Para uma tarefa
  stop(taskName) {
    const job = this.scheduledJobs.get(taskName);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(taskName);
    }
  }

  // Para todas as tarefas
  stopAll() {
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
  }
}
```

### 7.4 `survival.js` - Monitor de Sobrevivência

**Prioridade máxima:** O bot sempre verifica sobrevivência antes de qualquer ação autônoma.

```javascript
class SurvivalMonitor {
  constructor(bot, state, config) {
    this.bot = bot;
    this.state = state;
    this.thresholds = config.autonomy?.survival || {
      minFood: 10,
      minHealth: 10,
      maxDanger: 3 // número de mobs hostis próximos
    };
  }

  // Verifica condições de sobrevivência
  async check() {
    const food = this.bot.food;
    const health = this.bot.health;
    const nearbyHostiles = this.countHostileMobs();

    // Fome crítica
    if (food < this.thresholds.minFood) {
      return {
        skill: 'find_food',
        priority: 10,
        reason: `Fome crítica: ${food}/20`,
        params: { minFood: this.thresholds.minFood }
      };
    }

    // Vida crítica
    if (health < this.thresholds.minHealth) {
      return {
        skill: 'regenerate',
        priority: 10,
        reason: `Vida crítica: ${health}/20`,
        params: { minHealth: this.thresholds.minHealth }
      };
    }

    // Perigo próximo
    if (nearbyHostiles > this.thresholds.maxDanger) {
      return {
        skill: 'escape_danger',
        priority: 10,
        reason: `${nearbyHostiles} mobs hostis próximos`,
        params: { hostiles: nearbyHostiles }
      };
    }

    // Tudo ok
    return null;
  }

  // Conta mobs hostis próximos
  countHostileMobs() {
    const entities = Object.values(this.bot.entities);
    const hostiles = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman'];

    return entities.filter(e =>
      hostiles.some(h => e.name?.includes(h)) &&
      e.position.distanceTo(this.bot.entity.position) < 20
    ).length;
  }
}
```

### 7.5 Configuração de Autonomia

```json
{
  "autonomy": {
    "enabled": true,
    "idleTimeout": 30000,

    "survival": {
      "minFood": 10,
      "minHealth": 10,
      "maxDanger": 3
    },

    "curriculum": {
      "enabled": true,
      "phases": ["survival", "gathering", "exploration", "advanced"],
      "autoProgress": true
    },

    "scheduledTasks": [
      { "name": "patrol_base", "cron": "*/5 * * * *", "enabled": true },
      { "name": "harvest_crops", "cron": "0 6 * * *", "enabled": true },
      { "name": "check_chests", "cron": "*/30 * * * *", "enabled": true },
      { "name": "organize_inventory", "cron": "*/10 * * * *", "enabled": true },
      { "name": "explore_chunks", "cron": "*/15 * * * *", "enabled": true }
    ],

    "rules": [
      "Manter inventário organizado",
      "Guardar itens valiosos no baú",
      "Não minerar em áreas protegidas",
      "Fugir de creepers"
    ]
  }
}
```

### 7.6 Diretório Atualizado

```
src/
├── core/
│   ├── bot.js
│   ├── ooda.js
│   ├── commands.js
│   ├── state.js
│   ├── curriculum.js      # NOVO: Gerenciador de currículo
│   ├── idle.js            # NOVO: Loop de autonomia
│   ├── scheduler.js       # NOVO: Tarefas agendadas (cron)
│   └── survival.js        # NOVO: Monitor de sobrevivência
│
├── ... (resto da estrutura)
```

---

## 8. LLM Layer

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

### 7.4 Semantic Snapshots (Redução de Contexto)

**Problema:** Enviar todo o histórico de conversa para o LLM consome muitos tokens e custa caro.

**Solução:** Semantic Snapshots transmitem apenas informações vitais do momento atual.

```javascript
// llm/snapshots.js

class SemanticSnapshot {
  constructor(bot, state, memory) {
    this.bot = bot;
    this.state = state;
    this.memory = memory;
  }

  // Gera snapshot compacto do estado atual
  generate() {
    return {
      // Posição e ambiente
      position: this.bot.entity.position,
      dimension: this.bot.game.dimension,
      time: this.bot.time.day,

      // Estado do bot
      health: this.bot.health,
      food: this.bot.food,
      inventory: this.compactInventory(),

      // Entidades próximas (apenas as relevantes)
      nearbyEntities: this.getNearbyEntities(32),

      // Blocos relevantes próximos
      nearbyBlocks: this.getNearbyBlocks(16),

      // Tarefa atual (se houver)
      currentTask: this.state.currentTask?.type || null,

      // Fatos relevantes do mundo (RAG)
      relevantFacts: this.memory.getRelevantFacts(5),

      // Timestamp
      timestamp: Date.now()
    };
  }

  // Compacta inventário para tokens mínimos
  compactInventory() {
    const items = this.bot.inventory.items();
    const compacted = {};

    for (const item of items) {
      const name = item.name.replace('_', ' ');
      compacted[name] = (compacted[name] || 0) + item.count;
    }

    // Retorna formato compacto: "stone:64, iron:32, wood:128"
    return Object.entries(compacted)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ');
  }

  // Entidades próximas (apenas relevantes)
  getNearbyEntities(range) {
    const entities = Object.values(this.bot.entities);
    const relevant = ['player', 'zombie', 'skeleton', 'creeper', 'cow', 'pig', 'sheep', 'villager'];

    return entities
      .filter(e => e.position.distanceTo(this.bot.entity.position) < range)
      .filter(e => relevant.some(r => e.name?.includes(r)))
      .map(e => ({
        type: e.name,
        distance: Math.round(e.position.distanceTo(this.bot.entity.position)),
        position: { x: Math.round(e.position.x), y: Math.round(e.position.y), z: Math.round(e.position.z) }
      }))
      .slice(0, 10); // Máximo 10 entidades
  }

  // Blocos relevantes próximos
  getNearbyBlocks(range) {
    const relevant = ['chest', 'furnace', 'crafting_table', 'furnace', 'ore', 'tree', 'water', 'lava'];
    // Implementação busca blocos relevantes no range
    return []; // Simplificado
  }

  // Formata para prompt
  formatForPrompt() {
    const snapshot = this.generate();

    return `
[ESTADO ATUAL]
Posição: (${snapshot.position.x}, ${snapshot.position.y}, ${snapshot.position.z})
Vida: ${snapshot.health}/20 | Fome: ${snapshot.food}/20
Inventário: ${snapshot.inventory}
Entidades próximas: ${snapshot.nearbyEntities.map(e => `${e.type}(${e.distance}m)`).join(', ') || 'nenhuma'}
Tarefa atual: ${snapshot.currentTask || 'nenhuma'}
Fatos relevantes: ${snapshot.relevantFacts.map(f => f.key).join(', ') || 'nenhum'}
`.trim();
  }
}
```

**Benefícios:**
- Reduz tokens de input em ~70%
- Mantém apenas contexto relevante
- Evita explosão de histórico

### 7.5 Prompt Caching (Economia de Custos)

**Problema:** O preâmbulo do sistema (regras do bot, métodos do Mineflayer, exemplos) é enviado em TODA chamada, desperdiçando tokens.

**Solução:** Usar Prompt Caching para reutilizar o preâmbulo em chamadas subsequentes.

```javascript
// llm/promptCache.js

class PromptCache {
  constructor() {
    this.cachedPreamble = null;
    this.preambleHash = null;
  }

  // Gera hash do preâmbulo para verificar se mudou
  hashPreamble(preamble) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(preamble).digest('hex');
  }

  // Prepara prompt com caching
  preparePrompt(systemPrompt, userMessage, provider) {
    // Google Gemini: usa cachedContent
    if (provider === 'google') {
      return this.prepareForGemini(systemPrompt, userMessage);
    }

    // OpenAI-compatible: usa contexto de sistema estático
    if (provider === 'openai-compat') {
      return this.prepareForOpenAI(systemPrompt, userMessage);
    }
  }

  // Gemini: cachedContent
  prepareForGemini(systemPrompt, userMessage) {
    // Verifica se preâmbulo mudou
    const currentHash = this.hashPreamble(systemPrompt);

    if (currentHash === this.preambleHash && this.cachedPreamble) {
      // Reutiliza cache - 90% mais barato
      return {
        cachedContent: this.cachedPreamble,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }]
      };
    }

    // Novo preâmbulo - cria cache
    this.preambleHash = currentHash;
    this.cachedPreamble = {
      role: 'user',
      parts: [{ text: systemPrompt }]
    };

    return {
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Estou pronto para ajudar.' }] },
        { role: 'user', parts: [{ text: userMessage }] }
      ]
    };
  }

  // OpenAI: separa sistema de usuário
  prepareForOpenAI(systemPrompt, userMessage) {
    // OpenAI automaticamente cacheia system prompts repetidos
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    };
  }
}
```

**Benefícios:**
- **Gemini:** Até 90% de desconto em chamadas subsequentes
- **OpenAI:** Cache automático de system prompts
- **NVIDIA/OpenRouter:** Suporte varia por provider

---

## 9. Utils Layer

### 9.1 `logger.js` - Sistema de Logs

**Níveis:** debug, info, warn, error
**Output:** Console + arquivo (`logs/bot-YYYY-MM-DD.log`)
**Módulos:** `logger.module('nome')` para logs específicos

### 9.2 `config.js` - Carregador de Configuração

**Variáveis de ambiente:** `${VAR_NAME}` substituído por `process.env[VAR_NAME]`
**Validação:** Campos obrigatórios, valores padrão
**Métodos:** `get(path, default)`, `set(path, value)`, `save()`

### 9.3 `helpers.js` - Funções Utilitárias

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

## 10. Community Layer (Multi-Bot Cooperation)

O bot pode operar em **modo comunidade**, cooperando com outros bots no mesmo servidor para formar uma sociedade autônoma.

### 10.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                     MINECRAFT SERVER                              │
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                      │
│  │  Bot A  │◄──►│  Bot B  │◄──►│  Bot C  │                      │
│  │ (Luanv) │    │ (Amigo) │    │ (Outro) │                      │
│  └────┬────┘    └────┬────┘    └────┬────┘                      │
│       │              │              │                            │
│       └──────────────┼──────────────┘                            │
│                      │                                           │
│                      ▼                                           │
│              ┌───────────────┐                                   │
│              │ COMMUNITY DB  │                                   │
│              │  (Shared)     │                                   │
│              └───────────────┘                                   │
│                                                                  │
│  Objetivos Compartilhados:                                      │
│  • Construir vila                                              │
│  • Dividir tarefas (minerar, farmar, construir)               │
│  • Defesa cooperativa                                          │
│  • Economia (troca de recursos)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Componentes

| Componente | Função |
|------------|--------|
| **CommunityManager** | Descoberta e registro de peers |
| **CommunicationProtocol** | Mensagens entre bots via chat |
| **RoleManager** | Atribuição de papéis (miner, farmer, etc.) |
| **TaskCoordinator** | Divisão e atribuição de tarefas |
| **SharedMemory** | Sincronização de conhecimento |
| **CommunityGoals** | Objetivos comunitários (vila, fazenda, mina) |

### 10.3 Protocolo de Comunicação

```javascript
// Formato: [COMM:TYPE] {json}

const MESSAGE_TYPES = {
  HELLO: 'HELLO',           // Anúncio de presença
  STATUS: 'STATUS',         // Atualização de status
  TASK_REQUEST: 'TASK_REQ', // Solicitação de tarefa
  TASK_OFFER: 'TASK_OFFER', // Oferta para tarefa
  SYNC: 'SYNC'              // Sincronização de dados
};

// Exemplos:
// [COMM:HELLO] {"name":"ClawMC_Luanv","owner":"Luanv","skills":["mine","explore"]}
// [COMM:STATUS] {"pos":{"x":100,"y":64,"z":-200},"task":"mining"}
// [COMM:TASK_REQ] {"type":"mine","resource":"iron","amount":32}
```

### 10.4 Sistema de Papéis (Roles)

```javascript
const ROLES = {
  MINER: {
    skills: ['mine', 'explore', 'store'],
    priority: ['iron', 'diamond', 'redstone'],
    territory: 'underground'
  },
  FARMER: {
    skills: ['plant', 'harvest', 'breed'],
    priority: ['wheat', 'carrot', 'animals'],
    territory: 'surface'
  },
  BUILDER: {
    skills: ['build', 'craft', 'place'],
    priority: ['structures', 'defenses'],
    territory: 'base'
  },
  EXPLORER: {
    skills: ['explore', 'map', 'scout'],
    priority: ['new_chunks', 'villages'],
    territory: 'world'
  },
  DEFENDER: {
    skills: ['fight', 'guard', 'patrol'],
    priority: ['mobs', 'threats'],
    territory: 'perimeter'
  },
  GATHERER: {
    skills: ['collect', 'chop', 'store'],
    priority: ['wood', 'stone', 'food'],
    territory: 'surface'
  }
};
```

### 10.5 Configuração de Comunidade

```json
{
  "community": {
    "enabled": true,
    "name": "Vila dos Bots",
    "discovery": {
      "autoAnnounce": true,
      "peerTimeout": 120000
    },
    "roles": {
      "autoAssign": true,
      "preferRoles": ["miner", "explorer"]
    },
    "sync": {
      "enabled": true,
      "interval": 60000,
      "facts": ["chest", "construction", "resource", "danger"]
    }
  }
}
```

---

## 11. Configuração

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

## 12. Fluxo de Dados Detalhado

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

## 13. Tratamento de Erros

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

## 14. Dependências NPM

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
    "node-cron": "^3.0.0",
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

## 15. Gerenciamento de Custos

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

## 16. Dependências Nativas (Windows)

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

## 17. Próximos Passos

Após aprovação deste design:

1. **Criar plano de implementação** (via writing-plans skill)
2. **Setup inicial do projeto** (npm init, dependências)
3. **Implementar Core Layer** (bot.js, state.js, commands.js)
4. **Implementar Autonomy Layer** (curriculum.js, idle.js, scheduler.js, survival.js)
5. **Implementar Memory Layer** (database, embeddings híbrido, RAG)
6. **Implementar LLM Layer** (providers, router)
7. **Implementar Skills Base** (walk, mine, collect, escape, find_food, explore, etc.)
8. **Implementar Skills Executor** (sandbox + validação)
9. **Testes integrados**
10. **Documentação de uso**

---

## 18. Resumo de Componentes

| Componente | Status | Prioridade |
|------------|--------|------------|
| Core Layer | Definido | Alta |
| Autonomy Layer (Voyager) | Definido | Alta |
| Memory Layer (Híbrido) | Definido | Alta |
| Skill Documentation Embedding | Definido | Alta |
| Skills Layer | Definido | Alta |
| Dynamic Turn Limits | Definido | Alta |
| LLM Layer (Multi-provider) | Definido | Alta |
| Semantic Snapshots | Definido | Alta |
| Prompt Caching | Definido | Média |
| Community Layer (Multi-Bot) | Definido | Alta |
| Utils Layer | Definido | Média |
| Gerenciamento de Custos | Definido | Média |
| Dependências Nativas | Documentado | Baixa |

---

**Documento aprovado em:** 2026-03-17
**Local:** `D:/Users/luanv/OneDrive/Área de Trabalho/GAMES/Trabalhos/ClawMC/`