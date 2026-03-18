# ClawMC - Robustness Layer Design

**Versão:** 1.0.0
**Data:** 2026-03-18
**Autor:** Luanv + Claude
**Status:** Aprovado

---

## 1. Visão Geral

### 1.1 Objetivo

Implementar uma camada de robustez para o ClawMC que melhore a observabilidade, recuperação de falhas e persistência de estado, tornando o bot mais estável e confiável.

### 1.2 Escopo

Este design cobre:
- Sistema de métricas e logging estruturado
- Sistema de alertas automáticos
- Shutdown gracioso
- Recuperação de morte
- Detecção de travamento
- Checkpoint de progresso

### 1.3 Decisões Arquiteturais

| Decisão | Justificativa |
|---------|---------------|
| **Camada separada** | Modularidade, fácil manutenção |
| **JSON para status** | Interoperabilidade, fácil consumo externo |
| **Checkpoint em SQLite** | Persistência confiável, já existe no projeto |
| **Eventos estruturados** | Logs JSON para análise posterior |

---

## 2. Arquitetura

### 2.1 Diagrama

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROBUSTNESS LAYER                               │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   OBSERVABILITY  │  │    RECOVERY     │  │   PERSISTENCE   │  │
│  │                  │  │                 │  │                 │  │
│  │  • Metrics       │  │  • Graceful    │  │  • Checkpoint   │  │
│  │  • Event Log     │  │    Shutdown    │  │    Manager      │  │
│  │  • Health Check  │  │  • Death       │  │  • State        │  │
│  │    Enhanced      │  │    Detection   │  │    Snapshot     │  │
│  │  • Alert System  │  │  • Stuck       │  │  • Resume       │  │
│  │                  │  │    Detector    │  │    Handler      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                │
│                    ┌─────────────────┐                          │
│                    │   STATUS FILE   │                          │
│                    │  (JSON export)  │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Estrutura de Arquivos

```
src/
├── robustness/
│   ├── index.js           # Exporta RobustnessLayer
│   ├── metrics.js         # Coleta de métricas
│   ├── eventLog.js        # Log estruturado de eventos
│   ├── alerts.js          # Sistema de alertas
│   ├── gracefulShutdown.js   # Shutdown gracioso
│   ├── deathRecovery.js   # Recuperação de morte
│   ├── stuckDetector.js   # Detecção de travamento
│   └── checkpoint.js      # Checkpoint de progresso
│
├── logs/
│   ├── events-YYYY-MM-DD.jsonl   # Eventos do dia
│   └── status.json               # Status atual
```

---

## 3. Componentes

### 3.1 Metrics Collector

**Arquivo:** `robustness/metrics.js`

**Responsabilidade:** Coletar e agregar métricas de performance e uso.

**Métricas Coletadas:**

| Categoria | Métrica | Tipo |
|-----------|---------|------|
| **Contadores** | llmCalls | Incremento |
| | llmTokensUsed | Incremento |
| | llmErrors | Incremento |
| | skillExecutions | Incremento |
| | skillSuccesses | Incremento |
| | skillFailures | Incremento |
| | messagesReceived | Incremento |
| | messagesSent | Incremento |
| | deaths | Incremento |
| | disconnects | Incremento |
| | reconnects | Incremento |
| **Gauges** | heapUsedMB | Valor atual |
| | heapTotalMB | Valor atual |
| | heapUsagePercent | Percentual |
| | activeTasks | Contagem |
| | dbSizeMB | Tamanho |
| **Histórico** | responseTimeHistory | Últimos 100 |
| | taskDurationHistory | Últimas 50 |

**API:**

```javascript
// Incrementa contador
metrics.increment('llmCalls');
metrics.increment('llmTokensUsed', 500);

// Define gauge
metrics.setGauge('heapUsedMB', 245);

// Registra tempo de resposta
metrics.recordResponseTime(250); // ms

// Registra duração de tarefa
metrics.recordTaskDuration('mining', 30000, true);

// Exporta métricas
const data = metrics.export();
```

---

### 3.2 Event Logger

