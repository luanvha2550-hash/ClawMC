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
│   │   ├── circadianEvents.js   # Eventos de ciclo dia/noite
│   │   ├── ooda.js              # Loop OODA principal
│   │   ├── commands.js          # Parser de comandos (prefixo)
│   │   ├── state.js             # Estado do bot (tarefa atual, timeout)
│   │   ├── persistence.js       # Persistência de estado entre sessões
│   │   ├── curriculum.js        # Gerenciador de currículo (Voyager)
│   │   ├── idle.js              # Loop de autonomia
│   │   ├── scheduler.js         # Tarefas agendadas (cron)
│   │   └── survival.js          # Monitor de sobrevivência
│   │
│   ├── memory/
│   │   ├── database.js          # Inicialização SQLite
│   │   ├── embeddings.js        # Sistema híbrido (local + API)
│   │   ├── memoryManager.js     # Graceful degradation de memória
│   │   ├── hybridSearch.js      # Busca híbrida (semântica + SQL)
│   │   ├── rag.js               # Consultas sqlite-vec
│   │   ├── facts.js             # CRUD de fatos do mundo
│   │   └── skillDocs.js         # Documentação de skills
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
│   │   ├── registry.js           # Registro de todas skills
│   │   ├── turnLimiter.js        # Limite de tentativas
│   │   └── testFirst.js          # Testes simulados antes de executar
│   │
│   ├── llm/
│   │   ├── providers/
│   │   │   ├── google.js         # Gemini API
│   │   │   ├── openai-compat.js  # OpenAI-compatible
│   │   │   ├── factory.js        # Factory de providers
│   │   │   └── index.js          # Lista de providers
│   │   ├── router.js             # Roteamento + fallback
│   │   ├── modelSelector.js      # Seleção de modelo por complexidade
│   │   ├── circuitBreaker.js     # Circuit breaker para APIs
│   │   ├── prompts.js            # Templates de prompt
│   │   ├── snapshots.js          # Semantic Snapshots
│   │   ├── promptCache.js        # Cache de prompts
│   │   └── minifiedDocs.js       # Documentação compacta da API
│   │
│   ├── community/                 # Multi-bot cooperation (opcional)
│   │   ├── manager.js            # Gerenciador de peers
│   │   ├── protocol.js           # Protocolo de comunicação
│   │   ├── roles.js              # Sistema de papéis
│   │   └── goals.js              # Objetivos comunitários
│   │
│   └── utils/
│       ├── logger.js             # Sistema de logs
│       ├── config.js             # Carregador de config.json
│       ├── healthCheck.js        # Verificação de integridade
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
- `'time'': ciclo dia/noite → autonomia.onTimeChange()
- `'weather'': mudança de clima → autonomia.onWeatherChange()
- `'entityGone'`: entidade saiu de alcance → state.forgetEntity()
- `'entityHurt'': entidade ferida → autonomia.onEntityHurt()

**Eventos do Ciclo Circadiano (Dia/Noite):**

```javascript
// core/circadianEvents.js

class CircadianEvents {
  constructor(bot, state) {
    this.bot = bot;
    this.state = state;
    this.lastDayTime = null;

    // Eventos baseados no tempo do jogo
    this.bot.on('time', () => this.checkTimeEvents());
  }

  checkTimeEvents() {
    const dayTime = this.bot.time.timeOfDay;
    const isDay = dayTime < 12000;  // 0-12000 = dia, 12000-24000 = noite

    // Transição dia → noite
    if (this.lastDayTime !== null && this.lastDayTime < 12000 && dayTime >= 12000) {
      this.onNightfall();
    }

    // Transição noite → dia
    if (this.lastDayTime !== null && this.lastDayTime >= 12000 && dayTime < 12000) {
      this.onDaybreak();
    }

    // Amehecer (começo do dia)
    if (this.lastDayTime !== null && this.lastDayTime > 22000 && dayTime < 1000) {
      this.onSunrise();
    }

    // Entardecer (final do dia)
    if (this.lastDayTime !== null && this.lastDayTime < 11000 && dayTime >= 11000) {
      this.onSunset();
    }

    this.lastDayTime = dayTime;
  }

  // Anoitecer - mobs hostis começam a spawnar
  onNightfall() {
    logger.info('[Circadian] Anoitecer - iniciando protocolo de segurança');
    this.emit('nightfall', {
      message: 'Está anoitecendo. Mobs hostis podem aparecer.',
      priority: 'high',
      suggestedActions: [
        'build_shelter',   // Construir abrigo se não tiver
        'go_home',         // Voltar para base
        'light_area'       // Iluminar área
      ]
    });
  }

  // Amanhecer - mobs hostis queimam
  onDaybreak() {
    logger.info('[Circadian] Amanhecer - área segura novamente');
    this.emit('daybreak', {
      message: 'Está amanhecendo. Mobs hostis vão queimar.',
      priority: 'low',
      suggestedActions: [
        'resume_tasks',    // Continuar tarefas interrompidas
        'collect_items'    // Coletar drops de mobs que queimaram
      ]
    });
  }

  // Nascer do sol
  onSunrise() {
    this.emit('sunrise', { priority: 'none' });
  }

  // Pôr do sol
  onSunset() {
    logger.info('[Circadian] Entardecer - preparando para noite');
    this.emit('sunset', {
      priority: 'medium',
      suggestedActions: [
        'check_shelter',   // Verificar abrigo
        'gather_torch'     // Preparar tochas
      ]
    });
  }

  // Emite evento para o sistema de autonomia
  emit(event, data) {
    this.bot.emit('circadian', { event, ...data });
  }
}

// Integração com Autonomy Layer
autonomy.on('circadian', ({ event, suggestedActions }) => {
  if (event === 'nightfall' && !state.hasShelter()) {
    // Prioridade máxima: construir abrigo
    curriculum.addUrgentGoal('build_shelter');
  }
});
```

**Casos de Uso do Ciclo Circadiano:**
1. **Sobrevivência:** Bot dorme à noite em cama próxima
2. **Coleta:** Bot coleta drops de mobs ao amanhecer
3. **Exploração:** Evita áreas não iluminadas à noite
4. **Farming:** Planta durante o dia, colhe ao amanhecer

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

### 4.5 `persistence.js` - Persistência de Estado

> **⚠️ UNIFICADO COM ROBUSTNESS LAYER**
>
> Esta funcionalidade foi **unificada com o Robustness Layer** (ver documento `2026-03-18-robustness-layer-design.md`).
>
> O componente `CheckpointManager` do Robustness Layer substitui completamente o `StatePersistence`,
> oferecendo funcionalidades mais robustas:
> - Checkpoints automáticos a cada 5 minutos
> - Checkpoints em eventos críticos (death, shutdown)
> - Restauração automática ao reconectar
> - Tratamento de erros SQLite com fallback in-memory
> - Integração com State Machine para evitar race conditions
>
> **Não implementar este arquivo separadamente.** Usar apenas `robustness/checkpoint.js`.

**Funcionalidades mantidas pelo Robustness Layer:**

| Funcionalidade | Componente Robustness |
|----------------|----------------------|
| Salvar estado periodicamente | `CheckpointManager.save('auto')` |
| Restaurar ao reconectar | `CheckpointManager.restore()` |
| Salvar em shutdown | `CheckpointManager.save('shutdown')` |
| Salvar em morte | `CheckpointManager.save('death')` |
| Estado do currículo | Incluído no checkpoint |

**Interface de Integração:**

```javascript
// No bot.js, após spawn
bot.on('spawn', async () => {
  const restored = await robustness.checkpoint.restore();
  if (restored) {
    logger.info('[Persistence] Estado restaurado do checkpoint');
    if (restored.task) {
      state.pendingTask = restored.task;
    }
  }
});

// Ao mudar fase do currículo
curriculum.onPhaseChange((newPhase) => {
  robustness.checkpoint.save('auto');
});
```

**Métodos originais (agora no CheckpointManager):**

```javascript
// NÃO IMPLEMENTAR - Usar robustness/checkpoint.js

// Métodos equivalentes no CheckpointManager:
// persistence.save()        → checkpoint.save('auto')
// persistence.restore()     → checkpoint.restore()
// persistence.clear()       → checkpoint.clear()
// persistence.startAutoSave() → checkpoint.init() + startMonitoring()
```

**Tabelas SQL movidas para o Robustness Layer:**

As tabelas `bot_state` e `checkpoints` agora são gerenciadas pelo Robustness Layer. Ver documento `2026-03-18-robustness-layer-design.md` para schema completo.
  }

  // Salvamento automático
  startAutoSave() {
    this.autoSaveTimer = setInterval(() => {
      this.save().catch(err => {
        logger.error('[Persistence] Erro ao salvar:', err);
      });
    }, this.saveInterval);
  }

  // Para salvamento automático
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
  }

  // Limpa estado (para logout/reset)
  async clear() {
---

## 5. Memory Layer

### 5.1 `database.js` - Inicialização SQLite

**Tabelas:**

```sql
-- Skills aprendidas - Embeddings LOCAIS (384 dimensões)
-- multilingual-e5-small, paraphrase-multilingual-MiniLM-L12
CREATE VIRTUAL TABLE skills_vss_local USING vec0(
  embedding FLOAT[384]
);

-- Skills aprendidas - Embeddings API (768 dimensões)
-- Gemini Embedding, NVIDIA NV-Embed
CREATE VIRTUAL TABLE skills_vss_api USING vec0(
  embedding FLOAT[768]
);

-- Metadados das skills (comum para ambas tabelas)
CREATE TABLE skills_metadata (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  description TEXT,
  file_path TEXT,
  embedding_source TEXT,  -- 'local' ou 'api'
  created_at DATETIME
);

-- Fatos do mundo (coordenadas, regras, localizações)
-- Usa embeddings locais (mais comum, sem custo)
CREATE VIRTUAL TABLE facts_vss USING vec0(
  embedding FLOAT[384]
);

CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  type TEXT,           -- 'location', 'rule', 'chest', 'player'
  key TEXT,
  value TEXT,          -- JSON
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

-- Community Layer - Peers conhecidos
CREATE TABLE community_peers (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  owner TEXT,
  role TEXT,
  capabilities TEXT,     -- JSON array de skills
  position TEXT,         -- JSON {x, y, z}
  last_seen DATETIME
);

-- Community Layer - Fatos compartilhados
CREATE TABLE shared_facts (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE,
  value TEXT,
  source_peer TEXT,
  created_at DATETIME
);

