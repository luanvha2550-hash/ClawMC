# ClawMC

Bot de Minecraft autônomo com IA, otimizado para hardware limitado (8GB RAM).

## Características

- **OODA Loop Híbrido**: LLM apenas para situações inéditas, decisões rápidas por heurísticas
- **Memória RAG**: sqlite-vec para busca semântica com embeddings locais ou via API
- **Skills Dinâmicas**: Aprendizado contínuo com sandbox seguro (isolated-vm)
- **Robustez**: Checkpoints, death recovery, stuck detection, métricas
- **Autonomia**: Curriculum Voyager-style + tarefas agendadas + monitor de sobrevivência
- **Multi-bot**: Detecção automática e cooperação entre bots com protocolo HMAC

## Arquitetura

```
src/
├── core/           # Bot, OODA, Commands, State, Reconnection
├── memory/         # Database, Embeddings, RAG, Facts, HybridSearch
├── robustness/     # Metrics, EventLog, Alerts, StateMachine, Checkpoint
├── skills/         # Base skills (12), SkillRegistry, Executor, Sandbox
├── llm/            # Providers (Google, OpenAI, Ollama), Router, CircuitBreaker
├── autonomy/       # Curriculum, IdleLoop, Scheduler, SurvivalMonitor
├── community/      # Protocol, PeerManager, RoleManager, SharedFacts
└── utils/          # Logger, Config, Helpers, HealthServer
```

## Requisitos

- Node.js 18+
- 8GB RAM mínimo
- Servidor Minecraft 1.20.4
- (Opcional) API key Google Gemini ou OpenAI para embeddings avançados

## Instalação

### Método Rápido (Recomendado)

```bash
# Clone o repositório
git clone https://github.com/luanvha2550-hash/ClawMC.git
cd ClawMC

# Instale dependências
npm install

# Execute o assistente de configuração
npm run setup

# Inicie o bot
npm start
```

O assistente de configuração (`npm run setup`) vai guiá-lo por:
- Nome do bot e dono
- IP e porta do servidor Minecraft
- Provedor e modelo LLM (Google, OpenAI, Ollama, etc.)
- API keys necessárias
- Modo de embeddings (local ou API)
- Configuração multi-bot

### Método Manual

```bash
# Clone o repositório
git clone https://github.com/luanvha2550-hash/ClawMC.git
cd ClawMC

# Instale dependências
npm install

# Configure ambiente
cp .env.example .env
# Edite .env com suas configurações

# Execute migrações do banco
npm run db:migrate

# Inicie o bot
npm start
```

## Configuração

### Variáveis de Ambiente (.env)

```env
# Servidor Minecraft
SERVER_HOST=localhost
SERVER_PORT=25565
SERVER_VERSION=1.20.4

# Bot
BOT_NAME=ClawBot
BOT_OWNER=PlayerName

# LLM APIs (opcional)
GOOGLE_API_KEY=your-google-api-key
OPENROUTER_API_KEY=your-openrouter-key
NVIDIA_API_KEY=your-nvidia-key

# Multi-bot (opcional)
COMMUNITY_SECRET=shared-secret-for-bot-communication
```

### config.json

Veja `config.json` para todas as opções de configuração:

- **server**: Host, porta, versão do servidor Minecraft
- **bot**: Identidade, timeouts, configurações de reconexão
- **llm**: Modo (single/tiered), provedores, modelos, temperatura
- **memory**: Banco de dados, embeddings, cache
- **skills**: Timeout de execução, tentativas, logs
- **autonomy**: Curriculum, tarefas agendadas, sobrevivência
- **community**: Multi-bot, descoberta de peers, roles
- **robustness**: Métricas, alertas, checkpoints, recovery
- **healthServer**: HTTP endpoints para monitoramento

## Testes

```bash
# Todos os testes
npm test

# Testes unitários
npm run test:unit

# Testes de integração
npm run test:int

# Testes e2e
npm run test:e2e

# Cobertura de código
npm run test:coverage
```

## Health Endpoints

O bot expõe endpoints HTTP para monitoramento:

- `GET /health` - Status de saúde dos componentes
- `GET /status` - Status detalhado com uptime e sistema
- `GET /ready` - Pronto para receber tráfego

## Desenvolvimento

```bash
# Modo desenvolvimento com auto-reload
npm run dev

# Linting
npm run lint
```

## Estrutura de Arquivos

```
ClawMC/
├── src/                 # Código fonte
│   ├── index.js         # Entry point principal
│   ├── core/            # Componentes core
│   ├── memory/          # Sistema de memória
│   ├── robustness/      # Layer de robustez
│   ├── skills/          # Sistema de skills
│   ├── llm/             # Provedores LLM
│   ├── autonomy/        # Autonomia
│   ├── community/       # Multi-bot
│   └── utils/           # Utilitários
├── tests/               # Testes
│   ├── unit/            # Testes unitários
│   ├── integration/     # Testes de integração
│   ├── e2e/             # Testes end-to-end
│   └── mocks/           # Mocks para testes
├── data/                # Dados persistentes
│   └── brain.db         # SQLite + sqlite-vec
├── logs/                # Logs do sistema
│   ├── events.jsonl     # Eventos estruturados
│   └── status.json      # Status atual
├── docs/                # Documentação
│   └── superpowers/     # Specs e planos
└── config.json          # Configuração
```

## Camadas

### Foundation Layer
- Logger estruturado com níveis e rotação
- Config com validação e variáveis de ambiente
- Helpers utilitários
- State Manager para tracking de estado
- Command Parser com detecção de menções
- Reconnection Manager com backoff exponencial
- Timeout Manager para evitar hangs

### Memory Layer
- SQLite com sqlite-vec para busca semântica
- Embeddings híbridos (local 384-dim ou API 768-dim)
- RAG para contexto de skills
- Facts Manager para fatos persistentes
- Hybrid Search combinando semântica + keywords

### Robustness Layer
- Metrics Collector (counters, gauges, hist)
- Event Logger JSONL estruturado
- Alert System com hysteresis e cooldown
- State Machine para operações críticas
- Checkpoint Manager para persistência
- Death Recovery com contador de tentativas
- Stuck Detector para travamentos
- Graceful Shutdown

### Skills Layer
- 12 Base Skills (attack, follow, mine, etc.)
- Skill Registry para registro dinâmico
- Skill Executor com sandbox (isolated-vm)
- Turn Limiter para evitar loops infinitos
- Dynamic Skill Generation via LLM

### LLM Layer
- Providers: Google Gemini, OpenAI, Ollama, NVIDIA
- Router com failover automático
- Circuit Breaker para proteção
- Prompt Templates otimizados
- Cost Tracker para monitoramento

### Autonomy Layer
- Curriculum Manager (survival → gathering → exploration → advanced)
- Idle Loop com prioridades
- Task Scheduler (cron-style)
- Survival Monitor (health, food, danger)

### Community Layer
- Communication Protocol com HMAC signatures
- Peer Manager para descoberta
- Role Manager (miner, farmer, builder, etc.)
- Shared Facts para sincronização

## Licença

MIT

## Créditos

Inspirado em [Voyager](https://arxiv.org/abs/2305.16291) e [OpenClaw](https://github.com/ltnxtreme/openclaw).

Baseado em [Mineflayer](https://github.com/PrismarineJS/mineflayer).