**Arquivo:** `robustness/eventLog.js`

**Responsabilidade:** Log estruturado de eventos com níveis.

**Níveis:**
- `DEBUG` (0): Informação detalhada para desenvolvimento
- `INFO` (1): Eventos normais
- `WARN` (2): Condições de alerta
- `ERROR` (3): Erros recuperáveis
- `CRITICAL` (4): Erros críticos

**Formato de Log:**

```json
{
  "timestamp": "2026-03-18T12:34:56.789Z",
  "level": "INFO",
  "category": "LLM",
  "event": "call",
  "provider": "google",
  "model": "gemini-3.1-flash-lite-preview",
  "promptTokens": 150,
  "completionTokens": 80,
  "durationMs": 250,
  "success": true
}
```

**Eventos Específicos:**

| Evento | Categoria | Nível | Dados |
|--------|-----------|-------|-------|
| `call` | LLM | INFO | provider, model, tokens, duration |
| `execution` | SKILL | INFO/WARN | skill, params, duration, success |
| `death` | BOT | CRITICAL | position, cause, inventory |
| `disconnect` | BOT | WARN/ERROR | reason, willReconnect |
| `memory_pressure` | SYSTEM | WARN | heapUsagePercent, action |
| `raised` | ALERT | WARN/CRITICAL | alertName, message |
| `resolved` | ALERT | INFO | alertName |

**API:**

```javascript
// Log genérico
eventLog.log('INFO', 'LLM', 'call', { provider: 'google', duration: 250 });

// Métodos de conveniência
eventLog.debug('SKILL', 'execution', { skill: 'mine' });
eventLog.info('BOT', 'spawned', { position });
eventLog.warn('SYSTEM', 'memory_pressure', { percent: 88 });
eventLog.error('LLM', 'error', { provider: 'google', error: err.message });
eventLog.critical('BOT', 'death', { position, cause });

// Métodos específicos
eventLog.logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success);
eventLog.logSkillExecution(skill, params, durationMs, success, error);
eventLog.logBotDeath(position, cause, inventory);
eventLog.logDisconnect(reason, willReconnect);
eventLog.logMemoryWarning(usagePercent, action);
```

---

### 3.3 Alert System

**Arquivo:** `robustness/alerts.js`

**Responsabilidade:** Detectar condições anormais e gerar alertas.

**Condições Monitoradas:**

| Nome | Condição | Severidade |
|------|----------|------------|
| `memoryHigh` | heapUsagePercent > 85% | warning |
| `memoryCritical` | heapUsagePercent > 91% | critical |
| `llmHighErrorRate` | llmErrorRate > 20% | warning |
| `llmDown` | llmErrors > 5 | critical |
| `skillHighFailureRate` | skillSuccessRate < 70% | warning |
| `taskStuck` | task sem progresso > 30min | warning |
| `dbSizeLarge` | dbSizeMB > 100 | info |

**API:**

```javascript
// Verifica todas as condições
const newAlerts = alerts.check();

// Lista alertas ativos
const active = alerts.getActiveAlerts();

// Marca alerta como resolvido
alerts.resolveAlert('memoryHigh');

// Exporta status
const status = alerts.export();
```

**Estrutura de Alerta:**

```javascript
{
  name: 'memoryHigh',
  message: 'Uso de memória alto',
  severity: 'warning',
  timestamp: '2026-03-18T12:34:56.789Z',
  acknowledged: false,
  resolvedAt: null  // Preenchido quando resolvido
}
```

---

### 3.4 Graceful Shutdown

**Arquivo:** `robustness/gracefulShutdown.js`

**Responsabilidade:** Desligar o bot de forma segura.

**Fluxo de Shutdown:**

```
Sinal (SIGINT/SIGTERM/Exceção)
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Parar aceitação de comandos      │
│    state.setAcceptingCommands(false)│
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. Interromper tarefa atual        │
│    state.clearTask()                │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. Salvar checkpoint               │
│    checkpoint.save('shutdown')     │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. Salvar estado no banco         │
│    db.run('INSERT INTO bot_state') │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 5. Desconectar do servidor         │
│    bot.chat('Desconectando...')    │
│    bot.quit()                       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 6. Fechar banco de dados           │
│    db.close()                       │
└─────────────────────────────────────┘
         │
         ▼
    process.exit(0/1)
```