-- API Keys validadas (sem armazenar as chaves reais)
CREATE TABLE api_key_status (
  id INTEGER PRIMARY KEY,
  provider TEXT UNIQUE,
  is_valid BOOLEAN,
  last_check DATETIME,
  error_message TEXT
);
```

**Nota sobre Dimensões:**
- Local embeddings (multilingual-e5-small): 384 dimensões
- API embeddings (Gemini, NVIDIA): 768 dimensões
- O sistema escolhe a tabela correta baseado no `embedding_source` do metadata

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

#### 5.2.5 Graceful Degradation (Gerenciamento de Memória)

> **⚠️ INTEGRAÇÃO COM ROBUSTNESS LAYER**
>
> O monitoramento de memória e degradação graciosa agora é **gerenciado pelo Alert System** do Robustness Layer.
>
> O `MemoryManager` abaixo é mantido como referência de implementação das **ações de degradação**,
> mas os **thresholds e monitoramento** são feitos pelo `AlertSystem` (ver `robustness/alerts.js`).
>
> **Fluxo Integrado:**
> 1. `AlertSystem` monitora memória a cada 30s (thresholds: 85% warning, 91% critical)
> 2. Quando alerta dispara, chama callback de ação degradada
> 3. `MemoryManager` executa ações: descarregar embeddings, limpar cache, forçar GC
> 4. `EventLogger` registra evento de degradação
> 5. `MetricsCollector` atualiza métricas

**Problema:** O hardware tem apenas 8GB RAM e o cliente do Minecraft consome parte significativa. Quando a RAM está alta (>91%), o sistema pode ficar instável.

**Solução:** Degradar automaticamente recursos para manter o bot funcional, **acionado pelo Alert System**.

```javascript
// memory/memoryManager.js

class MemoryManager {
  constructor(embeddings, config) {
    this.embeddings = embeddings;
    this.config = config;
    this.threshold = config.memoryThreshold || 0.91; // 91%
    this.checkInterval = 30000; // 30 segundos
    this.isDegraded = false;
  }

  // Inicia monitoramento
  start() {
    this.monitorTimer = setInterval(() => {
      this.checkAndDegrade();
    }, this.checkInterval);
  }

  // Para monitoramento
  stop() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
  }

  // Verifica uso de memória e degrada se necessário
  checkAndDegrade() {
    const usage = process.memoryUsage();
    const heapUsage = usage.heapUsed / usage.heapTotal;

    logger.debug(`[MemoryManager] Heap: ${Math.round(heapUsage * 100)}%`);

    if (heapUsage > this.threshold && !this.isDegraded) {
      logger.warn(`[MemoryManager] Memória alta (${Math.round(heapUsage * 100)}%), iniciando degradação`);
      this.degrade();
    } else if (heapUsage < (this.threshold - 0.1) && this.isDegraded) {
      logger.info('[MemoryManager] Memória normalizada, restaurando recursos');
      this.restore();
    }
  }

  // Degrada recursos para liberar memória
  async degrade() {
    this.isDegraded = true;

    // 1. Descarrega modelo de embeddings
    if (this.embeddings.localModel) {
      logger.info('[MemoryManager] Descarregando modelo de embeddings');
      this.embeddings.localModel = null;
      this.embeddings.mode = 'api'; // Força modo API
    }

    // 2. Limpa cache de embeddings
    if (this.embeddings.cache) {
      const cacheSize = this.embeddings.cache.size;
      this.embeddings.cache.clear();
      logger.info(`[MemoryManager] Cache de embeddings limpo (${cacheSize} entradas)`);
    }

    // 3. Força garbage collection se disponível
    if (global.gc) {
      global.gc();
      logger.info('[MemoryManager] Garbage collection executado');
    }

    // 4. Notifica sistema
    this.emit('degraded', {
      mode: 'api-only',
      reason: 'memory_pressure'
    });
  }

  // Restaura recursos quando memória normaliza
  async restore() {
    this.isDegraded = false;

    // Recarrega modelo de embeddings se estava em modo local
    if (this.config.embeddings.mode === 'local') {
      logger.info('[MemoryManager] Recarregando modelo de embeddings');
      await this.embeddings.initLocalModel();
      this.embeddings.mode = 'local';
    }

    this.emit('restored');
  }

  // Status atual
  getStatus() {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / (1024 * 1024)),
      heapTotalMB: Math.round(usage.heapTotal / (1024 * 1024)),
      heapUsagePercent: Math.round((usage.heapUsed / usage.heapTotal) * 100),
      isDegraded: this.isDegraded,
      embeddingsMode: this.embeddings.mode
    };
  }
}
```

**Degradation Levels:**

| Heap Usage | Ação |
|------------|------|
| < 80% | Normal - todos os recursos ativos |
| 80-91% | Alerta - log de aviso |
| > 91% | Degradação - descarregar embeddings, limpar cache |
| > 95% | Crítico - modo emergência (apenas skills base, sem LLM) |

**Configuração:**
```json
{
  "memory": {
    "threshold": 0.91,
    "criticalThreshold": 0.95,
    "checkInterval": 30000,
    "enableGC": true
  }
}
```

**Nota:** O garbage collector explícito (`global.gc()`) requer Node.js iniciado com `--expose-gc`. Em produção, use PM2 ou systemd para reiniciar o processo se a memória ficar crítica por muito tempo.

#### 5.2.6 Integração Memory Manager + Alert System

```javascript
// Configuração de integração no config.json
{
  "robustness": {
    "alerts": {
      "memoryHigh": {
        "threshold": 85,
        "action": "warn"  // Apenas log
      },
      "memoryCritical": {
        "threshold": 91,
        "action": "degrade"  // Chama MemoryManager.degrade()
      }
    }
  },
  "memory": {
    "criticalThreshold": 95,
    "enableGC": true
  }
}

// No Robustness Layer (robustness/index.js)
async init() {
  // ... inicializa componentes

  // Registra callback de degradação
  this.alerts.registerAction('memoryCritical', async () => {
    await this.memoryManager.degrade();
  });

  // Registra callback de restauração
  this.alerts.registerAction('memoryResolved', async () => {
    await this.memoryManager.restore();
  });
}
```

**Orçamento de RAM (8GB Total):**

| Componente | Uso Típico | Pico | Ação se Crítico |
|------------|------------|------|-----------------|
| Node.js Base | ~100MB | ~150MB | - |
| Mineflayer + Pathfinder | ~150MB | ~250MB | - |
| SQLite + sqlite-vec | ~30MB | ~100MB | Limpar queries pendentes |
| Embeddings (local) | ~200MB | ~350MB | **Descarregar modelo** |
| Cache de Embeddings | ~50MB | ~200MB | **Limpar cache** |
| Cache de Skills | ~20MB | ~50MB | Reduzir maxCacheSize |
| Logs e Buffers | ~30MB | ~100MB | Flush forçado |
| **Margem de Segurança** | ~100MB | - | - |
| **TOTAL** | ~680MB | ~1.2GB | - |

**Limite de Cache Absoluto:**

```javascript
// memory/embeddings.js
const MAX_CACHE_SIZE_ABSOLUTE = 500; // Nunca exceder 500 entradas

if (this.cache.size >= MAX_CACHE_SIZE_ABSOLUTE) {
  // Remove 20% mais antigos
  const keysToRemove = Array.from(this.cache.keys()).slice(0, Math.floor(MAX_CACHE_SIZE_ABSOLUTE * 0.2));
  keysToRemove.forEach(key => this.cache.delete(key));
  logger.warn(`[Embeddings] Cache reduzido para ${this.cache.size} entradas`);
}
```

### 5.3 `rag.js` - Consultas Semânticas

**Função:** Busca skills e fatos por similaridade

**Exemplo:**
- Input: `"onde está o baú de ferro?"`
- Output: `{ skills: [], facts: [{ type: 'chest', key: 'chest_iron', value: {x: 150, ...} }] }`

### 5.3.1 Hybrid Search (Busca Híbrida)

**Problema:** Buscas puramente semânticas não permitem filtros precisos como "coordenadas onde X > 100" ou "fatos do tipo 'regra'".

**Solução:** Combinar busca vetorial com filtros SQL tradicionais.

```javascript
// memory/hybridSearch.js

class HybridSearch {
  constructor(db, embeddings) {
    this.db = db;
    this.embeddings = embeddings;
  }

  // Busca híbrida: semântica + filtros
  async search(query, options = {}) {
    const {
      type = null,           // Filtrar por tipo: 'skill', 'fact', 'location'
      minSimilarity = 0.7,   // Threshold mínimo de similaridade
      maxResults = 5,       // Máximo de resultados
      filters = {},         // Filtros SQL adicionais
      embeddingSource = 'local' // 'local' ou 'api'
    } = options;

    // 1. Gera embedding da query
    const queryVector = await this.embeddings.vectorize(query);

    // 2. Escolhe a tabela correta baseado no source
    const vssTable = embeddingSource === 'api' ? 'skills_vss_api' : 'skills_vss_local';

    // 3. Monta query híbrida
    let sql = `
      SELECT
        m.id,
        m.name,
        m.description,
        m.file_path,
        v.distance
      FROM ${vssTable} v
      JOIN skills_metadata m ON v.rowid = m.id
      WHERE v.distance < ${1 - minSimilarity}
    `;

    // 4. Adiciona filtros dinâmicos
    const params = [JSON.stringify(queryVector)];

    if (filters.createdAfter) {
      sql += ` AND m.created_at > ?`;
      params.push(filters.createdAfter);
    }

    if (filters.tags && filters.tags.length > 0) {
      sql += ` AND m.tags LIKE ?`;
      params.push(`%${filters.tags[0]}%`);
    }

    sql += ` ORDER BY v.distance ASC LIMIT ?`;
    params.push(maxResults);

    // 5. Executa com VSS
    return this.db.queryVSS(sql, queryVector, params);
  }

  // Exemplos de uso:

  // Buscar skills por significado
  async findSkills(description) {
    return this.search(description, { type: 'skill' });
  }

  // Buscar fatos com filtros espaciais
  async findNearbyFacts(x, z, radius, description) {
    const results = await this.search(description, { type: 'fact' });
    return results.filter(f => {
      const coords = JSON.parse(f.value);
      return Math.abs(coords.x - x) <= radius && Math.abs(coords.z - z) <= radius;
    });
  }

