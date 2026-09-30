import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envKey } from '../src/keys.js';
import { getModelCaps } from '../src/services/run-context.js';
import { PROVIDER_ENDPOINTS, providerEnvKey } from '../src/services/provider-apis.js';

function withEnv(entries: Record<string, string | undefined>, fn: () => void) {
  const keys = [...new Set([...Object.keys(entries), 'HUGGINGFACE_API_KEY', 'LLM_API_KEY'])];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    if (entries[k] === undefined) delete process.env[k];
    else process.env[k] = entries[k];
  }
  try {
    fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('envKey: huggingface resolves HUGGINGFACE_API_KEY', () => {
  withEnv({ HUGGINGFACE_API_KEY: 'hf-secret', LLM_API_KEY: undefined }, () => {
    assert.equal(envKey('huggingface'), 'hf-secret');
  });
});

test('envKey: huggingface falls back to LLM_API_KEY', () => {
  withEnv({ HUGGINGFACE_API_KEY: undefined, LLM_API_KEY: 'shared-key' }, () => {
    assert.equal(envKey('huggingface'), 'shared-key');
  });
});

test('getModelCaps: named Hugging Face cloud model resolves exact caps', () => {
  const caps = getModelCaps('huggingface', 'Qwen/Qwen2.5-Coder-32B-Instruct');
  assert.equal(caps.contextWindow, 131072);
});

test('getModelCaps: unlisted huggingface model falls back to provider caps', () => {
  const caps = getModelCaps('huggingface', 'SomeOrg/Unlisted-Model');
  assert.equal(caps.contextWindow, 131072);
});

test('getModelCaps: opencode free-tier catalog models resolve bare', () => {
  assert.equal(getModelCaps('opencode', 'gpt-5.5-pro').contextWindow, 131072);
  assert.equal(getModelCaps('opencode', 'claude-fable-5').contextWindow, 200000);
});

test('getModelCaps: openrouter cloud catalogs resolve prefixed', () => {
  assert.equal(getModelCaps('openrouter', 'anthropic/claude-opus-5').contextWindow, 500000);
  assert.equal(getModelCaps('openrouter', 'qwen/qwen3.8-max').contextWindow, 131072);
});

test('getModelCaps: omniroute free-tier model routes via provider caps', () => {
  const caps = getModelCaps('omniroute', 'new-family/free-model');
  assert.equal(caps.contextWindow, 131072);
});

const DIRECT_PROVIDERS = ['deepseek', 'qwen', 'zai', 'moonshot', 'mistral', 'cohere', 'groq', 'together', 'fireworks', 'cerebras'];

test('provider-apis: every direct cloud provider has an endpoint', () => {
  for (const p of DIRECT_PROVIDERS) {
    assert.ok(PROVIDER_ENDPOINTS[p], `${p} missing endpoint`);
    assert.match(PROVIDER_ENDPOINTS[p], /\/chat\/completions$/);
  }
});

test('envKey: deepseek/groq/mistral resolve OWN key', () => {
  withEnv({ DEEPSEEK_API_KEY: 'ds', GROQ_API_KEY: 'gq', MISTRAL_API_KEY: 'ms', LLM_API_KEY: undefined }, () => {
    assert.equal(envKey('deepseek'), 'ds');
    assert.equal(envKey('groq'), 'gq');
    assert.equal(envKey('mistral'), 'ms');
  });
});

test('envKey: qwen uses QWEN_API_KEY then DASHSCOPE_API_KEY', () => {
  withEnv({ QWEN_API_KEY: undefined, DASHSCOPE_API_KEY: 'ds', LLM_API_KEY: undefined }, () => {
    assert.equal(envKey('qwen'), 'ds');
  });
  withEnv({ QWEN_API_KEY: 'qw', DASHSCOPE_API_KEY: 'ds', LLM_API_KEY: undefined }, () => {
    assert.equal(envKey('qwen'), 'qw');
  });
});

test('envKey: new providers fall back to LLM_API_KEY', () => {
  withEnv({ TOGETHER_API_KEY: undefined, FIREWORKS_API_KEY: undefined, ZAI_API_KEY: undefined, LLM_API_KEY: 'shared' }, () => {
    assert.equal(envKey('together'), 'shared');
    assert.equal(envKey('fireworks'), 'shared');
    assert.equal(envKey('zai'), 'shared');
  });
});

test('providerEnvKey: tries configured envs in order then LLM_API_KEY', () => {
  withEnv({ CEREBRAS_API_KEY: 'cb', LLM_API_KEY: undefined }, () => {
    assert.equal(providerEnvKey('cerebras'), 'cb');
  });
  withEnv({ CEREBRAS_API_KEY: undefined, LLM_API_KEY: 'shared' }, () => {
    assert.equal(providerEnvKey('cerebras'), 'shared');
  });
});

test('getModelCaps: direct cloud providers fall back to provider caps', () => {
  for (const p of DIRECT_PROVIDERS) {
    assert.equal(getModelCaps(p, 'X/Unlisted-Model').contextWindow, getModelCaps(p).contextWindow, p);
  }
});

test('getModelCaps: cohere provider uses 200k default', () => {
  assert.equal(getModelCaps('cohere', 'X/Unlisted-Model').contextWindow, 200000);
});

test('getModelCaps: native direct ids resolve exact caps', () => {
  assert.equal(getModelCaps('deepseek', 'deepseek-reasoner').contextWindow, 131072);
  assert.equal(getModelCaps('groq', 'llama-3.3-70b-versatile').contextWindow, 131072);
  assert.equal(getModelCaps('qwen', 'qwen-plus').contextWindow, 131072);
});