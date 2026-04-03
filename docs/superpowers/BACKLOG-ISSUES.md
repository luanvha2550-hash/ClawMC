# Backlog de Issues para Trabalhar Posteriormente

**Data:** 2026-04-02
**Status:** Pendentes para futuras iterações

---

## LLM Layer

### Importantes

1. **Timeout em fetch calls** - `google.js`, `openai-compat.js`
   - Adicionar AbortController com timeout de 30s
   - Evita hangs em APIs não responsivas

2. **Race condition no CircuitBreaker.canTry()** - `circuitBreaker.js:24-47`
   - Múltiplas chamadas concorrentes podem violar o contrato half-open
   - Implementar mecanismo atômico ou tracking separado

3. **Memory leak no CostTracker** - `costTracker.js:13-17`
   - `byDay` e `byProvider` crescem indefinidamente
   - Adicionar cleanup para manter apenas últimos 30 dias

### Sugestões

- Provider order hardcoded em `router.js:25` - tornar configurável
- Adicionar tipos TypeScript/JSDoc para melhor IDE support

---

## Autonomy Layer

### Importantes

1. **Placeholder triggers em curriculum.js** - Linhas 175-180
   - `'unexplored_chunks_nearby'`, `'interesting_location_found'`, `'has_farmland_nearby'`
   - Implementar ou documentar como TODO

2. **Integer overflow em time calculations** - `circadianEvents.js:150-151`
   - Edge cases no wrap point (23999 -> 0)

3. **Missing `stop()` integration** - `idle.js`
   - IdleLoop não é parado no graceful shutdown
   - Integrar com robustness layer

### Sugestões

- Hardcoded thresholds (11000 ticks, 10 food, etc.) - mover para config
- Phase progress magic numbers (0.3, 0.3, 0.2, 0.2) - extrair para constantes

---

## Skills Layer

### Críticos

1. **Sandbox escape via Function constructor** - `executor.js:503`
   - `new Function()` não é verdadeiramente isolado
   - Considerar `isolated-vm` para produção
   - Padrões de escape: `this.constructor.constructor`, `(function(){}).constructor`

2. **NPE em attack.js** - Linha 77-91
   - `entity.name` pode ser null/undefined
   - Adicionar null checks

### Importantes

3. **Bot disconnect durante skill execution** - `walk.js`, `mine.js`, `attack.js`
   - Se bot desconecta durante `pathfinder.goto()`, promise pode hang
   - Adicionar listener para 'end' event com cleanup

4. **Null check em distanceBetween** - `navigation.js:40-45`
   - Sem validação de `pos1` e `pos2`
   - Adicionar checks: `if (!pos1 || !pos2) return Infinity`

5. **Regex global flag issue** - `executor.js:259-283`
   - `FORBIDDEN_PATTERNS` usa flag `g` que muta `lastIndex`
   - Patterns podem falhar em validações subsequentes

### Sugestões

- Valores hardcoded (ATTACK_COOLDOWN, HOSTILE_MOBS, DEFAULT_MINE_TIMEOUT)
  - tornar configuráveis via skill params
- Padrão de erro inconsistente entre skills
  - Padronizar: `{ success: false, error: string, ... }`
- Adicionar `canExecute()` method em cada skill para pre-flight validation

---

## Community Layer

### Importantes

1. **Message truncation breaks signature** - Já corrigido
   - Mensagens > 256 chars agora são rejeitadas

---

## Priorização Sugerida

### Alta Prioridade (Próximas iterações)
1. Sandbox escape em executor.js (segurança)
2. NPE em attack.js (estabilidade)
3. Timeout em fetch calls (robustez)

### Média Prioridade
1. Race condition no CircuitBreaker
2. Bot disconnect handling em skills
3. Memory leak no CostTracker

### Baixa Prioridade
1. Valores hardcoded -> config
2. JSDoc types
3. Placeholder triggers

---

## Notas

- Issues de sandbox podem não ser críticos se skills dinâmicas forem desabilitadas em produção
- NPE em attack.js é mitigado por optional chaining já existente
- Race conditions são edge cases que requerem stress testing