  // Buscar skills recentes
  async findRecentSkills(days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.search('*', {
      type: 'skill',
      filters: { createdAfter: cutoff.toISOString() },
      maxResults: 10
    });
  }
}
```

**Casos de Uso:**
- `"onde está o baú de ferro?"` → Busca semântica + filtro tipo='chest'
- `"skills de mineração aprendidas esta semana"` → Busca semântica + filtro temporal
- `"fatos sobre a base nas coordenadas X > 100"` → Busca semântica + filtro espacial

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
      INSERT INTO skills_metadata (name, description, file_path, parameters, returns, examples, tags, embedding_source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [doc.name, doc.description, filename, JSON.stringify(doc.parameters),
        JSON.stringify(doc.returns), JSON.stringify(doc.examples),
        JSON.stringify(doc.tags), this.embeddings.source, Date.now()]);

    // Escolhe tabela correta baseado no tipo de embedding
    const vssTable = this.embeddings.source === 'api' ? 'skills_vss_api' : 'skills_vss_local';

    // Salva embedding na tabela vetorial correta
    await this.db.run(`
      INSERT INTO ${vssTable} (rowid, embedding)
      VALUES (?, ?)
    `, [this.db.lastInsertRowId, JSON.stringify(doc.embedding)]);

    logger.info(`[SkillDoc] Skill salva: ${doc.name} (embedding: ${this.embeddings.source})`);
    return doc;
  }

  // Busca skill por descrição semântica
  async findByDescription(query) {
    const queryEmbedding = await this.embeddings.vectorize(query);

    // Escolhe tabela correta baseado no tipo de embedding configurado
    const vssTable = this.embeddings.source === 'api' ? 'skills_vss_api' : 'skills_vss_local';

    const results = await this.db.all(`
      SELECT sm.name, sm.description, sm.file_path, sm.tags, sm.embedding_source,
             vec_distance_cosine(sv.embedding, ?) as distance
      FROM skills_metadata sm
      JOIN ${vssTable} sv ON sm.rowid = sv.rowid
      WHERE sm.embedding_source = ?
      ORDER BY distance ASC
      LIMIT 5
    `, [JSON.stringify(queryEmbedding), this.embeddings.source]);

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
  // Acesso direto a módulos
  /require\s*\(/,
  /import\s+/,

  // eval e variantes
  /eval\s*\(/,
  /Function\s*\(/,
  /\[\s*['"]eval['"]\s*\]/,           // ['eval']('code')

  // Escapes de prototype
  /this\s*\[\s*['"]constructor['"]\s*\]/,  // this['constructor']
  /constructor\s*\.\s*constructor/,          // constructor.constructor
  /__proto__/,

  // Globais perigosos
  /globalThis/,
  /global\s*\(/,
  /process\s*\./,
  /__dirname/,
  /__filename/,

  // APIs de reflexão
  /Reflect\s*\./,
  /Proxy\s*\(/,

  // Filesystem e network
  /fs\./,
  /child_process/,
  /http\./,
  /https\./,
  /net\./,

  // Buffer e VM
  /Buffer\s*\(/,
  /vm\s*\./
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

### 6.5 Test-First Agent Loop (Redução de Thrashing)

**Problema:** Quando o LLM gera código com erro, ele pode entrar em loops de correção infinitos, desperdiçando tokens e tempo. Referência: "Stop Burning Tokens: The Tests-First Agent Loop That Cuts Thrash by 50%".

**Solução:** Validar código ANTES de executar no mundo real, usando testes simulados.

```javascript
// skills/testFirst.js

class TestFirstLoop {
  constructor(bot, sandbox) {
    this.bot = bot;
    this.sandbox = sandbox;
    this.maxTestAttempts = 2;  // Testes simulados antes de executar de verdade
  }

  // Executa ciclo de geração + teste + correção
  async generateAndTest(task, llmProvider) {
    let code = null;
    let testResult = null;
    let attempts = 0;

    // Fase 1: Geração inicial
    code = await llmProvider.generateCode(task);

    // Fase 2: Testes simulados (sem executar no Minecraft)
    while (attempts < this.maxTestAttempts) {
      testResult = await this.runSimulatedTest(code, task);

      if (testResult.passed) {
        // Teste passou - pronto para executar de verdade
        logger.info('[TestFirst] Código passou nos testes simulados');
        return { success: true, code };
      }

      // Teste falhou - tenta corrigir com contexto do erro
      attempts++;
      logger.warn(`[TestFirst] Teste simulado falhou (${attempts}/${this.maxTestAttempts})`);

      if (attempts < this.maxTestAttempts) {
        // Gera versão corrigida com contexto do erro
        code = await llmProvider.regenerateWithErrors(
          code,
          testResult.error,
          task
        );
      }
    }

    // Fase 3: Limite de testes atingido
    // Pode ainda executar, mas com aviso
    logger.warn('[TestFirst] Máximo de testes simulados atingido, executando mesmo assim');
    return {
      success: false,
      code,
      testError: testResult?.error,
      warning: 'Código não passou nos testes simulados'
    };
  }

  // Teste simulado (mock do bot)
  async runSimulatedTest(code, task) {
    // Cria ambiente mockado
    const mockBot = this.createMockBot();
    const mockState = { currentTask: task };

    try {
      // Executa em sandbox mockado
      const result = await this.sandbox.executeInMock(code, {
        bot: mockBot,
        state: mockState
      });

      // Verifica se código atende requisitos básicos
      const violations = this.checkBasicRequirements(code, task);
      if (violations.length > 0) {
        return {
          passed: false,
          error: `Requisitos não atendidos: ${violations.join(', ')}`
        };
      }

      return { passed: true, result };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        stack: error.stack
      };
    }
  }

  // Cria mock do bot para testes
  createMockBot() {
    return {
      // Mock de inventário
      inventory: {
        items: () => [{ name: 'dirt', count: 64 }],
        count: (item) => item === 'dirt' ? 64 : 0
      },

      // Mock de posição
      entity: {
        position: { x: 0, y: 64, z: 0 }
      },

      // Mock de pathfinder
      pathfinder: {
        goto: async () => {},
        stop: () => {}
      },

      // Mock de blocos
      findBlocks: () => [],
      blockAt: () => ({ name: 'air', position: { x: 0, y: 64, z: 0 } }),

      // Mock de chat
      chat: (msg) => console.log(`[MOCK] ${msg}`),

      // Health e food
      health: 20,
      food: 20
    };
  }

  // Verifica requisitos básicos do código
  checkBasicRequirements(code, task) {
    const violations = [];

    // Verifica se código usa try/catch (obrigatório)
    if (!code.includes('try') || !code.includes('catch')) {
      violations.push('Código deve ter tratamento de erros (try/catch)');
    }

    // Verifica se código é assíncrono (obrigatório para skills)
    if (!code.includes('async') && !code.includes('await')) {
      violations.push('Código deve ser assíncrono');
    }

    // Verifica se usa apenas métodos permitidos
    const allowedMethods = [
      'bot.pathfinder', 'bot.dig', 'bot.placeBlock', 'bot.findBlocks',
      'bot.inventory', 'bot.equip', 'bot.toss', 'bot.chat', 'bot.lookAt',
      'bot.health', 'bot.food', 'bot.entity.position'
    ];

    // Padrões proibidos já verificados em outro lugar

    return violations;
  }
}
```

**Fluxo Test-First:**
```
1. LLM gera código
   ↓
2. Teste simulado em mock (SEM afetar Minecraft)
   ↓
3a. Passou? → Executa no mundo real
   ↓
3b. Falhou? → LLM corrige com contexto do erro
   ↓
4. Segundo teste simulado
   ↓
5a. Passou? → Executa no mundo real
   ↓
5b. Falhou? → Executa com aviso (ou aborta)
```

**Benefícios:**
- Reduz "thrashing" de tokens em ~50%
- Evita executar código claramente quebrado
- Captura erros óbvios antes de gastar tokens
- Não afeta o mundo real durante testes

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

### 8.1 Providers Suportados

| Provider | Modelos | Classe |
|----------|---------|--------|
| **Google** | gemini-2.5-flash, gemini-2.5-pro, gemini-3-flash-preview, gemini-3.1-flash-lite-preview | GoogleProvider |
| **NVIDIA NIM** | deepseek-ai/deepseek-v3.2, minimaxai/minimax-m2.1, nvidia/nemotron-nano-12b-v2-vl, stepfun-ai/step-3.5-flash, z-ai/glm4.7 | OpenAICompatProvider |
| **OpenRouter** | claude-3-haiku, gpt-4o-mini, stepfun/step-3.5-flash:free, gemini-2.5-flash | OpenAICompatProvider |
| **Ollama Cloud** | gemini-2.5-flash-preview, glm-4.7, minimax-m2.1, nemotron-3-nano:30b, qwen3.5, kimi-k2.5, rnj-1 | OpenAICompatProvider |
| **OpenAI** | gpt-4o-mini, gpt-4o, gpt-3.5-turbo | OpenAICompatProvider |

> **Nota:** Gemini 3.1 Flash-Lite é o modelo mais econômico ($0.25/1M input tokens). Gemini 2.5 será descontinuado em junho de 2026. Verificar [documentação oficial](https://ai.google.dev/gemini-api/docs/models) para modelos disponíveis.

### 8.1.1 Model Selection (Configurável pelo Usuário)

**Problema:** Usar o mesmo modelo para todas as tarefas desperdiça tokens em operações simples.

**Solução:** Dois modos configuráveis pelo usuário:

#### Modo Único (Padrão)
Um único modelo para todas as operações:
```json
{
  "llm": {
    "mode": "single",
    "model": "gemini-3.1-flash-lite-preview"
  }
}
```

#### Modo Tiered (Por Complexidade)
Modelos diferentes para diferentes níveis de complexidade:
```json
{
  "llm": {
    "mode": "tiered",
    "tiers": {
      "simple": {
        "model": "gemini-3.1-flash-lite-preview",
        "useCases": ["chat", "translate", "summarize"],
        "maxTokens": 500
      },
      "medium": {
        "model": "gemini-2.5-flash",
        "useCases": ["code", "plan", "skill"],
        "maxTokens": 2000
      },
      "complex": {
        "model": "gemini-3-flash-preview",
        "useCases": ["reasoning", "multistep"],
        "maxTokens": 8000
      }
    }
  }
}
```

#### Implementação
```javascript
// llm/modelSelector.js

class ModelSelector {
  constructor(config) {
    this.mode = config.llm.mode || 'single';
    this.config = config.llm;
  }

  // Seleciona modelo baseado no tipo de tarefa
  selectModel(taskType, estimatedTokens) {
    if (this.mode === 'single') {
      return this.config.model;
    }

    // Modo tiered
    const tiers = this.config.tiers;

    // Tarefas simples: chat, translate, summarize
    if (['chat', 'translate', 'summarize'].includes(taskType)) {
      return tiers.simple.model;
    }

    // Tarefas médias: code, plan, skill generation
    if (['code', 'plan', 'skill'].includes(taskType)) {
      if (estimatedTokens > tiers.medium.maxTokens) {
        return tiers.complex.model;
      }
      return tiers.medium.model;
    }

    // Tarefas complexas: reasoning, multistep
    return tiers.complex.model;
  }