**API:**

```javascript
// Inicializa handlers
shutdown.init();

// Executa shutdown manualmente
await shutdown.shutdown('manual');

// Verifica se está em shutdown
if (shutdown.isInProgress()) {
  // Não aceitar novos comandos
}
```

**Sinais Capturados:**
- `SIGINT` (Ctrl+C)
- `SIGTERM` (kill)
- `uncaughtException`
- `unhandledRejection` (log apenas)

---

### 3.5 Death Recovery

**Arquivo:** `robustness/deathRecovery.js`

**Responsabilidade:** Detectar morte e planejar recuperação.

**Dados Capturados na Morte:**

```javascript
{
  timestamp: '2026-03-18T12:34:56.789Z',
  position: { x: 100, y: 64, z: -200 },
  cause: 'zombie', // 'fall', 'lava', 'unknown', etc.
  inventory: [
    { name: 'diamond_pickaxe', count: 1 },
    { name: 'iron_ingot', count: 32 }
  ],
  dimension: 'overworld'
}
```

**Fluxo de Recuperação:**

```
Bot morre
    │
    ▼
┌─────────────────────────────┐
│ handleDeath()               │
│ - Salva posição, causa      │
│ - Salva inventário          │
│ - Log CRITICAL              │
│ - Salva no banco           │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ handleRespawn()             │
│ - Aguarda cooldown (30s)    │
│ - Agenda tarefa de recuperação│
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ attemptRecovery()           │
│ - Adiciona meta urgente     │
│ - recover_body com posição  │
└─────────────────────────────┘
    │
    ▼
 Bot executa recuperação ou
 falha após maxAttempts
```

**API:**

```javascript
// Inicializa listeners
deathRecovery.init();

// Atualiza posição (chamado periodicamente)
deathRecovery.updateLastPosition();

// Atualiza inventário (chamado periodicamente)
deathRecovery.updateLastInventory();

// Marca recuperação como completa
await deathRecovery.markRecovered();

// Obtém histórico de mortes
const deaths = deathRecovery.getRecentDeaths(5);
```

**Configuração:**

```json
{
  "deathRecovery": {
    "autoRecover": true,
    "recoverBody": true,
    "rememberDeathLocation": true,
    "maxDeathAttempts": 3,
    "deathCooldown": 30000
  }
}
```

---

### 3.6 Stuck Detector

**Arquivo:** `robustness/stuckDetector.js`

**Responsabilidade:** Detectar quando o bot está travado.

**Condições de Detecção:**

| Condição | Threshold | Ação |
|----------|-----------|------|
| Posição inalterada | 3 verificações (15s) | handleStuck |
| Pathfinding falha | noPath | Incrementa contador |
| Tempo sem movimento | > 2 minutos | handleStuck |

**Fluxo de Detecção:**

```
┌─────────────────────────────┐
│ checkPosition() (5s)        │
│ - Compara posição atual     │
│ - Se tarefa ativa e parado  │
│   → incrementa stuckCount   │
└─────────────────────────────┘
    │
    ▼ (stuckCount >= 3)
┌─────────────────────────────┐
│ handleStuck()               │
│ - Loga WARN                 │
│ - isStuck = true            │
│ - attemptRecovery()         │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ attemptRecovery()           │
│ - Para pathfinder           │
│ - Tenta movimentos simples   │
│ - Avisa no chat             │
│ - Se falha 30s: cancela     │
└─────────────────────────────┘
```

**API:**

```javascript
// Inicia detecção
stuckDetector.start();

// Verifica se está travado
if (stuckDetector.isBotStuck()) {
  // Não iniciar novas tarefas
}

// Obtém duração do travamento
const duration = stuckDetector.getStuckDuration();

// Exporta para status
const status = stuckDetector.export();
```

---

### 3.7 Checkpoint Manager

