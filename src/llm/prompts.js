// src/llm/prompts.js

import { MinifiedDocs } from './minifiedDocs.js';

/**
 * Prompt templates for LLM interactions
 */
class PromptTemplates {
  constructor() {
    this.minifiedDocs = new MinifiedDocs();
  }

  /**
   * System prompt for chat interactions
   */
  get chatSystem() {
    return `Você é um assistente de Minecraft que responde em português brasileiro.
Seja conciso e útil. Respostas curtas são preferíveis.
Use o contexto fornecido para responder perguntas.`;
  }

  /**
   * System prompt for code generation
   */
  get codeSystem() {
    return `Você é um assistente que gera código JavaScript para controlar um bot de Minecraft.

${this.minifiedDocs.generate()}

[INSTRUÇÕES]
1. Gere código JavaScript assíncrono usando APENAS os métodos permitidos
2. Use try/catch para tratamento de erros
3. Retorne JSON com campo "code" contendo o código
4. Comente o código em português brasileiro
5. NÃO use require() ou import
6. NÃO acesse filesystem ou network`;
  }

  /**
   * Build code generation prompt
   */
  buildCodePrompt(task, context = {}) {
    const snapshot = context.snapshot || '';

    return `
[TAREFA]
${task}

[ESTADO ATUAL]
${snapshot}

[CONTEXTO ADICIONAL]
Posição: (${context.position?.x || 0}, ${context.position?.y || 64}, ${context.position?.z || 0})
Inventário: ${context.inventory || 'vazio'}

Gere código JavaScript para executar a tarefa. Retorne apenas o código dentro de uma função async execute(bot, params).`;
  }

  /**
   * Prompt for regeneration with errors
   */
  buildErrorPrompt(code, error, task) {
    return `
O seguinte código falhou:
\`\`\`javascript
${code}
\`\`\`

Erro: ${error}

Tarefa original: ${task}

Corrija o código e retorne a versão corrigida.`;
  }
}

export { PromptTemplates };