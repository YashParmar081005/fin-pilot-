/**
 * LLM Provider Registration & Execution Engine (plan.md §24).
 * Supports Gemini API, Groq/OpenAI APIs, and a smart local dev engine
 * that executes ledger tools against the real MongoDB database when an API key is not provided.
 */
import { getEnv } from '../config/env';
import { logger } from '../config/logger';
import { setLlmProvider, type LlmMessage, type LlmProvider, type LlmToolSpec, type LlmTurn } from './gateway';

export function initLlmProvider(): void {
  const env = getEnv();

  const geminiKey = process.env.GEMINI_API_KEY || (env as Record<string, unknown>).GEMINI_API_KEY as string;
  const groqKey = process.env.GROQ_API_KEY || (env as Record<string, unknown>).GROQ_API_KEY as string;
  const openaiKey = process.env.OPENAI_API_KEY || (env as Record<string, unknown>).OPENAI_API_KEY as string;

  if (geminiKey) {
    logger.info('Initializing Gemini AI Provider for FinPilot Copilot');
    setLlmProvider(createGeminiProvider(geminiKey));
    return;
  }

  if (groqKey) {
    logger.info('Initializing Groq AI Provider for FinPilot Copilot');
    setLlmProvider(createGroqProvider(groqKey));
    return;
  }

  if (openaiKey) {
    logger.info('Initializing OpenAI Provider for FinPilot Copilot');
    setLlmProvider(createOpenAiProvider(openaiKey));
    return;
  }

  logger.info('No LLM API Key detected in .env. Initializing Smart Financial Copilot Engine.');
  setLlmProvider(createSmartDevProvider());
}

/**
 * Gemini LLM Provider (Google Gemini API v1beta)
 * Caches failures so subsequent calls in the same turn (or process)
 * skip the network roundtrip and go straight to the smart engine.
 */
function createGeminiProvider(apiKey: string): LlmProvider {
  let geminiDown = false;
  let downSince = 0;

  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const userMsg = messages.filter((m) => m.role === 'user').pop()?.content || '';

      // If Gemini failed recently (within 60s), skip and use smart engine immediately
      if (geminiDown && Date.now() - downSince < 60_000) {
        return fallbackSmartTurn(userMsg, messages, tools);
      }

      const toolNames = tools.map((t) => t.name).join(', ');

      const prompt = `
You are FinPilot AI, a financial assistant for Indian SMEs.
User question: "${userMsg}"
Available tools: ${toolNames}

If the user is asking about revenue, income, sales, expenses, P&L, receivables, cash position, or health score, respond by calling the appropriate tool.
Return JSON with format:
{"toolCall": {"name": "toolName", "args": {}}} OR {"content": "Your text response here"}
`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout — fail fast
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          },
        );
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText) as {
          toolCall?: { name: string; args: Record<string, unknown> };
          content?: string;
        };

        // Gemini succeeded — clear any cached failure
        geminiDown = false;
        return {
          content: parsed.content,
          toolCall: parsed.toolCall,
          tokens: 50,
        };
      } catch (err) {
        logger.error({ err: String(err) }, 'Gemini API call failed, using smart financial engine');
        geminiDown = true;
        downSince = Date.now();
        return fallbackSmartTurn(userMsg, messages, tools);
      }
    },
  };
}

/**
 * Groq / OpenAI OpenAI-compatible Provider
 */
function createGroqProvider(apiKey: string): LlmProvider {
  return createOpenAiCompatibleProvider(apiKey, 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile');
}

function createOpenAiProvider(apiKey: string): LlmProvider {
  return createOpenAiCompatibleProvider(apiKey, 'https://api.openai.com/v1', 'gpt-4o-mini');
}

function createOpenAiCompatibleProvider(apiKey: string, baseUrl: string, model: string): LlmProvider {
  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const formattedMsgs = messages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      }));

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: formattedMsgs,
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: { type: 'object', properties: {} } },
          })),
        }),
      });

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ function?: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { total_tokens?: number };
      };

      const choice = data.choices?.[0]?.message;
      if (choice?.tool_calls?.[0]?.function) {
        const fn = choice.tool_calls[0].function;
        let args = {};
        try {
          args = JSON.parse(fn.arguments || '{}');
        } catch {
          args = {};
        }
        return {
          toolCall: { name: fn.name, args },
          tokens: data.usage?.total_tokens || 50,
        };
      }

      return {
        content: choice?.content || 'I have analyzed your financial books.',
        tokens: data.usage?.total_tokens || 50,
      };
    },
  };
}

/**
 * Smart Dev Provider: Analyzes financial intent and calls real ledger tools
 * when no external cloud LLM key is configured.
 */
function createSmartDevProvider(): LlmProvider {
  return {
    async chat(messages: LlmMessage[], tools: LlmToolSpec[]): Promise<LlmTurn> {
      const userMsg = (messages.filter((m) => m.role === 'user').pop()?.content || '').toLowerCase();
      return fallbackSmartTurn(userMsg, messages, tools);
    },
  };
}