**Arquivo:** `robustness/checkpoint.js`

**Responsabilidade:** Salvar e restaurar estado do bot.

**Dados do Checkpoint:**

```javascript
{
  timestamp: '2026-03-18T12:34:56.789Z',
  type: 'auto', // 'auto', 'manual', 'death', 'shutdown'
  bot: {
    position: { x: 100, y: 64, z: -200 },
    dimension: 'overworld',
    health: 20,
    food: 18
  },
  task: {
    current: { type: 'mining', progress: 0.65 },
    pending: null,
    curriculumPhase: 'gathering'
  },
  inventory: [
    { name: 'diamond_pickaxe', count: 1, slot: 0 },
    { name: 'iron_ingot', count: 32, slot: 1 }
  ],
  facts: [
    { type: 'location', key: 'base', value: {x: 100, y: 64, z: -200} }
  ],
  stats: {
    uptime: 3600,
    memory: 245000000
  }
}
```

**Tipos de Checkpoint:**

| Tipo | Quando | Automático |
|------|--------|------------|
| `auto` | A cada 5 minutos | Sim |
| `manual` | Comando do usuário | Não |
| `death` | Ao morrer | Sim |
| `shutdown` | Ao desligar | Sim |
| `task_complete` | Ao completar tarefa | Configurável |

**API:**

```javascript
// Inicializa
await checkpoint.init();

// Salva checkpoint
await checkpoint.save('auto');
await checkpoint.save('manual');

// Carrega último checkpoint
const cp = await checkpoint.loadLatest();

// Restaura de checkpoint
await checkpoint.restore();

// Lista checkpoints disponíveis
const list = await checkpoint.list(10);

// Limpa checkpoints
await checkpoint.clear();

// Exporta status
const status = checkpoint.export();
```

**Restauração ao Iniciar:**

```javascript
// No spawn do bot
bot.on('spawn', async () => {
  // Tenta restaurar de checkpoint
  const restored = await robustness.restoreFromCheckpoint();

  if (restored) {
    bot.chat('Estado restaurado! Continuando de onde parei.');
  }
});
```

---

## 4. Integração

### 4.1 Robustness Layer (index.js)

```javascript
// robustness/index.js

class RobustnessLayer {
  constructor(config) {
    this.config = config;
    this.metrics = null;
    this.eventLog = null;
    this.alerts = null;
    this.shutdown = null;
    this.deathRecovery = null;
    this.stuckDetector = null;
    this.checkpoint = null;
  }

  async init(bot, db, state, memory) {
    // Inicializa todos os componentes
    this.metrics = new MetricsCollector();
    this.eventLog = new EventLogger(this.config);
    this.alerts = new AlertSystem(this.config, this.metrics, this.eventLog);
    this.checkpoint = new CheckpointManager(bot, db, state, memory);
    await this.checkpoint.init();

    this.deathRecovery = new DeathRecovery(bot, state, memory, this.eventLog);
    this.deathRecovery.init();

    this.stuckDetector = new StuckDetector(bot, state, this.eventLog);
    this.stuckDetector.start();

    this.shutdown = new GracefulShutdown(bot, db, state, this.checkpoint);
    this.shutdown.init();

    this.startMonitoring();

    return this;
  }

  startMonitoring() {
    // Atualiza métricas a cada 30s
    setInterval(() => {
      this.metrics.updateMemoryMetrics();
      this.alerts.check();
    }, 30000);

    // Atualiza posição para death recovery a cada 10s
    setInterval(() => {
      this.deathRecovery.updateLastPosition();
      this.deathRecovery.updateLastInventory();
    }, 10000);

    // Flush de logs a cada 5s
    setInterval(() => this.eventLog.flush(), 5000);

    // Health check a cada minuto
    setInterval(() => this.reportHealth(), 60000);
  }

  // Métodos de conveniência
  logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success) {
    this.metrics.increment('llmCalls');
    this.metrics.metrics.llmTokensUsed += (promptTokens + completionTokens);
    if (!success) this.metrics.increment('llmErrors');
    this.metrics.recordResponseTime(durationMs);
    this.eventLog.logLLMCall(provider, model, promptTokens, completionTokens, durationMs, success);
  }

  logSkillExecution(skill, params, durationMs, success, error) {
    this.metrics.increment('skillExecutions');
    if (success) this.metrics.increment('skillSuccesses');
    else this.metrics.increment('skillFailures');
    this.metrics.recordTaskDuration(skill, durationMs, success);
    this.eventLog.logSkillExecution(skill, params, durationMs, success, error);
  }

  getHealth() {
    return {
      status: this.alerts.getActiveAlerts().length === 0 ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      memory: { ... },
      llm: { ... },
      skills: { ... },
      stuck: this.stuckDetector.export(),
      death: this.deathRecovery.export(),
      checkpoint: this.checkpoint.export(),
      alerts: this.alerts.getActiveAlerts()
    };
  }

  async exportStatus(health = null) {
    const status = health || this.getHealth();
    await fs.writeFile('./logs/status.json', JSON.stringify(status, null, 2));
  }
}

module.exports = RobustnessLayer;
```

