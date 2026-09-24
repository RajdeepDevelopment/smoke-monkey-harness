# Providers

Providers are small OpenAI-compatible adapters. Set `provider` and pass the key
via `apiKey` (string) or a resolver `(provider, userId?) => key` so secrets never
live in code. Constructor is `sk-...` / `nvapi-...` style keys held in env vars.

| provider | env var | base URL / notes |
| --- | --- | --- |
| `openai` | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| `openrouter` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| **`nvidia` (default)** | `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com` |
| `xai` | `XAI_API_KEY` | `https://api.x.ai/v1` |
| `gemini` | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com` |
| `opencode` | `OPENCODE_API_KEY` | OpenAI-compatible via the opencode gateway |
| `omniroute` | `OMNIROUTE_API_KEY` | `https://api.getomni.app/openai/v1` |
| `ollama` | — | `http://localhost:11434` (local, no key) |

Any OpenAI-compatible endpoint can be overridden with `options.baseUrl`.

## Reference provider: NVIDIA

`nvidia/nemotron-3-super-120b-a12b` is the tested model (tool calls +
streaming; reasoning tokens surface as `reasoning_content`):

```ts
const agent = createAgent({
  provider: 'nvidia',
  model: 'nvidia/nemotron-3-super-120b-a12b',
  workspacePath: process.cwd(),
});
```

Stream on `text.delta`:

```ts
agent.on('text.delta', (e) => process.stdout.write(e.data.delta));
```

## Ignoring key resolution

Omit `apiKey` for local `ollama`. If a provider is called with no key, the loop
fails with a clear message telling you which env var is missing.

## Resolution order for `apiKey`

1. `apiKey` function — resolve per call with `(provider, userId)`.
2. `apiKey` string.
3. Provider's env var (`NVIDIA_API_KEY`, etc.).

`userId` flows into key resolution and permission requests, so a single server
process can serve many users.