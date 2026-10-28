// Provider adapters. To add a provider, export an object { name, model, generateRoadmap(input, signal) }
// and register it in ai/instance.js. Nothing else in the app knows which provider is used.
import { SYSTEM_PROMPT, buildUserPrompt, parseJsonLoose } from './prompt.js';

async function httpJson(url, init, signal) {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) throw Object.assign(new Error(`Provider HTTP ${res.status}`), { code: res.status === 429 ? 'AI_RATE_LIMITED' : 'AI_HTTP_ERROR', status: res.status });
  return res.json();
}

// Works with OpenAI and any OpenAI-compatible endpoint (set AI_BASE_URL).
export function openAiProvider({ apiKey, model, baseUrl }) {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return {
    name: 'openai', model,
    async generateRoadmap(input, signal) {
      const data = await httpJson(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0.3, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(input) }],
        }),
      }, signal);
      return parseJsonLoose(data?.choices?.[0]?.message?.content);
    },
  };
}

export function anthropicProvider({ apiKey, model, baseUrl }) {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  return {
    name: 'anthropic', model,
    async generateRoadmap(input, signal) {
      const data = await httpJson(`${base}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 3000, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: buildUserPrompt(input) }] }),
      }, signal);
      const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return parseJsonLoose(text);
    },
  };
}
