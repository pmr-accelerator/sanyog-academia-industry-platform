import env from '../config/env.js';
import { createAiService } from './service.js';
import { openAiProvider, anthropicProvider } from './providers.js';

function buildProvider() {
  if (env.AI_PROVIDER === 'none' || !env.AI_API_KEY) return null;
  if (!env.AI_MODEL) { console.warn('AI_PROVIDER is set but AI_MODEL is empty; using the rule-based fallback.'); return null; }
  const cfg = { apiKey: env.AI_API_KEY, model: env.AI_MODEL, baseUrl: env.AI_BASE_URL };
  if (env.AI_PROVIDER === 'openai') return openAiProvider(cfg);
  if (env.AI_PROVIDER === 'anthropic') return anthropicProvider(cfg);
  return null;
}
export const ai = createAiService({ provider: buildProvider(), timeoutMs: env.AI_TIMEOUT_MS });