  // Estima complexidade baseado no contexto
  estimateTaskType(prompt, context) {
    const promptLength = prompt.length;
    const hasCode = /```|function|async|await/.test(prompt);
    const hasMultiStep = /passo|step|primeiro|depois|então/i.test(prompt);

    if (hasMultiStep || context.nearbyEntities > 5) {
      return 'complex';
    }
    if (hasCode || promptLength > 500) {
      return 'medium';
    }
    return 'simple';
  }
}
```

**Benefícios:**
- **Economia:** Tarefas simples usam modelo mais barato (75% economia)
- **Flexibilidade:** Usuário escolhe o equilíbrio custo/qualidade
- **Fallback:** Se tier falhar, tenta próximo tier mais capaz

### 8.2 `router.js` - Roteamento + Fallback

**Estratégia:**
- `primary`: modelo para conversação (mais barato)
- `secondary`: fallback se primary falhar
- `codeModel`: modelo para gerar código (melhor em programação)

**Fallback automático:**
1. Tenta provider configurado
2. Se falhar, tenta secondary
3. Desabilita provider temporariamente após N falhas
4. Reabilita após cooldown

### 8.2.1 Circuit Breaker Pattern

**Problema:** Fallback simples continua tentando providers mesmo quando todos estão falhando, desperdiçando tempo.

**Solução:** Circuit Breaker que para tentativas após falhas consecutivas.

```javascript
// llm/circuitBreaker.js

class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;   // Falhas antes de abrir
    this.timeout = timeout;       // Tempo até tentar novamente
    this.failures = new Map();    // { provider: count }
    this.states = new Map();       // { provider: 'closed'|'open'|'half-open' }
    this.lastFailure = new Map(); // { provider: timestamp }
  }

  // Verifica se provider está disponível
  canTry(provider) {
    const state = this.states.get(provider) || 'closed';

    if (state === 'closed') {
      return true;
    }

    if (state === 'open') {
      const lastFail = this.lastFailure.get(provider) || 0;
      const elapsed = Date.now() - lastFail;

      if (elapsed > this.timeout) {
        // Transição para half-open
        this.states.set(provider, 'half-open');
        return true;
      }

      return false;
    }

    // half-open: permite uma tentativa
    return true;
  }

  // Registra sucesso
  onSuccess(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');
  }

  // Registra falha
  onFailure(provider) {
    const count = (this.failures.get(provider) || 0) + 1;
    this.failures.set(provider, count);
    this.lastFailure.set(provider, Date.now());

    if (count >= this.threshold) {
      this.states.set(provider, 'open');
      logger.warn(`[CircuitBreaker] Provider ${provider} aberto após ${count} falhas`);
    }
  }

  // Força reset (para testes ou admin)
  reset(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');
    this.lastFailure.delete(provider);
  }

  // Status de todos os providers
  getStatus() {
    const status = {};
    for (const [provider, state] of this.states) {
      status[provider] = {
        state,
        failures: this.failures.get(provider) || 0,
        lastFailure: this.lastFailure.get(provider)
      };
    }
    return status;
  }
}
```

**Estados do Circuit Breaker:**
- **Closed:** Funcionando normalmente, todas as requisições passam
- **Open:** Falhou muitas vezes, rejeita todas as requisições por `timeout` segundos
- **Half-Open:** Após timeout, permite uma requisição de teste

**Uso com Fallback:**
```javascript
// No router.js
async callLLM(prompt, context) {
  const providers = ['primary', 'secondary', 'tertiary'];

  for (const provider of providers) {
    if (!circuitBreaker.canTry(provider)) {
      logger.debug(`[Router] Provider ${provider} em circuit breaker`);
      continue;
    }

    try {
      const result = await this.providers[provider].call(prompt);
      circuitBreaker.onSuccess(provider);
      return result;
    } catch (error) {
      circuitBreaker.onFailure(provider);
      logger.warn(`[Router] Provider ${provider} falhou: ${error.message}`);
    }
  }

  // Todos os providers falharam ou estão em circuit breaker
  throw new Error('Todos os providers estão indisponíveis');
}
```

### 8.3 `prompts.js` - Templates

**chatSystem:** Sistema conversacional em pt-BR, respostas concisas
**codeSystem:** Geração de código JavaScript para Mineflayer
**buildCodePrompt:** Template para gerar código com contexto do bot

### 8.4 Semantic Snapshots (Redução de Contexto)

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
    const relevant = ['chest', 'furnace', 'crafting_table', 'ore', 'tree', 'water', 'lava'];
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

### 8.5 Prompt Caching (Economia de Custos)

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

### 8.6 Minified Documentation (Documentação Compacta da API)

**Problema:** Enviar a documentação completa do Mineflayer para o LLM em cada chamada consome muitos tokens e aumenta custos.

**Solução:** Incluir apenas uma versão minificada dos métodos permitidos, reduzindo o contexto de ~50KB para ~3KB.

```javascript
// llm/minifiedDocs.js

class MinifiedDocs {
  constructor() {
    // Apenas métodos permitidos e essenciais
    this.allowedMethods = {
      // Movimento
      'bot.pathfinder.goto': 'Vai até coordenada. Args: GoalBlock(x,y,z)',
      'bot.pathfinder.stop': 'Para movimento.',
      'bot.setControlState': 'Define estado. Args: control(str), state(bool)',
      'bot.jump': 'Pula.',

      // Blocos
      'bot.dig': 'Quebra bloco. Args: block, forceAnimate(bool)',
      'bot.placeBlock': 'Coloca bloco. Args: referenceBlock, faceVector',
      'bot.findBlocks': 'Encontra blocos. Args: matching, maxDistance, count',
      'bot.blockAt': 'Bloco em posição. Args: position',

      // Inventário
      'bot.inventory.items': 'Lista itens do inventário.',
      'bot.equip': 'Equipa item. Args: item, destination',
      'bot.unequip': 'Desequipa. Args: destination',
      'bot.toss': 'Joga item. Args: itemType, metadata, count',
      'bot.openChest': 'Abre baú. Args: chestBlock',
      'bot.closeWindow': 'Fecha janela.',

      // Entidades
      'bot.entities': 'Objeto com todas entidades visíveis.',
      'bot.nearestEntity': 'Entidade mais próxima. Args: filter',
      'bot.attack': 'Ataca entidade. Args: entity',

      // Chat
      'bot.chat': 'Envia mensagem no chat. Args: message',
      'bot.whisper': 'Sussurra para jogador. Args: username, message',

      // Utilitários
      'bot.lookAt': 'Olha para ponto. Args: point',
      'bot.entity.position': 'Posição atual do bot.',
      'bot.health': 'Vida atual.',
      'bot.food': 'Fome atual.'
    };
  }

  // Gera documentação minificada para o prompt
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

  // Verifica se código usa apenas métodos permitidos
  validateCode(code) {
    const usedMethods = [];

    for (const method of Object.keys(this.allowedMethods)) {
      const regex = new RegExp(method.replace(/\./g, '\\.'), 'g');
      if (regex.test(code)) {
        usedMethods.push(method);
      }
    }

    return {
      allowed: usedMethods,
      unknown: this.findUnknownMethods(code)
    };
  }

  findUnknownMethods(code) {
    // Detecta padrões como bot.algo ou bot.algo.algo
    const methodPattern = /bot\.[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*/g;
    const matches = code.match(methodPattern) || [];

    return matches.filter(m => !this.allowedMethods[m]);
  }
}

module.exports = MinifiedDocs;
```

**Uso no Prompt:**
```javascript
// Em prompts.js
const minifiedDocs = new MinifiedDocs();

const codeSystemPrompt = `
Você é um assistente que gera código JavaScript para controlar um bot de Minecraft.

${minifiedDocs.generate()}

[INSTRUÇÕES]
1. Gere código JavaScript assíncrono usando APENAS os métodos permitidos
2. Use try/catch para tratamento de erros
3. Retorne JSON com campo "code" contendo o código
4. Comente o código em português brasileiro
`;
```

**Benefícios:**
- Reduz contexto de ~50KB para ~3KB
- Segurança: expõe apenas métodos permitidos
- Validação: detecta uso de métodos não permitidos
- Manutenção: fácil atualização de métodos

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

### 9.4 `healthCheck.js` - Verificação de Integridade

**Função:** Verifica se todos os componentes do sistema estão funcionais.

```javascript
// utils/healthCheck.js

class HealthCheck {
  constructor(bot, db, embeddings, llm) {
    this.bot = bot;
    this.db = db;
    this.embeddings = embeddings;
    this.llm = llm;
  }

  // Verifica saúde completa do sistema
  async checkAll() {
    const results = {
      timestamp: new Date().toISOString(),
      overall: 'healthy',
      components: {}
    };

    // 1. Conexão com Minecraft
    results.components.minecraft = this.checkMinecraft();

    // 2. Banco de dados
    results.components.database = await this.checkDatabase();

    // 3. Embeddings
    results.components.embeddings = this.checkEmbeddings();

    // 4. LLM Provider
    results.components.llm = await this.checkLLM();

    // 5. Memória RAM
    results.components.memory = this.checkMemory();

    // Determina status geral
    const hasUnhealthy = Object.values(results.components)
      .some(c => c.status === 'unhealthy');

    if (hasUnhealthy) {
      results.overall = 'degraded';
    }

    return results;
  }

  checkMinecraft() {
    return {
      status: this.bot?.entity ? 'healthy' : 'unhealthy',
      connected: !!this.bot?.entity,
      position: this.bot?.entity?.position || null,
      health: this.bot?.health || 0,
      food: this.bot?.food || 0
    };
  }

  async checkDatabase() {
    try {
      await this.db.get('SELECT 1');
      return { status: 'healthy', type: 'sqlite-vec' };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  checkEmbeddings() {
    return {
      status: this.embeddings?.localModel ? 'healthy' : 'not_loaded',
      mode: this.embeddings?.mode || 'unknown',
      cacheSize: this.embeddings?.cache?.size || 0
    };
  }

  async checkLLM() {
    try {
      // Teste simples - apenas verifica se provider está configurado
      const provider = this.llm?.router?.primary;
      return {
        status: provider ? 'healthy' : 'unhealthy',
        provider: provider?.name || 'none'
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  checkMemory() {
    const usage = process.memoryUsage();
    const MB = 1024 * 1024;

    return {
      status: usage.heapUsed / usage.heapTotal < 0.91 ? 'healthy' : 'warning',
      heapUsedMB: Math.round(usage.heapUsed / MB),
      heapTotalMB: Math.round(usage.heapTotal / MB),
      externalMB: Math.round(usage.external / MB),
      rssMB: Math.round(usage.rss / MB)
    };
  }

  // Log de saúde para monitoramento
  async logHealth() {
    const health = await this.checkAll();

    if (health.overall !== 'healthy') {
      logger.warn('[HealthCheck] Sistema degradado:', health);
    } else {
      logger.debug('[HealthCheck] Sistema saudável');
    }

    return health;
  }
}
```

**Uso:**
```javascript
// No startup
const health = new HealthCheck(bot, db, embeddings, llm);
await health.logHealth();

// Periodicamente (a cada 5 min)
setInterval(() => health.logHealth(), 300000);
```

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

### 10.6 Identidade do Bot e Detecção Multi-Bot

**Problema:** Quando múltiplos bots estão no mesmo servidor, usar prefixo `!` causa confusão - todos os bots respondem ao mesmo comando.

**Solução:** Sistema de identidade do bot com detecção automática de outros bots e mudança de modo de resposta.

#### Configuração de Identidade

```json
{
  "bot": {
    "identity": {
      "name": "ClawMC_Alpha",
      "displayName": "Alpha",
      "owner": "Luanv",
      "ownerNickname": "Luan",
      "role": "miner",
      "color": "§b"  // Código de cor do Minecraft
    },
    "response": {
      "mode": "auto",
      "defaultPrefix": "!",
      "mentionPrefix": true
    }
  }
}
```

#### Modos de Resposta

| Modo | Comportamento | Uso |
|------|--------------|-----|
| `single` | Sempre usa `!` prefixo | Apenas um bot no servidor |
| `mention` | Sempre requer `@bot_name` | Múltiplos bots |
| `auto` | Detecta e ajusta automaticamente | **Recomendado** |

#### Implementação

```javascript
// core/botIdentity.js

class BotIdentity {
  constructor(config, bot) {
    this.config = config;
    this.bot = bot;
    this.name = config.bot.identity.name;
    this.displayName = config.bot.identity.displayName;
    this.owner = config.bot.identity.owner;
    this.ownerNickname = config.bot.identity.ownerNickname;

    // Modo de resposta
    this.responseMode = config.bot.response.mode; // 'single', 'mention', 'auto'
    this.defaultPrefix = config.bot.response.defaultPrefix;
    this.knownPeers = new Map(); // Outros bots detectados
    this.isMultiBotMode = false;
  }

  // Inicializa detecção de outros bots
  async init() {
    // Anuncia presença
    this.announcePresence();

    // Escuta por anúncios de outros bots
    this.bot.on('chat', (username, message) => {
      this.detectOtherBot(username, message);
    });

    // Se modo auto, verifica após 30 segundos
    if (this.responseMode === 'auto') {
      setTimeout(() => this.checkMultiBotMode(), 30000);
    }
  }

  // Anuncia presença no servidor
  announcePresence() {
    const announcement = `[COMM:HELLO] ${JSON.stringify({
      name: this.name,
      displayName: this.displayName,
      owner: this.owner,
      role: this.config.bot.identity.role,
      timestamp: Date.now()
    })}`;

    this.bot.chat(announcement);
  }

  // Detecta outros bots no servidor
  detectOtherBot(username, message) {
    // Ignora próprias mensagens
    if (username === this.bot.username) return;

    // Verifica se é anúncio de bot
    if (message.startsWith('[COMM:HELLO]')) {
      try {
        const data = JSON.parse(message.replace('[COMM:HELLO]', '').trim());

        // Registra peer
        this.knownPeers.set(data.name, {
          ...data,
          lastSeen: Date.now()
        });

        logger.info(`[BotIdentity] Bot detectado: ${data.name} (owner: ${data.owner})`);

        // Atualiza modo se necessário
        if (this.responseMode === 'auto') {
          this.enableMultiBotMode();
        }
      } catch (e) {
        // Não é um anúncio de bot válido
      }
    }
  }

  // Verifica se deve usar modo multi-bot
  checkMultiBotMode() {
    if (this.knownPeers.size > 0) {
      this.enableMultiBotMode();
    } else {
      logger.info('[BotIdentity] Nenhum outro bot detectado, mantendo modo single');
    }
  }

  // Ativa modo multi-bot
  enableMultiBotMode() {
    if (this.isMultiBotMode) return;

    this.isMultiBotMode = true;
    logger.info(`[BotIdentity] Modo multi-bot ativado. Respondendo apenas a @${this.name}`);

    // Notifica owner
    this.bot.chat(`Modo multi-bot ativado. Use @${this.name} para me chamar.`);
  }

  // Verifica se mensagem é para este bot
  isForMe(username, message) {
    // Modo single: aceita prefixo !
    if (!this.isMultiBotMode) {
      return message.startsWith(this.defaultPrefix);
    }

    // Modo multi-bot: requer menção
    const mentionPattern = new RegExp(`@${this.name}|@${this.displayName}`, 'i');
    if (mentionPattern.test(message)) {
      return true;
    }

    // Owner pode usar comando direto (sem menção)
    if (username === this.owner || username === this.ownerNickname) {
      // Mas apenas se a mensagem NÃO parece ser para outro bot
      const otherBotMention = Array.from(this.knownPeers.values())
        .some(peer => message.includes(`@${peer.name}`) || message.includes(`@${peer.displayName}`));

      if (!otherBotMention && message.startsWith(this.defaultPrefix)) {
        return true;
      }
    }

    return false;
  }

  // Extrai comando da mensagem
  parseCommand(username, message) {
    let command = message;

    // Remove menção se presente
    command = command.replace(new RegExp(`@${this.name}|@${this.displayName}`, 'gi'), '').trim();

    // Remove prefixo
    if (command.startsWith(this.defaultPrefix)) {
      command = command.slice(this.defaultPrefix.length).trim();
    }

    return command;
  }

  // Lista bots conhecidos
  listKnownPeers() {
    return Array.from(this.knownPeers.values());
  }

  // Verifica se owner está online
  isOwnerOnline() {
    const players = Object.keys(this.bot.players);
    return players.includes(this.owner) || players.includes(this.ownerNickname);
  }
}
```

#### Integração com Commands

```javascript
// core/commands.js

class CommandParser {
  constructor(identity) {
    this.identity = identity;
  }

  parse(username, message) {
    // Verifica se mensagem é para este bot
    if (!this.identity.isForMe(username, message)) {
      return null; // Ignora mensagem
    }

    // Extrai comando
    const command = this.identity.parseCommand(username, message);

    // Parseia argumentos
    const parts = command.split(/\s+/);
    const intent = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    return { intent, args, raw: command };
  }
}
```

#### Fluxo de Detecção

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOT STARTUP                                   │
│                                                                  │
│  1. Bot conecta ao servidor                                      │
│  2. Carrega config.bot.identity                                  │
│  3. responseMode = "auto"                                        │
│  4. Aguarda 30 segundos                                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    DETECÇÃO                                      │
│                                                                  │
│  [COMM:HELLO] {"name":"Bot_Alpha","owner":"Luanv"}              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Bot A (Luanv)                                               │  │
│  │ - Recebe HELLO de Bot B                                     │  │
│  │ - knownPeers.set("Bot_B", {...})                            │  │
│  │ - enableMultiBotMode()                                       │  │
│  │ - Agora responde apenas a @Bot_A                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                    MODO MULTI-BOT                                │
│                                                                  │
│  Jogador: "!mine iron"                                           │
│  → Bot A: IGNORA (requer @Bot_A)                                │
│  → Bot B: IGNORA (requer @Bot_B)                                │
│                                                                  │
│  Jogador: "@Bot_A mine iron"                                     │
│  → Bot A: Executa comando                                        │
│  → Bot B: IGNORA                                                 │
│                                                                  │
│  Owner (Luanv): "!mine iron"                                     │
│  → Bot A: Executa comando (owner tem privilégio)                 │
│  → Bot B: IGNORA                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Configuração Completa

```json
{
  "bot": {
    "identity": {
      "name": "ClawMC_Alpha",
      "displayName": "Alpha",
      "owner": "Luanv",
      "ownerNickname": "Luan",
      "role": "miner",
      "color": "§b"
    },
    "response": {
      "mode": "auto",
      "defaultPrefix": "!",
      "mentionPrefix": true,
      "ownerPrivilege": true
    },
    "server": {
      "host": "localhost",
      "port": 25565,
      "version": "1.20.4"
    }
  }
}
```

**Notas:**
- `mode: "auto"` é recomendado para flexibilidade
- `ownerPrivilege: true` permite que o owner use `!comando` sem menção
- `color` é o código de cor do Minecraft para o nome do bot no chat
- O bot só responde ao owner sem menção se não houver menção a outro bot na mesma mensagem

---

## 11. Configuração

### 11.1 `config.json`

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

### 11.2 `.env.example`

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
│    → Salva embedding em skills_vss_local (ou _api)                            │
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

### 13.1 Reconexão Automática

- Backoff exponencial: 5s → 10s → 20s → 40s...
- Máximo de 10 tentativas
- Reconecta automaticamente em caso de disconnect/kick

### 13.2 Timeout de Tarefas

- Timeout padrão: 30 minutos (configurável)
- Auto-cancela tarefa se exceder
- Notifica via chat

### 13.3 Fallback de Provider LLM

- Rate limit (429): aguarda `retry-after` segundos
- Erro de auth (401/403): desabilita provider permanentemente
- Erro de servidor (5xx): tenta próximo provider
- Timeout de conexão: retry após 3s

### 13.4 Sandbox de Execução

- Timeout de 30 segundos
- Sem acesso a: filesystem, network, process, require
- Apenas: bot, params, console limitado, Math, Date

### 13.5 Falha Total de Providers LLM

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

### 13.6 Concorrência de Comandos

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

### 13.7 Estado Durante Morte/Respawn

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

### 13.8 Recuperação de Skills Dinâmicas Corrompidas

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

## 14.1 Requisitos de Ambiente e Problemas Conhecidos

### 14.1.1 `isolated-vm` no Windows

**⚠️ Problema Conhecido:**

A dependência `isolated-vm` tem problemas conhecidos de compilação no Windows:

- Requer toolchain C++ nativa (Visual Studio Build Tools)
- Incompatível com Node.js 18+ em alguns casos
- Builds frequentemente falham com erros de linkagem
- Requer Python 3.x configurado corretamente

**Soluções Recomendadas:**

| Opção | Descrição | Segurança | Dificuldade |
|-------|-----------|-----------|-------------|
| **1. WSL2** | Executar em Windows Subsystem for Linux | ⭐⭐⭐⭐⭐ | Baixa |
| **2. Docker** | Container Linux com Node.js | ⭐⭐⭐⭐⭐ | Média |
| **3. SES** | Usar `ses` (Secure ECMAScript) como alternativa | ⭐⭐⭐ | Baixa |
| **4. VM2** | Usar `vm2` como alternativa (mais portável) | ⭐⭐ | Baixa |
| **5. Build Tools** | Instalar Visual Studio Build Tools completo | ⭐⭐⭐⭐ | Alta |

**Implementação da Alternativa (SES):**

```javascript
// skills/executor.js - Alternativa com SES

import { makeHardener, lockdown } from 'ses';

// Lockdown global para segurança
lockdown();

// Sandbox com SES
class SESSandbox {
  constructor() {
    this.harden = makeHardener();
  }

  async execute(code, context, timeout = 30000) {
    // Cria sandbox SES
    const sandbox = this.createSandbox(context);

    // Compila código em sandbox isolada
    const compartment = new Compartment({
      ...sandbox,
      console: this.createSafeConsole()
    });

    // Executa com timeout
    const executeWithTimeout = Promise.race([
      compartment.evaluate(code),
      this.createTimeout(timeout)
    ]);

    return executeWithTimeout;
  }

  createSandbox(context) {
    // Apenas objetos permitidos
    return {
      bot: this.harden(this.proxyBot(context.bot)),
      params: this.harden(context.params),
      Math: this.harden(Math),
      Date: this.harden(Date),
      JSON: this.harden(JSON)
    };
  }

  createSafeConsole() {
    // Console limitado (apenas log, warn, error)
    return {
      log: (...args) => logger.debug('[Sandbox]', ...args),
      warn: (...args) => logger.warn('[Sandbox]', ...args),
      error: (...args) => logger.error('[Sandbox]', ...args)
    };
  }
}
```

**Verificação de Ambiente:**

```javascript
// utils/environmentCheck.js

async function checkEnvironment() {
  const issues = [];

  // 1. Verifica Node.js version
  const nodeVersion = process.versions.node;
  if (nodeVersion < '18.0.0') {
    issues.push(`Node.js ${nodeVersion} muito antigo. Recomendado: 18.x ou 20.x`);
  }

  // 2. Verifica se isolated-vm está disponível
  let hasIsolatedVM = false;
  try {
    require('isolated-vm');
    hasIsolatedVM = true;
  } catch (e) {
    issues.push('isolated-vm não disponível. Usando sandbox alternativo (SES).');
  }

  // 3. Verifica RAM disponível
  const totalRAM = require('os').totalmem();
  if (totalRAM < 6 * 1024 * 1024 * 1024) { // 6GB
    issues.push(`RAM total: ${Math.round(totalRAM / (1024*1024*1024))}GB. Recomendado: 8GB+`);
  }

  // 4. Verifica better-sqlite3
  try {
    require('better-sqlite3');
  } catch (e) {
    issues.push('better-sqlite3 não disponível. Verifique instalação.');
  }

  // 5. Verifica sqlite-vec
  try {
    require('sqlite-vec');
  } catch (e) {
    issues.push('sqlite-vec não disponível. Busca semântica não funcionará.');
  }

  return {
    nodeVersion,
    hasIsolatedVM,
    totalRAM: Math.round(totalRAM / (1024*1024*1024)),
    issues,
    isReady: issues.filter(i => !i.includes('isolated-vm')).length === 0
  };
}
```

**Configuração Condicional:**

```json
// config.json
{
  "sandbox": {
    "type": "auto",
    "timeout": 30000,
    "fallback": "ses"
  }
}
```

```javascript
// skills/executor.js

function createSandbox(config) {
  const sandboxType = config.sandbox.type;

  if (sandboxType === 'auto') {
    // Auto-detecta ambiente
    try {
      require('isolated-vm');
      logger.info('[Executor] Usando isolated-vm (sandbox seguro)');
      return new IsolatedVMSandbox(config);
    } catch (e) {
      logger.warn('[Executor] isolated-vm não disponível, usando SES');
      return new SESSandbox(config);
    }
  }

  if (sandboxType === 'isolated-vm') {
    return new IsolatedVMSandbox(config);
  }

  if (sandboxType === 'ses') {
    return new SESSandbox(config);
  }

  throw new Error(`Tipo de sandbox desconhecido: ${sandboxType}`);
}
```

### 14.1.2 Requisitos Mínimos de Hardware

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| RAM | 6GB | 8GB+ |
| CPU | 2 cores | 4 cores+ |
| Disco | 500MB | 1GB+ |
| Node.js | 18.x | 20.x LTS |

### 14.1.3 Plataformas Suportadas

| Plataforma | Status | Notas |
|------------|--------|-------|
| Linux (x64) | ✅ Totalmente suportado | Ambiente recomendado |
| macOS (x64/ARM) | ✅ Totalmente suportado | Requer Xcode Command Line Tools |
| Windows (WSL2) | ✅ Totalmente suportado | Usar WSL2 com Ubuntu |
| Windows (Nativo) | ⚠️ Parcialmente suportado | isolated-vm pode falhar, usar SES |
| Docker (Linux) | ✅ Totalmente suportado | Ambiente isolado recomendado |

---

## 15. Gerenciamento de Custos

### 15.1 Rastreamento de Uso

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

### 15.2 Rate Limiting

```javascript
// Configuração de rate limiting
const RATE_LIMITS = {
  maxRequestsPerMinute: 10,
  maxRequestsPerHour: 500,
  maxTokensPerDay: 1500000
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

### 15.3 Alertas de Custo

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

## 16. Dependências Nativas

### 16.1 better-sqlite3

**Aviso:** `better-sqlite3` requer compilação nativa.

#### Windows

Requer Visual Studio Build Tools:

```bash
# Instalar Build Tools
npm install --global windows-build-tools

# Ou usar alternativa WebAssembly
npm install sql.js  # Mais lento, mas sem dependências nativas
```

#### Linux

Requer ferramentas de compilação C++:

```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# Fedora/RHEL
sudo dnf install gcc-c++ make python3

# Arch Linux
sudo pacman -S base-devel python

# Após instalar dependências
npm rebuild better-sqlite3
```

**Troubleshooting Linux:**
```bash
# Se falhar com "node-gyp" errors:
npm install --global node-gyp
node-gyp rebuild --directory node_modules/better-sqlite3

# Para ARM (Raspberry Pi, etc.)
npm rebuild better-sqlite3 --target_arch=arm64
```

### 16.2 isolated-vm

**Aviso:** `isolated-vm` também requer compilação nativa.

```bash
# Verificar se compilação funciona
npm rebuild isolated-vm

# Se falhar, usar alternativa Node.js built-in
# Nota: vm module é menos seguro, requer validação extra
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# Compilar
npm rebuild isolated-vm
```

---

## 16.1 Testes Automatizados

### 16.1.1 Estrutura de Testes

```
tests/
├── unit/
│   ├── core/
│   │   ├── commands.test.js       # Parser de comandos
│   │   ├── state.test.js          # Gerenciador de estado
│   │   └── ooda.test.js           # Loop OODA
│   ├── memory/
│   │   ├── embeddings.test.js     # Sistema de embeddings
│   │   ├── rag.test.js           # Busca semântica
│   │   └── facts.test.js         # Gerenciador de fatos
│   ├── skills/
│   │   ├── executor.test.js      # Sandbox de execução
│   │   ├── registry.test.js      # Registro de skills
│   │   └── base/
│   │       ├── walk.test.js
│   │       ├── mine.test.js
│   │       └── ...
│   ├── llm/
│   │   ├── router.test.js        # Roteamento + fallback
│   │   ├── circuitBreaker.test.js # Circuit breaker
│   │   └── modelSelector.test.js  # Seleção de modelo
│   └── robustness/
│       ├── metrics.test.js
│       ├── alerts.test.js
│       ├── checkpoint.test.js
│       └── stateMachine.test.js
│
├── integration/
│   ├── bot-lifecycle.test.js      # Ciclo de vida completo
│   ├── skill-execution.test.js    # Execução de skill
│   ├── memory-flow.test.js        # Fluxo de memória
│   ├── llm-fallback.test.js       # Fallback de providers
│   └── death-recovery.test.js     # Recuperação de morte
│
├── e2e/
│   ├── commands.test.js           # Comandos de usuário
│   ├── autonomy.test.js           # Comportamento autônomo
│   └── multi-bot.test.js          # Multi-bot cooperation
│
└── mocks/
    ├── bot.mock.js                # Mock do mineflayer
    ├── llm.mock.js                # Mock do LLM
    ├── embeddings.mock.js         # Mock de embeddings
    └── server.mock.js             # Mock de servidor Minecraft
```

### 16.1.2 Mock do Bot

```javascript
// tests/mocks/bot.mock.js

function createMockBot(overrides = {}) {
  return {
    // Estado
    username: 'TestBot',
    entity: {
      position: { x: 0, y: 64, z: 0 },
      velocity: { x: 0, y: 0, z: 0 }
    },
    health: 20,
    food: 20,

    // Inventário
    inventory: {
      items: () => [],
      count: () => 0,
      slots: []
    },

    // Pathfinder
    pathfinder: {
      goto: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      setGoal: jest.fn()
    },

    // Ações
    dig: jest.fn().mockResolvedValue(undefined),
    placeBlock: jest.fn().mockResolvedValue(undefined),
    chat: jest.fn(),
    lookAt: jest.fn(),
    attack: jest.fn(),
    jump: jest.fn(),

    // Eventos
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),

    // Mundo
    findBlocks: jest.fn().mockReturnValue([]),
    blockAt: jest.fn().mockReturnValue({ name: 'air' }),
    entities: {},

    ...overrides
  };
}

module.exports = { createMockBot };
```

### 16.1.3 Teste de Exemplo

```javascript
// tests/unit/core/commands.test.js

const { CommandParser } = require('../../../src/core/commands');
const { createMockBot } = require('../../mocks/bot.mock');

describe('CommandParser', () => {
  let parser;
  let mockIdentity;

  beforeEach(() => {
    mockIdentity = {
      isForMe: jest.fn().mockReturnValue(true),
      parseCommand: jest.fn((_, msg) => msg.replace('!', '')),
      name: 'TestBot'
    };
    parser = new CommandParser(mockIdentity);
  });

  describe('parse()', () => {
    it('should parse simple command', () => {
      const result = parser.parse('Player', '!mine iron 64');
      expect(result.intent).toBe('mine');
      expect(result.args).toEqual(['iron', '64']);
    });

    it('should handle multi-word intent', () => {
      const result = parser.parse('Player', '!construa casa pedra');
      expect(result.intent).toBe('construa');
      expect(result.args).toEqual(['casa', 'pedra']);
    });

    it('should return null for non-matching command', () => {
      mockIdentity.isForMe.mockReturnValue(false);
      const result = parser.parse('Player', '!mine iron');
      expect(result).toBeNull();
    });
  });
});
```

### 16.1.4 Cobertura de Testes

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --testPathPattern=e2e"
  },
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

---

## 16.2 Schema Validation de Configuração

### 16.2.1 Validação com Zod

```javascript
// utils/configValidation.js

import { z } from 'zod';

const ServerSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().min(1).max(65535).default(25565),
  username: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.20.4'),
  auth: z.enum(['offline', 'microsoft', 'mojang']).default('offline')
});