function fallbackSmartTurn(userMsg: string, messages: LlmMessage[], tools: LlmToolSpec[]): LlmTurn {
  const toolMap = new Set(tools.map((t) => t.name));
  const toolMsg = messages.filter((m) => m.role === 'tool').pop();

  // If a tool result was just received in this turn, format a grounding-safe answer
  if (toolMsg) {
    try {
      const res = JSON.parse(toolMsg.content) as Record<string, unknown>;

      if (typeof res.totalIncomePaise === 'number') {
        const paise = res.totalIncomePaise;
        const rupees = paise / 100;
        if (paise === 0) {
          return { content: 'Your total revenue is ₹0. No income transactions have been recorded yet.', tokens: 10 };
        }
        return { content: `Your total revenue is ₹${rupees} (${paise} paise recorded in your books).`, tokens: 10 };
      }

      if (typeof res.totalExpensesPaise === 'number') {
        const paise = res.totalExpensesPaise;
        const rupees = paise / 100;
        if (paise === 0) {
          return { content: 'Your total expenses are ₹0. No expense transactions have been recorded yet.', tokens: 10 };
        }
        return { content: `Your total expenses are ₹${rupees} (${paise} paise recorded in your books).`, tokens: 10 };
      }

      if (typeof res.netProfitPaise === 'number') {
        const paise = res.netProfitPaise;
        const rupees = paise / 100;
        if (paise === 0) {
          return { content: 'Your net profit/loss is ₹0. No transactions have been posted yet.', tokens: 10 };
        }
        const label = paise >= 0 ? 'net profit' : 'net loss';
        return { content: `Your ${label} is ₹${Math.abs(rupees)} (${Math.abs(paise)} paise).`, tokens: 10 };
      }

      if (typeof res.balancePaise === 'number') {
        const paise = res.balancePaise;
        const rupees = paise / 100;
        if (paise === 0) {
          return { content: 'Your current cash position is ₹0. No cash transactions have been recorded yet.', tokens: 10 };
        }
        return { content: `Your current cash position is ₹${rupees} (${paise} paise).`, tokens: 10 };
      }

      if (res.score !== undefined) {
        return { content: `Your business health score is ${String(res.score)} out of 100.`, tokens: 10 };
      }

      if (Array.isArray(res.receivables)) {
        const count = res.receivables.length;
        if (count === 0) {
          return { content: 'You have no outstanding receivables at this time.', tokens: 10 };
        }
        return { content: `You have ${count} outstanding receivable(s) pending collection.`, tokens: 10 };
      }

      return { content: `Here is the data from your books: ${JSON.stringify(res)}`, tokens: 10 };
    } catch {
      return { content: 'Retrieved details from your financial books.', tokens: 5 };
    }
  }

  // Determine which tool to call based on intent keywords
  const q = userMsg.toLowerCase();
  if ((q.includes('revenue') || q.includes('income') || q.includes('sales')) && toolMap.has('getRevenue')) {
    return { toolCall: { name: 'getRevenue', args: {} }, tokens: 5 };
  }
  if ((q.includes('expense') || q.includes('cost') || q.includes('spending')) && toolMap.has('getExpenses')) {
    return { toolCall: { name: 'getExpenses', args: {} }, tokens: 5 };
  }
  if ((q.includes('profit') || q.includes('loss') || q.includes('p&l') || q.includes('pnl')) && toolMap.has('getProfitAndLoss')) {
    return { toolCall: { name: 'getProfitAndLoss', args: {} }, tokens: 5 };
  }
  if ((q.includes('cash') || q.includes('bank') || q.includes('position')) && toolMap.has('getCashPosition')) {
    return { toolCall: { name: 'getCashPosition', args: {} }, tokens: 5 };
  }
  if ((q.includes('health') || q.includes('score')) && toolMap.has('getHealthScore')) {
    return { toolCall: { name: 'getHealthScore', args: {} }, tokens: 5 };
  }
  if ((q.includes('forecast') || q.includes('future') || q.includes('predict')) && toolMap.has('getCashFlowForecast')) {
    return { toolCall: { name: 'getCashFlowForecast', args: {} }, tokens: 5 };
  }
  if ((q.includes('receivable') || q.includes('unpaid') || q.includes('due') || q.includes('owe')) && toolMap.has('getOutstandingReceivables')) {
    return { toolCall: { name: 'getOutstandingReceivables', args: {} }, tokens: 5 };
  }

  // General greeting / unknown intent
  return {
    content:
      'Hello! I am your FinPilot Copilot. You can ask me:\n• "What is my revenue?"\n• "What are my expenses?"\n• "Show my profit & loss"\n• "What is my cash position?"\n• "What is my business health score?"',
    tokens: 10,
  };
}
