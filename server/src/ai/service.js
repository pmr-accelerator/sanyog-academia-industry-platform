// Provider-independent AI service. If no provider is configured, or the provider fails or returns
// invalid output, the labelled rule-based fallback is used. Fallback output is never described as AI.
import { validateRoadmap } from './schema.js';
import { generateRuleBasedRoadmap } from './ruleBased.js';

export function createAiService({ provider = null, timeoutMs = 20000, fallback = generateRuleBasedRoadmap } = {}) {
  const asFallback = (input, reason, started) => {
    const checked = validateRoadmap(fallback(input));
    return {
      roadmap: checked.value,
      meta: { source: 'RULE_BASED_FALLBACK', provider: null, model: null, usedFallback: true, reason, providerAttempted: provider?.name || null, latencyMs: Date.now() - started },
    };
  };
  return {
    get providerName() { return provider ? provider.name : null; },
    async generateRoadmap(input, opts = {}) {
      const started = Date.now();
      if (!provider) return asFallback(input, 'NO_PROVIDER_CONFIGURED', started);
      if (opts.skipProvider) return asFallback(input, 'AI_DISABLED_BY_ADMIN', started);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const raw = await provider.generateRoadmap(input, ctrl.signal);
        const checked = validateRoadmap(raw);
        if (!checked.ok) return asFallback(input, 'INVALID_PROVIDER_OUTPUT', started);
        return { roadmap: checked.value, meta: { source: 'AI_PROVIDER', provider: provider.name, model: provider.model, usedFallback: false, reason: null, latencyMs: Date.now() - started } };
      } catch (e) {
        const reason = e?.name === 'AbortError' ? 'AI_TIMEOUT' : e?.code || 'AI_PROVIDER_ERROR';
        return asFallback(input, reason, started);
      } finally { clearTimeout(timer); }
    },
  };
}