const LLMProviderSchema = z.object({
  type: z.enum(['google', 'nvidia', 'openrouter', 'ollama', 'openai']),
  model: z.string(),
  apiKey: z.string().startsWith('${').or(z.string().min(10))
});

const LLMConfigSchema = z.object({
  mode: z.enum(['single', 'tiered']).default('single'),
  model: z.string().optional(),
  primary: LLMProviderSchema.optional(),
  secondary: LLMProviderSchema.optional(),
  codeModel: LLMProviderSchema.optional(),
  temperature: z.object({
    chat: z.number().min(0).max(2).default(0.7),
    code: z.number().min(0).max(2).default(0.3)
  }).default({ chat: 0.7, code: 0.3 })
});

const BotConfigSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    owner: z.string().min(1),
    role: z.string().default('assistant')
  }),
  response: z.object({
    mode: z.enum(['single', 'mention', 'auto']).default('auto'),
    defaultPrefix: z.string().default('!')
  })
});

const ConfigSchema = z.object({
  server: ServerSchema,
  llm: LLMConfigSchema,
  bot: BotConfigSchema,
  memory: z.object({
    dbPath: z.string().default('./data/brain.db'),
    embeddingModel: z.string().default('Xenova/multilingual-e5-small'),
    similarityThreshold: z.number().min(0).max(1).default(0.85)
  }).optional()
});

