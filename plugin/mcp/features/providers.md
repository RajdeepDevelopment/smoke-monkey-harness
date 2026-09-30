# Feature guide — providers & models

The library speaks OpenAI-compatible chat APIs. Pick a `provider`, a
tool-capable `model`, and hand over an API key — no other wiring.

## Providers

| provider | env var (default) | notes |
|----------|-------------------|-------|
| `openai` | `OPENAI_API_KEY` | flagship tool models: gpt-5 |
| `openrouter` | `OPENROUTER_API_KEY` | many models, one key |
| `nvidia` | `NVIDIA_API_KEY` | base `https://integrate.api.nvidia.com`, e.g. `nvidia/nemotron-3-super-120b-a12b` (tool calls + streaming; reasoning arrives as `reasoning_content`) |
| `xai` | `XAI_API_KEY` | Grok models |
| `gemini` | `GEMINI_API_KEY` | Gemini tool models |
| `opencode` | `OPENCODE_API_KEY` | opencode's gateway |
| `omniroute` | `OMNIROUTE_API_KEY` | `https://api.getomni.app/openai/v1` (free tier possible) |
| `huggingface` | `HUGGINGFACE_API_KEY` | Hugging Face Inference Providers router, `https://router.huggingface.co/v1` (e.g. `Qwen/Qwen2.5-Coder-32B-Instruct`, `meta-llama/Llama-3.3-70B-Instruct`) |
| `deepseek` | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1`, e.g. `deepseek-chat`, `deepseek-reasoner` |
| `qwen` | `QWEN_API_KEY` (or `DASHSCOPE_API_KEY`) | Alibaba DashScope compatible-mode, `https://dashscope.aliyuncs.com/compatible-mode/v1`, e.g. `qwen-plus`, `qwen3.8-max` |
| `zai` | `ZAI_API_KEY` | Z.ai GLM, `https://api.z.ai/api/paas/v4`, e.g. `glm-5`, `glm-5.2` |
| `moonshot` | `MOONSHOT_API_KEY` | Moonshot Kimi, `https://api.moonshot.ai/v1` |
| `mistral` | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1`, e.g. `mistral-large-latest`, `codestral-latest` |
| `cohere` | `COHERE_API_KEY` | `https://api.cohere.com/v1`, e.g. `command-a`, `command-r-plus` |
| `groq` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` (free tier) |
| `together` | `TOGETHER_API_KEY` | `https://api.together.xyz/v1` (free tier) |
| `fireworks` | `FIREWORKS_API_KEY` | `https://api.fireworks.ai/inference/v1` (free tier) |
| `cerebras` | `CEREBRAS_API_KEY` | `https://api.cerebras.ai/v1` (fast, free tier) |
| `ollama` | none | default, `http://localhost:11434`, e.g. `qwen3:8b` |

`baseUrl` overrides the endpoint for anything OpenAI-compatible (vLLM, LM
Studio, Azure, a gateway).

## Keys

```ts
createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  apiKey: process.env.NVIDIA_API_KEY,          // string, or…
  // apiKey: (provider, userId) => userKeys.get(userId)[provider],  // key resolver
})
```

A resolver keeps secrets out of code and enables per-user routing. Unset keys
throw a clear error at `run()` time.

## Streaming

Tool-supporting providers stream by default (`STREAMING_PROVIDERS`). The loop
consumes the stream, surfaces reasoning via `text.thought` / `llm.thinking`,
and emits `text.delta` for token-level UI.

## Model selection for tool-using agents

The library requires **function-calling**. Known-good:

- NVIDIA: `nvidia/nemotron-3-super-120b-a12b` (returns `tool_calls` +
  `reasoning_content`, `content` may be null — the harness handles both).
- OpenRouter/OpenAI: `anthropic/claude-3.7-sonnet`, `gpt-5`, `deepseek`
  tools, etc.
- Local: `qwen3:8b` and similar tool-capable ollama models.

Rules of thumb:

- Always set `provider`/`model` explicitly; the library defaults to Ollama.
- If the model returns `tool_calls` without prose (`content: null`), that is
  normal and handled.
- Transient 5xx (e.g. NVIDIA `503`) is retried with backoff (1–3 attempts);
  a persistent failure surfaces as `run.failed`.

## Env-based switching

Keep it configurable so one repo runs on any backend:

```ts
provider: process.env.PROVIDER ?? 'nvidia',
model: process.env.MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
apiKey: process.env[`${(process.env.PROVIDER ?? 'nvidia').toUpperCase()}_API_KEY`],
```

(Exact env-with-fallback is up to you — the scaffold keeps it simple.)