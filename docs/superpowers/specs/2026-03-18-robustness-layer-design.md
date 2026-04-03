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
│                    │  STATE MACHINE  │                          │
│                    │  (Operation Lock)│                         │
│                    └─────────────────┘                          │
│                                ▼                                │
│                    ┌─────────────────┐                          │
│                    │   STATUS FILE   │                          │
│                    │  (JSON export)  │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 State Machine e Concurrency

**Problema:** Múltiplas operações podem conflitar (shutdown durante checkpoint, death recovery durante task execution).

**Solução:** State machine com locking para operações críticas.

```javascript
// robustness/stateMachine.js

class OperationStateMachine {
  constructor() {
    this.state = 'idle'; // 'idle', 'checkpointing', 'recovering', 'shutting_down'
    this.currentOperation = null;
    this.lockPromise = null;
  }

  // Tenta adquirir lock para operação
  async acquire(operation) {
    if (this.state === 'shutting_down') {
      throw new Error('Bot está desligando');
    }

    if (this.state !== 'idle') {
      // Aguarda operação atual terminar
      await this.lockPromise;
    }

    this.state = operation;
    this.currentOperation = operation;
    let resolveLock;
    this.lockPromise = new Promise(resolve => { resolveLock = resolve; });
    this.resolveLock = resolveLock;

    return () => this.release();
  }

  // Libera lock
  release() {
    this.state = 'idle';
    this.currentOperation = null;
    this.resolveLock?.();
    this.lockPromise = null;
  }

  // Verifica se pode executar
  canExecute(operation) {
    if (this.state === 'shutting_down') return false;
    return this.state === 'idle';
  }

  // Força entrada em modo shutdown
  async forceShutdown() {
    this.state = 'shutting_down';
    // Aguarda operação atual se houver
    if (this.lockPromise) {
      await this.lockPromise;
    }
  }
}
```

**Prioridade de Operações:**
1. `shutting_down` - Mais alta, bloqueia tudo
2. `recovering` - Média, para death recovery
3. `checkpointing` - Baixa, pode ser interrompida

**Uso:**

```javascript
// No checkpoint
async save(type) {
  const release = await this.stateMachine.acquire('checkpointing');
  try {
    // ... salva checkpoint
  } finally {
    release();
  }
}

// No shutdown
async shutdown(signal) {
  await this.stateMachine.forceShutdown();
  // ... continua shutdown
}
```

### 2.3 Estrutura de Arquivos

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

**Bounded Queue Implementation:**

```javascript
class MetricsCollector {
  constructor(config) {
    this.maxResponseTimeHistory = config?.maxResponseTimeHistory || 100;
    this.maxTaskDurationHistory = config?.maxTaskDurationHistory || 50;

    this.metrics = {
      // ... contadores e gauges
      responseTimeHistory: [],
      taskDurationHistory: []
    };
  }

  recordResponseTime(durationMs) {
    this.metrics.responseTimeHistory.push({
      timestamp: Date.now(),
      duration: durationMs
    });

    // BOUNDED: Remove mais antigo se exceder limite
    if (this.metrics.responseTimeHistory.length > this.maxResponseTimeHistory) {
      this.metrics.responseTimeHistory.shift();
    }

    this.metrics.lastLlmCall = Date.now();
  }

  recordTaskDuration(taskType, durationMs, success) {
    this.metrics.taskDurationHistory.push({
      task: taskType,
      duration: durationMs,
      success: success,
      timestamp: Date.now()
    });

    // BOUNDED: Remove mais antigo se exceder limite
    if (this.metrics.taskDurationHistory.length > this.maxTaskDurationHistory) {
      this.metrics.taskDurationHistory.shift();
    }
  }
}
```

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

**Hysteresis e Cooldown:**

Para evitar oscilação de alertas (ex: memória oscilando entre 84% e 86%), cada alerta tem:
- **Hysteresis:** Só dispara após N verificações consecutivas acima do threshold
- **Cooldown:** Só resolve após M verificações consecutivas abaixo do threshold