### 4.2 Integração com index.js Principal

```javascript
// src/index.js

const RobustnessLayer = require('./robustness');

async function main() {
  // Inicializa bot e componentes
  const bot = mineflayer.createBot(config.server);
  const state = new StateManager();
  const db = await initDatabase();
  const memory = new MemoryManager(db);

  // Inicializa Robustness Layer
  const robustness = new RobustnessLayer({
    logDir: './logs',
    checkpointInterval: 300000,
    autoRecover: true
  });

  await robustness.init(bot, db, state, memory);

  // Hooks de eventos
  bot.on('spawn', async () => {
    robustness.eventLog.info('BOT', 'spawned', { position: bot.entity.position });
    await robustness.restoreFromCheckpoint();
  });

  bot.on('death', () => {
    // DeathRecovery já tem listener interno
  });

  // Quando executar skill
  async function executeSkill(skill, params) {
    const startTime = Date.now();
    try {
      const result = await skill.execute(bot, params);
      robustness.logSkillExecution(skill.name, params, Date.now() - startTime, true);
      return result;
    } catch (error) {
      robustness.logSkillExecution(skill.name, params, Date.now() - startTime, false, error);
      throw error;
    }
  }

  // Quando chamar LLM
  async function callLLM(prompt, context) {
    const startTime = Date.now();
    try {
      const result = await router.generate(prompt, context);
      robustness.logLLMCall(
        result.provider, result.model,
        result.promptTokens, result.completionTokens,
        Date.now() - startTime, true
      );
      return result;
    } catch (error) {
      robustness.logLLMCall('unknown', 'unknown', 0, 0, Date.now() - startTime, false);
      throw error;
    }
  }
}
```

---

## 5. Banco de Dados

### 5.1 Tabelas Adicionais

```sql
-- Tabela de checkpoints
CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME,
  type TEXT,              -- 'auto', 'manual', 'death', 'shutdown'
  data TEXT,              -- JSON com dados completos
  task_type TEXT,         -- Tipo da tarefa em andamento
  task_progress REAL      -- Progresso da tarefa (0.0 - 1.0)
);

-- Tabela de registros de morte
CREATE TABLE IF NOT EXISTS death_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME,
  position TEXT,          -- JSON {x, y, z}
  cause TEXT,             -- 'zombie', 'fall', 'unknown', etc.
  inventory TEXT,         -- JSON com itens perdidos
  dimension TEXT,         -- 'overworld', 'nether', 'end'
  recovered BOOLEAN DEFAULT 0,
  recovered_at DATETIME
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);
CREATE INDEX IF NOT EXISTS idx_death_records_timestamp ON death_records(timestamp);
```

---

## 6. Status File

### 6.1 Formato do status.json