// Validação
function validateConfig(config) {
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

module.exports = { ConfigSchema, validateConfig };
```

---

## 16.3 Migrações de Banco de Dados

### 16.3.1 Sistema de Migrações

```javascript
// database/migrations.js

const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE IF NOT EXISTS skills_metadata (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE,
        description TEXT,
        file_path TEXT,
        embedding_source TEXT,
        created_at DATETIME
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS skills_vss_local USING vec0(
        embedding FLOAT[384]
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS skills_vss_api USING vec0(
        embedding FLOAT[768]
      );

      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY,
        type TEXT,
        key TEXT,
        value TEXT,
        created_at DATETIME,
        updated_at DATETIME
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS facts_vss USING vec0(
        embedding FLOAT[384]
      );
    `,
    down: `
      DROP TABLE IF EXISTS skills_metadata;
      DROP TABLE IF EXISTS facts;
      DROP TABLE IF EXISTS skills_vss_local;
      DROP TABLE IF EXISTS skills_vss_api;
      DROP TABLE IF EXISTS facts_vss;
    `
  },
  {
    version: 2,
    name: 'add_executions_table',
    up: `
      CREATE TABLE IF NOT EXISTS executions (
        id INTEGER PRIMARY KEY,
        command TEXT,
        skill_used TEXT,
        success BOOLEAN,
        duration_ms INTEGER,
        timestamp DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_executions_timestamp ON executions(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS executions;
    `
  },
  {
    version: 3,
    name: 'add_checkpoints_table',
    up: `
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME,
        type TEXT,
        data TEXT,
        task_type TEXT,
        task_progress REAL
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS checkpoints;
    `
  },
  {
    version: 4,
    name: 'add_death_records_table',
    up: `
      CREATE TABLE IF NOT EXISTS death_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME,
        position TEXT,
        cause TEXT,
        inventory TEXT,
        dimension TEXT,
        recovered BOOLEAN DEFAULT 0,
        recovered_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_death_records_timestamp ON death_records(timestamp);
    `,
    down: `
      DROP TABLE IF EXISTS death_records;
    `
  }
];

class MigrationManager {
  constructor(db) {
    this.db = db;
  }

  async init() {
    // Cria tabela de version se não existir
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME
      )
    `);

    const currentVersion = await this.getCurrentVersion();
    return currentVersion;
  }

  async getCurrentVersion() {
    const row = await this.db.get('SELECT MAX(version) as version FROM schema_version');
    return row?.version || 0;
  }

  async migrate() {
    const currentVersion = await this.init();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      logger.info('[Migrations] Banco de dados está atualizado');
      return;
    }

    logger.info(`[Migrations] Executando ${pendingMigrations.length} migrações`);

    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
  }

  async runMigration(migration) {
    logger.info(`[Migrations] Executando: ${migration.name} (v${migration.version})`);

    try {
      await this.db.run('BEGIN TRANSACTION');
      await this.db.run(migration.up);
      await this.db.run(
        'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
        [migration.version, new Date().toISOString()]
      );
      await this.db.run('COMMIT');
      logger.info(`[Migrations] ${migration.name} aplicado com sucesso`);
    } catch (error) {
      await this.db.run('ROLLBACK');
      logger.error(`[Migrations] Erro em ${migration.name}:`, error);
      throw error;
    }
  }

  async rollback(targetVersion) {
    const currentVersion = await this.getCurrentVersion();

    if (targetVersion >= currentVersion) {
      throw new Error('Versão target deve ser menor que a atual');
    }

    const rollbackMigrations = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    for (const migration of rollbackMigrations) {
      await this.runRollback(migration);
    }
  }

  async runRollback(migration) {
    logger.info(`[Migrations] Revertendo: ${migration.name}`);

    try {
      await this.db.run('BEGIN TRANSACTION');
      await this.db.run(migration.down);
      await this.db.run(
        'DELETE FROM schema_version WHERE version = ?',
        [migration.version]
      );
      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }
}

module.exports = { MigrationManager, migrations };
```

---

## 16.4 Ordem de Inicialização

### 16.4.1 Diagrama de Dependências

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORDEM DE INICIALIZAÇÃO                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. CONFIG & ENVIRONMENT                                            │
│     ├── Load .env                                                   │
│     ├── Load config.json                                             │
│     ├── Validate schema                                             │
│     └── Setup logger                                                 │
│                                                                      │
│  2. DATABASE                                                         │
│     ├── Initialize SQLite                                            │
│     ├── Load sqlite-vec extension                                    │
│     └── Run migrations                                               │
│                                                                      │
│  3. EMBEDDINGS (se modo local)                                       │
│     └── Load @huggingface/transformers (~250MB)                     │
│                                                                      │
│  4. MEMORY LAYER                                                     │
│     ├── Init RAG                                                     │
│     ├── Load facts                                                   │
│     └── Load skill embeddings                                        │
│                                                                      │
│  5. LLM LAYER                                                        │
│     ├── Init providers                                               │
│     ├── Init router                                                  │
│     └── Init circuit breaker                                         │
│                                                                      │
│  6. ROBUSTNESS LAYER ⭐                                              │
│     ├── Init MetricsCollector                                        │
│     ├── Init EventLogger                                             │
│     ├── Init AlertSystem (+ Memory callbacks)                        │
│     ├── Init CheckpointManager                                       │
│     ├── Init DeathRecovery                                           │
│     ├── Init StuckDetector                                           │
│     ├── Init GracefulShutdown                                        │
│     └── Init StateMachine                                            │
│                                                                      │
│  7. BOT CONNECTION                                                   │
│     ├── Create mineflayer bot                                        │
│     ├── Wait for spawn                                               │
│     └── Restore from checkpoint                                      │
│                                                                      │
│  8. SKILLS LAYER                                                     │
│     ├── Load base skills                                             │
│     └── Load dynamic skills                                          │
│                                                                      │
│  9. AUTONOMY LAYER                                                   │
│     ├── Init CurriculumManager                                       │
│     ├── Init IdleLoop                                                │
│     ├── Init TaskScheduler                                           │
│     └── Init SurvivalMonitor                                         │
│                                                                      │
│  10. COMMUNITY LAYER (se enabled)                                    │
│      ├── Init BotIdentity                                            │
│      └── Announce presence                                           │
│                                                                      │
│  11. START                                                           │
│      ├── Start monitoring loops                                     │
│      ├── Start scheduled tasks                                      │
│      └── Bot is ready!                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 16.4.2 Código de Inicialização

```javascript
// src/index.js

async function main() {
  const startTime = Date.now();
  logger.info('[ClawMC] Iniciando...');

  try {
    // 1. CONFIG & ENVIRONMENT
    logger.info('[Init] Carregando configuração...');
    dotenv.config();
    const config = loadConfig('./config.json');
    const validatedConfig = validateConfig(config);

    // 2. DATABASE
    logger.info('[Init] Inicializando banco de dados...');
    const db = await initDatabase(validatedConfig.memory.dbPath);
    const migrations = new MigrationManager(db);
    await migrations.migrate();

    // 3. EMBEDDINGS
    let embeddings;
    if (validatedConfig.memory?.mode !== 'api') {
      logger.info('[Init] Carregando modelo de embeddings...');
      embeddings = new EmbeddingsManager(validatedConfig.memory?.embeddings);
      await embeddings.init();
    }

    // 4. MEMORY LAYER
    logger.info('[Init] Inicializando memória...');
    const rag = new RAGSystem(db, embeddings);
    const facts = new FactsManager(db, embeddings);

    // 5. LLM LAYER
    logger.info('[Init] Inicializando LLM...');
    const llmRouter = new LLMRouter(validatedConfig.llm);
    const circuitBreaker = new CircuitBreaker(5, 60000);

    // 6. ROBUSTNESS LAYER
    logger.info('[Init] Inicializando robustness...');
    const robustness = new RobustnessLayer(validatedConfig.robustness);
    await robustness.init(/* dependencies */);

    // 7. BOT CONNECTION
    logger.info('[Init] Conectando ao servidor...');
    const bot = await createBot(validatedConfig.server);

    bot.on('spawn', async () => {
      logger.info('[Bot] Conectado!');

      // Restaurar estado
      const restored = await robustness.restoreFromCheckpoint();
      if (restored) {
        logger.info('[Bot] Estado restaurado do checkpoint');
      }

      // 8. SKILLS LAYER
      const skills = new SkillRegistry(bot, state, llmRouter);
      await skills.loadBaseSkills();
      await skills.loadDynamicSkills();

      // 9. AUTONOMY LAYER
      const autonomy = new AutonomyManager(bot, state, curriculum, skills);
      autonomy.start();

      // 10. COMMUNITY LAYER (se enabled)
      let community = null;
      if (validatedConfig.community?.enabled) {
        community = new CommunityManager(bot, validatedConfig.community);
        await community.init();
      }

      // 11. START
      robustness.startMonitoring();
      logger.info(`[ClawMC] Pronto em ${Date.now() - startTime}ms`);
    });

  } catch (error) {
    logger.error('[Init] Falha na inicialização:', error);
    process.exit(1);
  }
}
```

---

## 16.5 Timeout Manager Global

### 16.5.1 Gerenciador Centralizado

```javascript
// utils/timeoutManager.js

class TimeoutManager {
  constructor() {
    this.timeouts = new Map();
    this.defaults = {
      skill: 30000,          // 30 segundos
      compilation: 5000,      // 5 segundos
      llm: 60000,            // 60 segundos
      pathfinding: 120000,   // 2 minutos
      checkpoint: 10000,     // 10 segundos
      reconnection: 30000,   // 30 segundos
      task: 1800000          // 30 minutos
    };
  }

  // Executa com timeout
  async withTimeout(promise, ms, operation = 'operation') {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`${operation} timeout após ${ms}ms`));
        }, ms);

        // Armazena para cancelamento
        this.timeouts.set(timeout, { operation, ms });
      })
    ]).finally(() => {
      const timeout = [...this.timeouts.keys()].find(t => t);
      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(timeout);
      }
    });
  }

  // Timeout com cancelamento
  createTimeout(callback, ms, operation) {
    const timeout = setTimeout(() => {
      logger.debug(`[Timeout] ${operation} executado após ${ms}ms`);
      callback();
    }, ms);

    this.timeouts.set(timeout, { operation, ms, callback });
    return timeout;
  }

  cancel(timeout) {
    if (this.timeouts.has(timeout)) {
      clearTimeout(timeout);
      this.timeouts.delete(timeout);
      return true;
    }
    return false;
  }

  // Cancela todos os timeouts de uma operação
  cancelAll(operation) {
    for (const [timeout, info] of this.timeouts) {
      if (info.operation === operation) {
        clearTimeout(timeout);
        this.timeouts.delete(timeout);
      }
    }
  }

  // Obtém timeout padrão para tipo
  getDefault(type) {
    return this.defaults[type] || 30000;
  }
}