```javascript
class AlertSystem {
  constructor(config, metrics, eventLog) {
    this.config = {
      // Configuração de hysteresis
      hysteresis: {
        memoryHigh: { raiseAfter: 3, resolveAfter: 2 }, // 3 checks acima, 2 abaixo
        memoryCritical: { raiseAfter: 2, resolveAfter: 1 },
        llmHighErrorRate: { raiseAfter: 2, resolveAfter: 2 },
        // ... outros
      },
      // Cooldown entre alertas do mesmo tipo
      cooldown: {
        memoryHigh: 60000,    // 1 minuto
        memoryCritical: 30000,
        llmDown: 300000,      // 5 minutos
        taskStuck: 300000
      }
    };

    this.alertState = new Map(); // { name: { consecutiveChecks, lastRaised } }
  }

  check() {
    const newAlerts = [];

    for (const [name, condition] of Object.entries(this.conditions)) {
      const isTriggered = condition.check();
      const state = this.alertState.get(name) || {
        consecutiveChecks: 0,
        lastRaised: 0,
        isActive: false
      };

      if (isTriggered) {
        state.consecutiveChecks++;

        // Só levanta se passou hysteresis E não está em cooldown
        const hysteresis = this.config.hysteresis[name] || { raiseAfter: 1, resolveAfter: 1 };
        const cooldown = this.config.cooldown[name] || 0;
        const now = Date.now();

        if (state.consecutiveChecks >= hysteresis.raiseAfter
            && !state.isActive
            && (now - state.lastRaised > cooldown)) {

          const alert = {
            name,
            message: condition.message,
            severity: condition.severity,
            timestamp: new Date().toISOString()
          };

          newAlerts.push(alert);
          this.activeAlerts.push(alert);
          state.isActive = true;
          state.lastRaised = now;

          this.eventLog.log(condition.severity.toUpperCase(), 'ALERT', 'raised', alert);
        }
      } else {
        state.consecutiveChecks = 0;

        // Só resolve se passou hysteresis de resolução
        const hysteresis = this.config.hysteresis[name] || { raiseAfter: 1, resolveAfter: 1 };

        if (state.isActive) {
          state.resolveCount = (state.resolveCount || 0) + 1;

          if (state.resolveCount >= hysteresis.resolveAfter) {
            this.resolveAlert(name);
            state.resolveCount = 0;
          }
        }
      }

      this.alertState.set(name, state);
    }

    return newAlerts;
  }
}
```

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
  dimension: 'overworld',
  recoveryAttempts: 0  // Contador de tentativas de recuperação
}
```

**Controle de Tentativas:**

```javascript
class DeathRecovery {
  constructor(config) {
    this.maxDeathAttempts = config?.maxDeathAttempts || 3;
    this.currentAttempts = 0;  // Contador de tentativas para morte ATUAL
    this.deathHistory = [];
  }

  // Incrementa tentativa
  incrementAttempt() {
    this.currentAttempts++;
    return this.currentAttempts < this.maxDeathAttempts;
  }

  // Reseta contador (após sucesso ou mudança de contexto)
  resetAttempts() {
    this.currentAttempts = 0;
  }

  // Verifica se pode tentar novamente
  canRetry() {
    return this.currentAttempts < this.maxDeathAttempts;
  }