```json
{
  "timestamp": "2026-03-18T12:34:56.789Z",
  "status": "healthy",
  "uptime": 3600,
  "bot": {
    "name": "ClawMC_Alpha",
    "position": { "x": 100, "y": 64, "z": -200 },
    "health": 20,
    "food": 18
  },
  "memory": {
    "heapUsedMB": 245,
    "heapTotalMB": 512,
    "heapUsagePercent": 48,
    "isDegraded": false
  },
  "llm": {
    "provider": "google",
    "model": "gemini-3.1-flash-lite-preview",
    "callsToday": 45,
    "avgResponseTimeMs": 250,
    "errorRate": 2
  },
  "skills": {
    "executions": 120,
    "successRate": 95
  },
  "stuck": {
    "isStuck": false,
    "stuckDuration": 0,
    "stuckReason": null
  },
  "death": {
    "totalDeaths": 3,
    "lastDeath": null,
    "recentDeaths": []
  },
  "checkpoint": {
    "lastCheckpoint": "2026-03-18T12:30:00.000Z",
    "checkpointCount": 5,
    "hasPendingTask": false
  },
  "alerts": []
}
```

---

## 7. Configuração

### 7.1 config.json

```json
{
  "robustness": {
    "enabled": true,
    "logDir": "./logs",
    "logLevel": "INFO",
    "checkpointInterval": 300000,
    "autoRecover": true,
    "deathRecovery": {
      "enabled": true,
      "autoRecover": true,
      "recoverBody": true,
      "maxDeathAttempts": 3,
      "deathCooldown": 30000
    },
    "stuckDetection": {
      "enabled": true,
      "positionCheckInterval": 5000,
      "stuckThreshold": 3,
      "maxStuckTime": 120000,
      "pathfindingTimeout": 60000
    },
    "alerts": {
      "memoryHighThreshold": 85,
      "memoryCriticalThreshold": 91,
      "llmErrorRateThreshold": 20,
      "skillFailureRateThreshold": 30,
      "taskStuckTime": 1800000
    }
  }
}
```

---

## 8. Logs

### 8.1 Formato de Log (JSONL)

```
logs/events-2026-03-18.jsonl
```

Cada linha é um JSON:

```json
{"timestamp":"2026-03-18T12:00:00.000Z","level":"INFO","category":"BOT","event":"spawned","position":{"x":100,"y":64,"z":-200}}
{"timestamp":"2026-03-18T12:00:05.123Z","level":"INFO","category":"LLM","event":"call","provider":"google","model":"gemini-3.1-flash-lite-preview","promptTokens":150,"completionTokens":80,"durationMs":250,"success":true}
{"timestamp":"2026-03-18T12:00:10.456Z","level":"INFO","category":"SKILL","event":"execution","skill":"mine","durationMs":5000,"success":true}
{"timestamp":"2026-03-18T12:00:15.789Z","level":"WARN","category":"SYSTEM","event":"memory_pressure","heapUsagePercent":88,"action":"monitoring"}
```

### 8.2 Rotação de Logs

- Logs diários: `events-YYYY-MM-DD.jsonl`
- Máximo de 7 arquivos (configurável)
- Tamanho máximo: 5MB por arquivo (configurável)

---

## 9. Benefícios Esperados

| Área | Benefício |
|------|-----------|
| **Observabilidade** | Logs estruturados, métricas, alertas automáticos |
| **Recuperação** | Restauração de estado após crash, morte ou desconexão |
| **Diagnóstico** | Status file para análise externa, histórico de eventos |
| **Estabilidade** | Detecção de travamentos, shutdown gracioso |
| **Memória** | Alertas antes de OOM, graceful degradation |

---

## 10. Próximos Passos

1. Implementar `metrics.js`
2. Implementar `eventLog.js`
3. Implementar `alerts.js`
4. Implementar `gracefulShutdown.js`
5. Implementar `deathRecovery.js`
6. Implementar `stuckDetector.js`
7. Implementar `checkpoint.js`
8. Implementar `index.js` (integração)
9. Atualizar `database.js` com novas tabelas
10. Atualizar `config.json` com configurações
11. Testes unitários para cada componente
12. Documentação de uso

---

**Documento aprovado em:** 2026-03-18
**Local:** `D:/Users/luanv/OneDrive/Área de Trabalho/GAMES/Trabalhos/ClawMC/`