module.exports = new TimeoutManager();
```

### 16.5.2 Uso nos Componentes

```javascript
// skills/executor.js
const timeoutManager = require('../utils/timeoutManager');

async executeSkill(skill, params) {
  const timeout = config.skills?.timeout || timeoutManager.getDefault('skill');

  return timeoutManager.withTimeout(
    skill.execute(bot, params),
    timeout,
    `skill:${skill.name}`
  );
}

// llm/router.js
async callLLM(prompt) {
  const timeout = config.llm?.timeout || timeoutManager.getDefault('llm');

  return timeoutManager.withTimeout(
    provider.generate(prompt),
    timeout,
    'llm_call'
  );
}
```

---

## 16.6 Modo Dry-Run

### 16.6.1 Mock do Servidor Minecraft

```javascript
// tests/mocks/server.mock.js

class MockMinecraftServer {
  constructor(config = {}) {
    this.config = config;
    this.players = new Map();
    this.entities = new Map();
    this.blocks = new Map();
    this.time = 0;
    this.weather = 'clear';
  }

  // Simula conexão de jogador
  addPlayer(username, position = { x: 0, y: 64, z: 0 }) {
    this.players.set(username, {
      username,
      position,
      health: 20,
      food: 20,
      inventory: []
    });
    return this.players.get(username);
  }