  // Obtém contador atual
  getAttempts() {
    return this.currentAttempts;
  }
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
│ - recoveryAttempts = 0      │
│ - Log CRITICAL              │
│ - Salva no banco           │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ handleRespawn()             │
│ - Aguarda cooldown (30s)    │
│ - recoveryAttempts++        │
│ - Agenda tarefa de recuperação│
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ attemptRecovery()           │
│ - Verifica canRetry()       │
│ - Se recoveryAttempts > max:│
│   → Abandona recuperação    │
│ - Adiciona meta urgente     │
│ - recover_body com posição  │
└─────────────────────────────┘
    │
    ▼
 Bot executa recuperação ou
 falha após maxAttempts
    │
    ▼
┌─────────────────────────────┐
│ markRecovered()             │
│ - recoveryAttempts = 0      │
│ - Registra sucesso          │
└─────────────────────────────┘
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

// Obtém contador de tentativas
const attempts = deathRecovery.getAttempts();

// Verifica se pode tentar novamente
if (deathRecovery.canRetry()) {
  // Tenta recuperar
}

// Reseta contador
deathRecovery.resetAttempts();

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

| Condição | Threshold | Ação | Descrição |
|----------|-----------|------|-----------|
| Posição inalterada | 3 verificações (15s) | handleStuck | Bot não moveu durante tarefa ativa |
| Pathfinding falha | noPath event | Incrementa contador | Pathfinder não encontrou caminho |
| Task timeout | > 30 min | handleStuck | Tarefa demorou mais que o esperado |

> **Nota:** A condição "Posição inalterada" é o método PRIMÁRIO de detecção. "Task timeout" é um mecanismo de BACKUP caso a detecção de posição falhe. Eles NÃO são simultâneos - o primeiro que disparar aciona handleStuck.

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
    │         OU
    ▼ (taskTimeout > 30min)
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

**Tratamento de Erros SQLite:**

```javascript
class CheckpointManager {
  // ... métodos anteriores

  async save(type = 'auto') {
    try {
      const checkpoint = { /* ... dados ... */ };

      // Tenta salvar no banco
      await this.db.run(`
        INSERT INTO checkpoints (timestamp, type, data, task_type, task_progress)
        VALUES (?, ?, ?, ?, ?)
      `, [/* ... */]);

      this.lastCheckpoint = checkpoint;
      return checkpoint;

    } catch (dbError) {
      // Log do erro
      this.eventLog?.error('CHECKPOINT', 'db_error', {
        error: dbError.message,
        type
      });

      // Fallback: salva em memória
      this.inMemoryBackup = checkpoint;

      // Verifica integridade do banco
      await this.verifyDatabaseIntegrity();

      return null;
    }
  }

  async verifyDatabaseIntegrity() {
    try {
      await this.db.run('PRAGMA integrity_check');
    } catch (e) {
      // Banco corrompido - tenta reconectar
      this.eventLog?.critical('DATABASE', 'integrity_failed', {
        error: e.message
      });
      await this.reconnectDatabase();
    }
  }

  async reconnectDatabase() {
    try {
      await this.db.close();
      this.db = await initDatabase(this.config.dbPath);
      this.eventLog?.info('DATABASE', 'reconnected');
    } catch (e) {
      this.eventLog?.critical('DATABASE', 'reconnect_failed', {
        error: e.message
      });
    }
  }
}
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
    const metrics = this.metrics.getStats();
    return {
      status: this.alerts.getActiveAlerts().length === 0 ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      memory: {
        heapUsedMB: this.metrics.metrics.heapUsedMB,
        heapTotalMB: this.metrics.metrics.heapTotalMB,
        heapUsagePercent: this.metrics.metrics.heapUsagePercent,
        isDegraded: this.metrics.metrics.heapUsagePercent > 91
      },
      llm: {
        calls: this.metrics.metrics.llmCalls,
        errors: this.metrics.metrics.llmErrors,
        avgResponseTimeMs: metrics.avgResponseTimeMs,
        errorRate: metrics.llmErrorRate
      },
      skills: {
        executions: this.metrics.metrics.skillExecutions,
        successRate: metrics.skillSuccessRate
      },
      stuck: this.stuckDetector.export(),
      death: this.deathRecovery.export(),
      checkpoint: this.checkpoint.export(),
      alerts: this.alerts.getActiveAlerts()
    };
  }

  // Restaura estado de checkpoint
  async restoreFromCheckpoint() {
    try {
      const restored = await this.checkpoint.restore();

      if (restored) {
        this.eventLog.info('CHECKPOINT', 'restored', {
          timestamp: this.checkpoint.lastCheckpoint?.timestamp
        });
      }

      return restored;
    } catch (error) {
      this.eventLog.error('CHECKPOINT', 'restore_failed', {
        error: error.message
      });
      return false;
    }
  }

  async exportStatus(health = null) {
    const status = health || this.getHealth();

    // ATOMIC WRITE: escreve em arquivo temporário, depois renomeia
    // Evita leitura de JSON parcial/corrompido
    const tempPath = './logs/status.json.tmp';
    const finalPath = './logs/status.json';

    try {
      await fs.writeFile(tempPath, JSON.stringify(status, null, 2));
      await fs.rename(tempPath, finalPath);
    } catch (error) {
      this.eventLog.error('STATUS', 'export_failed', {
        error: error.message
      });

      // Remove arquivo temporário se existir
      try {
        await fs.unlink(tempPath);
      } catch (e) {
        // Ignora
      }
    }
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

---

## 11. Reconexão com Backoff Exponencial

> **Nota:** Este componente deve ser implementado em `core/reconnection.js` (não no Robustness Layer), mas está documentado aqui por estar relacionado com robustez.

### 11.1 Fluxo de Reconexão

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECONEXÃO COM BACKOFF                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Desconexão detectada (evento 'end' ou 'kicked')             │
│     ↓                                                            │
│  2. Salva checkpoint (se possível)                              │
│     ↓                                                            │
│  3. Calcula delay: min(maxDelay, baseDelay * 2^attempt)         │
│     ↓                                                            │
│  4. Aguarda delay                                                │
│     ↓                                                            │
│  5. Tenta reconexão                                              │
│     ├── Sucesso → Restaura estado, reseta contador             │
│     └── Falha → Incrementa contador, volta ao passo 3          │
│                                                                  │
│  Após maxAttempts:                                               │
│     ├── Log crítico                                              │
│     └── Aguarda intervenção manual                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Implementação

```javascript
// core/reconnection.js

class ReconnectionManager {
  constructor(bot, robustness, config) {
    this.bot = bot;
    this.robustness = robustness;
    this.config = {
      baseDelay: config?.baseDelay || 5000,      // 5 segundos
      maxDelay: config?.maxDelay || 300000,       // 5 minutos
      maxAttempts: config?.maxAttempts || 10,     // 10 tentativas
      resetAfter: config?.resetAfter || 300000    // Reset após 5 min conectado
    };

    this.attempts = 0;
    this.lastAttempt = 0;
    this.reconnectTimer = null;
  }