  // Simula spawn de entidade
  addEntity(type, position) {
    const id = `${type}_${Date.now()}`;
    this.entities.set(id, { type, position, id });
    return id;
  }

  // Simula bloco em posição
  setBlock(position, name, properties = {}) {
    const key = `${position.x},${position.y},${position.z}`;
    this.blocks.set(key, { name, position, properties });
  }

  // Simula evento de chat
  emitChat(username, message) {
    console.log(`[MockServer] ${username}: ${message}`);
    // Emite para todos os bots conectados
    return { username, message, timestamp: Date.now() };
  }

  // Avança tempo do jogo
  advanceTime(ticks) {
    this.time += ticks;
  }

  // Simula ciclo dia/noite
  setDayTime(dayTime) {
    this.time = dayTime;
  }
}

// Bot mockado para testes
function createMockBotForTesting() {
  const server = new MockMinecraftServer();
  const bot = createMockBot();

  // Integra com servidor mock
  bot._server = server;

  // Simula eventos
  bot.simulate = {
    chat: (username, message) => {
      bot.emit('chat', username, message);
    },
    death: (cause) => {
      bot.health = 0;
      bot.emit('death');
    },
    spawn: () => {
      bot.emit('spawn');
    },
    damage: (amount) => {
      bot.health = Math.max(0, bot.health - amount);
      bot.emit('health', bot.health, bot.food);
    }
  };

  return bot;
}

module.exports = { MockMinecraftServer, createMockBotForTesting };
```

### 16.6.2 Configuração Dry-Run

```json
// config.dryrun.json
{
  "server": {
    "mode": "dry-run",
    "mockDelays": true
  },
  "llm": {
    "mode": "mock",
    "mockResponses": {
      "chat": "Resposta simulada do bot.",
      "code": "async function execute(bot, params) { return { success: true }; }"
    }
  },
  "memory": {
    "mode": "mock",
    "persistToDisk": false
  },
  "skills": {
    "executeRealCode": false,
    "mockExecutionTime": 1000
  }
}
```

### 16.6.3 Script de Teste Dry-Run

```javascript
// scripts/dry-run.js

async function runDryRunTests() {
  logger.info('[DryRun] Iniciando testes em modo simulado...');

  // Carrega config de dry-run
  const config = loadConfig('./config.dryrun.json');

  // Cria bot mockado
  const bot = createMockBotForTesting();

  // Inicializa componentes com mocks
  const state = new StateManager();
  const skills = new SkillRegistry(bot, state);
  const autonomy = new AutonomyManager(bot, state, skills);

  // Testes
  const tests = [
    testCommandParsing,
    testSkillExecution,
    testDeathRecovery,
    testAutonomousBehavior,
    testMemoryFlow
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test(bot, config);
      logger.info(`[DryRun] ✓ ${test.name}`);
      passed++;
    } catch (error) {
      logger.error(`[DryRun] ✗ ${test.name}:`, error.message);
      failed++;
    }
  }

  logger.info(`[DryRun] Resultados: ${passed} passou, ${failed} falhou`);
  process.exit(failed > 0 ? 1 : 0);
}

async function testCommandParsing(bot, config) {
  const parser = new CommandParser(config.bot.identity);
  const result = parser.parse('Player', '!mine iron 64');
  assert(result.intent === 'mine');
  assert(result.args.length === 2);
}

async function testSkillExecution(bot, config) {
  // Simula execução de skill
}

// ... outros testes
```

---

## 16.7 Telemetria Opcional

### 16.7.1 Sistema de Telemetria

```javascript
// utils/telemetry.js

class Telemetry {
  constructor(config) {
    this.enabled = config.telemetry?.enabled || false;
    this.endpoint = config.telemetry?.endpoint;
    this.apiKey = config.telemetry?.apiKey;
    this.buffer = [];
    this.flushInterval = 60000; // 1 minuto
  }

  // Registra evento
  track(event, data = {}) {
    if (!this.enabled) return;

    this.buffer.push({
      event,
      data,
      timestamp: new Date().toISOString(),
      botId: process.env.BOT_ID || 'unknown'
    });

    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  // Envia buffer
  async flush() {
    if (!this.enabled || this.buffer.length === 0) return;

    const payload = [...this.buffer];
    this.buffer = [];

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ events: payload })
      });
    } catch (error) {
      // Silently fail - telemetria não deve afetar operação
      this.buffer.unshift(...payload);
    }
  }

  // Inicia flush periódico
  start() {
    if (!this.enabled) return;

    setInterval(() => this.flush(), this.flushInterval);
  }
}

// Eventos rastreados
const TELEMETRY_EVENTS = {
  // Uso
  SKILL_EXECUTED: 'skill_executed',
  LLM_CALL: 'llm_call',
  COMMAND_RECEIVED: 'command_received',

  // Performance
  BOT_SPAWN: 'bot_spawn',
  BOT_DEATH: 'bot_death',
  BOT_STUCK: 'bot_stuck',

  // Sistema
  MEMORY_WARNING: 'memory_warning',
  CHECKPOINT_SAVED: 'checkpoint_saved',
  PROVIDER_FALLBACK: 'provider_fallback'
};

module.exports = { Telemetry, TELEMETRY_EVENTS };
```

### 16.7.2 Configuração

```json
{
  "telemetry": {
    "enabled": false,
    "endpoint": "https://telemetry.example.com/api/events",
    "apiKey": "${TELEMETRY_API_KEY}",
    "events": [
      "skill_executed",
      "llm_call",
      "bot_death",
      "provider_fallback"
    ]
  }
}
```

---

## 16.8 Health Check HTTP

### 16.8.1 Servidor HTTP para Monitoramento

```javascript
// utils/httpServer.js

const http = require('http');

class HealthServer {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.robustness = null;
  }

  start(robustness) {
    this.robustness = robustness;

    this.server = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        await this.handleHealth(req, res);
      } else if (req.url === '/metrics') {
        await this.handleMetrics(req, res);
      } else if (req.url === '/ready') {
        this.handleReady(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, () => {
      logger.info(`[HealthServer] Servidor de saúde iniciado na porta ${this.port}`);
    });
  }

  async handleHealth(req, res) {
    try {
      const health = this.robustness?.getHealth() || { status: 'unknown' };
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  async handleMetrics(req, res) {
    try {
      const metrics = this.robustness?.metrics?.export() || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics, null, 2));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  handleReady(req, res) {
    // Verifica se está pronto para receber comandos
    const isReady = this.robustness?.stateMachine?.state === 'idle';

    res.writeHead(isReady ? 200 : 503);
    res.end(JSON.stringify({ ready: isReady }));
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = { HealthServer };
```

### 16.8.2 Endpoints

| Endpoint | Descrição | Status Codes |
|----------|-----------|--------------|
| `GET /health` | Saúde completa do bot | 200 (healthy), 503 (degraded) |
| `GET /metrics` | Métricas detalhadas | 200 |
| `GET /ready` | Pronto para comandos | 200 (ready), 503 (busy) |

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
| **Circadian Cycle Events** | Definido | Média |
| **State Persistence** | Definido | Média |
| Autonomy Layer (Voyager) | Definido | Alta |
| Memory Layer (Híbrido) | Definido | Alta |
| **Graceful Degradation (91%)** | Definido | Alta |
| **Hybrid Search** | Definido | Alta |
| Skill Documentation Embedding | Definido | Alta |
| Skills Layer | Definido | Alta |
| **Test-First Agent Loop** | Definido | Média |
| Dynamic Turn Limits | Definido | Alta |
| LLM Layer (Multi-provider) | Definido | Alta |
| **Model Selection (Configurável)** | Definido | Média |
| **Circuit Breaker** | Definido | Média |
| Semantic Snapshots | Definido | Alta |
| Prompt Caching | Definido | Média |
| **Minified Documentation** | Definido | Alta |
| Community Layer (Multi-Bot) | Definido | Alta |
| Utils Layer | Definido | Média |
| **Health Check System** | Definido | Baixa |
| Gerenciamento de Custos | Definido | Média |
| Dependências Nativas | Documentado | Baixa |

---

**Documento aprovado em:** 2026-03-17
**Local:** `D:/Users/luanv/OneDrive/Área de Trabalho/GAMES/Trabalhos/ClawMC/`