  init() {
    this.bot.on('end', () => this.handleDisconnect('end'));
    this.bot.on('kicked', (reason) => this.handleDisconnect('kicked', reason));

    // Reseta contador após conexão estável
    this.bot.on('spawn', () => {
      setTimeout(() => {
        if (this.bot.entity) {
          this.attempts = 0;
          this.lastAttempt = 0;
        }
      }, this.config.resetAfter);
    });
  }

  async handleDisconnect(reason, details = null) {
    logger.warn(`[Reconnection] Desconectado: ${reason}`, details);

    // Tenta salvar checkpoint
    if (this.robustness?.checkpoint) {
      try {
        await this.robustness.checkpoint.save('disconnect');
      } catch (e) {
        logger.error('[Reconnection] Erro ao salvar checkpoint:', e);
      }
    }

    // Verifica se deve tentar reconectar
    if (this.attempts >= this.config.maxAttempts) {
      logger.error(`[Reconnection] Máximo de ${this.maxAttempts} tentativas atingido`);
      this.robustness?.eventLog?.critical('CONNECTION', 'max_attempts_reached', {
        reason,
        attempts: this.attempts
      });
      return;
    }

    // Calcula delay com backoff exponencial
    const delay = Math.min(
      this.config.maxDelay,
      this.config.baseDelay * Math.pow(2, this.attempts)
    );

    this.attempts++;
    this.lastAttempt = Date.now();

    logger.info(`[Reconnection] Tentativa ${this.attempts}/${this.config.maxAttempts} em ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect(reason);
    }, delay);
  }

  async reconnect(originalReason) {
    try {
      logger.info('[Reconnection] Tentando reconectar...');

      // Tenta criar novo bot
      const newBot = await createBot(this.bot.config);

      // Atualiza referência
      Object.assign(this.bot, newBot);

      // Restaura estado
      await this.robustness?.restoreFromCheckpoint();

      logger.info('[Reconnection] Reconectado com sucesso');
      this.robustness?.eventLog?.info('CONNECTION', 'reconnected', {
        attempts: this.attempts,
        originalReason
      });

    } catch (error) {
      logger.error('[Reconnection] Falha:', error.message);
      this.handleDisconnect('reconnect_failed', error.message);
    }
  }

  // Força reconexão (manual)
  forceReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.attempts = 0;
    this.reconnect('manual');
  }
}
```

---

## 12. Melhorias Adicionais

### 12.1 Race Condition no State Machine

**Problema Original:** O `acquire()` pode ter race condition quando múltiplas operações tentam adquirir o lock simultaneamente.

**Solução:** Usar fila FIFO explícita.

```javascript
// robustness/stateMachine.js (ATUALIZADO)

class OperationStateMachine {
  constructor() {
    this.state = 'idle';
    this.currentOperation = null;
    this.queue = [];  // Fila FIFO explícita
  }

  async acquire(operation) {
    if (this.state === 'shutting_down') {
      throw new Error('Bot está desligando');
    }

    // Se idle, adquire imediatamente
    if (this.state === 'idle') {
      this.state = operation;
      this.currentOperation = operation;
      return () => this.release();
    }

    // Adiciona à fila e aguarda
    return new Promise((resolve) => {
      this.queue.push({ operation, resolve });
    });
  }

  release() {
    this.state = 'idle';
    this.currentOperation = null;

    // Processa próximo da fila (FIFO)
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.state = next.operation;
      this.currentOperation = next.operation;
      next.resolve(() => this.release());
    }
  }

  canExecute(operation) {
    return this.state === 'idle' && this.queue.length === 0;
  }

  async forceShutdown() {
    this.state = 'shutting_down';

    // Rejeita todas as operações pendentes
    while (this.queue.length > 0) {
      const pending = this.queue.shift();
      pending.resolve(() => {
        throw new Error('Shutdown em andamento');
      });
    }
  }

  getQueueLength() {
    return this.queue.length;
  }
}
```

### 12.2 Whitelist para Stuck Detector

**Problema Original:** Tarefas legítimas podem manter o bot parado sem estar travado.

**Solução:** Lista de tarefas permitidas para ficar paradas.

```javascript
// robustness/stuckDetector.js (ATUALIZADO)

class StuckDetector {
  constructor(bot, state, eventLog, config) {
    this.bot = bot;
    this.state = state;
    this.eventLog = eventLog;

    // Whitelist de tarefas que podem ficar paradas
    this.stationaryTasks = new Set([
      'waiting',           // Aguardando jogador
      'guarding',          // Guardando posição
      'processing',        // Processando inventário
      'crafting',          // Craftando
      'trading',           // Trocando com villager
      'sleeping',          // Dormindo
      'waiting_day',       // Aguardando dia
      'waiting_weather',   // Aguardando clima
      'harvesting',        // Colhendo plantações (pode ficar parado)
      'storage_organize'   // Organizando baús
    ]);

    this.stuckCount = 0;
    this.stuckThreshold = config?.stuckThreshold || 3;
    this.lastPosition = null;
  }

  checkPosition() {
    const currentPos = this.bot.entity.position;
    const currentTask = this.state.currentTask?.type;

    // Se tarefa está na whitelist, não incrementa contador
    if (this.stationaryTasks.has(currentTask)) {
      this.stuckCount = 0;
      this.lastPosition = currentPos;
      return false;
    }

    // Verifica se posição mudou
    if (this.lastPosition && currentPos.equals(this.lastPosition)) {
      this.stuckCount++;
      if (this.stuckCount >= this.stuckThreshold) {
        this.handleStuck(currentTask);
        return true;
      }
    } else {
      this.stuckCount = 0;
    }

    this.lastPosition = currentPos;
    return false;
  }

  // Adiciona tarefa à whitelist
  allowStationary(task) {
    this.stationaryTasks.add(task);
  }

  // Remove tarefa da whitelist
  disallowStationary(task) {
    this.stationaryTasks.delete(task);
  }
}
```

### 12.3 Reset Automático no Circuit Breaker

**Problema Original:** Circuit Breaker não tem mecanismo de probe automático em `half-open`.

**Solução:** Probe periódico com reset automático.

```javascript
// llm/circuitBreaker.js (ATUALIZADO)

class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failures = new Map();
    this.states = new Map();
    this.lastFailure = new Map();
    this.probeTimers = new Map(); // Timers de probe
  }

  canTry(provider) {
    const state = this.states.get(provider) || 'closed';

    if (state === 'closed') {
      return true;
    }

    if (state === 'open') {
      const lastFail = this.lastFailure.get(provider) || 0;
      const elapsed = Date.now() - lastFail;

      if (elapsed > this.timeout) {
        // Transição para half-open e agenda probe
        this.states.set(provider, 'half-open');
        this.scheduleProbe(provider);
        return true;
      }

      return false;
    }

    // half-open: permite uma tentativa
    return true;
  }

  // Agenda probe automático
  scheduleProbe(provider) {
    if (this.probeTimers.has(provider)) {
      clearTimeout(this.probeTimers.get(provider));
    }

    this.probeTimers.set(provider, setTimeout(() => {
      // Se ainda em half-open após timeout, volta para open
      if (this.states.get(provider) === 'half-open') {
        this.states.set(provider, 'open');
        logger.warn(`[CircuitBreaker] Provider ${provider} voltou para 'open' (probe falhou)`);
      }
    }, this.timeout / 2)); // Probe a cada metade do timeout
  }

  onSuccess(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');

    // Cancela probe timer
    if (this.probeTimers.has(provider)) {
      clearTimeout(this.probeTimers.get(provider));
      this.probeTimers.delete(provider);
    }
  }

  onFailure(provider) {
    const count = (this.failures.get(provider) || 0) + 1;
    this.failures.set(provider, count);
    this.lastFailure.set(provider, Date.now());

    if (count >= this.threshold) {
      this.states.set(provider, 'open');
      logger.warn(`[CircuitBreaker] Provider ${provider} aberto após ${count} falhas`);
    }
  }

  reset(provider) {
    this.failures.set(provider, 0);
    this.states.set(provider, 'closed');
    this.lastFailure.delete(provider);

    if (this.probeTimers.has(provider)) {
      clearTimeout(this.probeTimers.get(provider));
      this.probeTimers.delete(provider);
    }
  }
}
```

### 12.4 Limite de Descrição para Embeddings

**Problema Original:** Descrições muito longas geram embeddings menos precisos.

**Solução:** Limitar descrição a 200 caracteres.

```javascript
// memory/skillDocs.js (ATUALIZADO)

class SkillDocumentation {
  constructor(embeddings, database) {
    this.embeddings = embeddings;
    this.db = database;
    this.maxDescriptionLength = 200; // Limite para embeddings
  }

  async generateDescription(code, task, result) {
    const parts = [];

    // O que a skill faz
    parts.push(`Skill que ${task.intent || 'executa'} ${task.action || 'tarefa'}`);

    // Parâmetros usados
    if (task.material) parts.push(`usando ${task.material}`);
    if (task.dimensions) parts.push(`dimensões ${task.dimensions.width}x${task.dimensions.length}`);

    // Condições (simplificadas)
    if (code.includes('findBlock')) parts.push('encontra blocos');
    if (code.includes('pathfinder')) parts.push('navega');
    if (code.includes('dig')) parts.push('minera');
    if (code.includes('craft')) parts.push('crafta');

    // Resultado
    if (result.success) {
      parts.push(`sucesso em ${result.duration}ms`);
    }

    let description = parts.join('. ') + '.';

    // LIMITA TAMANHO
    if (description.length > this.maxDescriptionLength) {
      description = description.substring(0, this.maxDescriptionLength - 3) + '...';
    }

    return description;
  }

  // Tags já são usadas para busca adicional
  extractTags(task, code) {
    const tags = new Set();

    if (task.intent) tags.add(task.intent.toLowerCase());
    if (task.action) tags.add(task.action.toLowerCase());
    if (task.material) tags.add(task.material.toLowerCase());

    // Tags do código
    const codeTags = {
      'mine': 'mining',
      'build': 'building',
      'craft': 'crafting',
      'collect': 'gathering',
      'explore': 'exploration'
    };

    for (const [pattern, tag] of Object.entries(codeTags)) {
      if (code.includes(pattern)) tags.add(tag);
    }

    return Array.from(tags);
  }
}
```

### 12.5 Histórico Mínimo no Snapshot

**Problema Original:** Comandos multi-turn perdem contexto.

**Solução:** Incluir últimos 5 comandos no snapshot.

```javascript
// llm/snapshots.js (ATUALIZADO)

class SemanticSnapshot {
  constructor(bot, state, memory, config) {
    this.bot = bot;
    this.state = state;
    this.memory = memory;
    this.commandHistory = [];  // Histórico de comandos
    this.maxHistoryLength = config?.maxHistoryLength || 5;
  }

  // Adiciona comando ao histórico
  addToHistory(command, result) {
    this.commandHistory.push({
      command,
      result: result?.success ? 'success' : 'failed',
      timestamp: Date.now()
    });

    // Mantém apenas os últimos N comandos
    if (this.commandHistory.length > this.maxHistoryLength) {
      this.commandHistory.shift();
    }
  }

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

      // Entidades próximas
      nearbyEntities: this.getNearbyEntities(32),
      nearbyBlocks: this.getNearbyBlocks(16),

      // Tarefa atual
      currentTask: this.state.currentTask?.type || null,

      // NOVO: Histórico de comandos
      commandHistory: this.commandHistory,

      // Fatos relevantes
      relevantFacts: this.memory.getRelevantFacts(5),

      timestamp: Date.now()
    };
  }

  formatForPrompt() {
    const snapshot = this.generate();

    // Formata histórico
    const historyStr = snapshot.commandHistory
      .map(h => `${h.command} (${h.result})`)
      .join(' → ') || 'nenhum';

    return `
[ESTADO ATUAL]
Posição: (${snapshot.position.x}, ${snapshot.position.y}, ${snapshot.position.z})
Vida: ${snapshot.health}/20 | Fome: ${snapshot.food}/20
Inventário: ${snapshot.inventory}
Entidades próximas: ${snapshot.nearbyEntities.map(e => `${e.type}(${e.distance}m)`).join(', ') || 'nenhuma'}
Tarefa atual: ${snapshot.currentTask || 'nenhuma'}

[HISTÓRICO DE COMANDOS]
${historyStr}

[FATOS RELEVANTES]
${snapshot.relevantFacts.map(f => f.key).join(', ') || 'nenhum'}
`.trim();
  }
}
```

### 12.6 Autenticação no Protocolo Community

**Problema Original:** Qualquer jogador pode enviar mensagens falsas de bot.

**Solução:** Token compartilhado ou HMAC.

```javascript
// community/protocol.js (ATUALIZADO)

const crypto = require('crypto');

class CommunicationProtocol {
  constructor(config) {
    this.sharedSecret = config.community?.sharedSecret || process.env.COMMUNITY_SECRET;
    this.messageExpiry = config.community?.messageExpiry || 30000; // 30 segundos
  }

  // Gera assinatura HMAC para mensagem
  signMessage(message) {
    if (!this.sharedSecret) {
      // Fallback sem autenticação se não configurado
      return { ...message, signature: null };
    }

    const payload = JSON.stringify({
      name: message.name,
      type: message.type,
      data: message.data,
      timestamp: message.timestamp
    });

    const signature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(payload)
      .digest('hex');

    return { ...message, signature };
  }

  // Verifica assinatura de mensagem
  verifyMessage(message) {
    if (!this.sharedSecret) {
      // Sem autenticação configurada, aceita todas
      return { valid: true, reason: 'no_auth' };
    }

    if (!message.signature) {
      return { valid: false, reason: 'missing_signature' };
    }

    // Verifica expiração
    const age = Date.now() - message.timestamp;
    if (age > this.messageExpiry) {
      return { valid: false, reason: 'expired' };
    }

    // Verifica assinatura
    const payload = JSON.stringify({
      name: message.name,
      type: message.type,
      data: message.data,
      timestamp: message.timestamp
    });

    const expectedSignature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(payload)
      .digest('hex');

    if (message.signature !== expectedSignature) {
      return { valid: false, reason: 'invalid_signature' };
    }

    return { valid: true, reason: 'authenticated' };
  }

  // Processa mensagem recebida
  processMessage(username, rawMessage) {
    // Tenta parsear JSON
    if (!rawMessage.startsWith('[COMM:')) {
      return null;
    }

    try {
      const type = rawMessage.match(/\[COMM:(\w+)\]/)?.[1];
      const jsonStr = rawMessage.replace(/\[COMM:\w+\]/, '').trim();
      const message = {
        type,
        ...JSON.parse(jsonStr)
      };

      // Verifica autenticação
      const verification = this.verifyMessage(message);

      if (!verification.valid) {
        logger.warn(`[Protocol] Mensagem rejeitada: ${verification.reason}`, message);
        return null;
      }

      return message;

    } catch (e) {
      logger.debug('[Protocol] Mensagem inválida:', e.message);
      return null;
    }
  }
}
```

**Configuração:**

```json
{
  "community": {
    "enabled": true,
    "sharedSecret": "${COMMUNITY_SECRET}",
    "messageExpiry": 30000,
    "name": "Vila dos Bots"
  }
}
```

```env
# .env
COMMUNITY_SECRET=your_shared_secret_here_min_32_chars
```

---

## 13. Checklist de Implementação Atualizado

1. ~~Implementar `metrics.js`~~ → **Robustness Layer**
2. ~~Implementar `eventLog.js`~~ → **Robustness Layer**
3. ~~Implementar `alerts.js`~~ → **Robustness Layer**
4. ~~Implementar `gracefulShutdown.js`~~ → **Robustness Layer**
5. ~~Implementar `deathRecovery.js`~~ → **Robustness Layer**
6. ~~Implementar `stuckDetector.js`~~ → **Robustness Layer** (com whitelist)
7. ~~Implementar `checkpoint.js`~~ → **Robustness Layer**
8. ~~Implementar `index.js`~~ (integração) → **Robustness Layer**
9. Implementar `reconnection.js` → **Core Layer** (com backoff)
10. Atualizar `database.js` com novas tabelas → **Memory Layer**
11. Atualizar `config.json` com configurações
12. **NOVO:** Implementar testes unitários
13. **NOVO:** Implementar testes de integração
14. **NOVO:** Configurar schema validation
15. **NOVO:** Implementar migrações de banco
16. **NOVO:** Documentar ordem de inicialização
17. **NOVO:** Implementar Timeout Manager
18. **NOVO:** Implementar modo dry-run
19. **NOVO:** Adicionar telemetria opcional
20. **NOVO:** Implementar Health Server HTTP