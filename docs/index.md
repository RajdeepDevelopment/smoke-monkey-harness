# Smoke Monkey Documentation Index

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Welcome to the comprehensive documentation suite for **Smoke Monkey Harness**. This 10-chapter guide covers the full developer lifecycle across all three ecosystem pillars: **Frontend UI**, **Backend Engine**, and the **Model Context Protocol (MCP)**.

---

## The 10-Chapter Documentation Suite

| # | Chapter | Key Topics Covered |
| :---: | :--- | :--- |
| **01** | [**Architecture & Overview**](01-overview.md) | The 3 Pillars (`@smoke-monkey/ui`, `@smoke-monkey/harness`, `@smoke-monkey/mcp`), engine layers, event stream contract. |
| **02** | [**Quickstart & Providers**](02-getting-started.md) | Installation, multi-provider matrix (NVIDIA NIM reference, OpenAI, Anthropic, Ollama), dynamic API key resolvers, first 20-line agent script. |
| **03** | [**The 6-Phase Agent Loop**](03-agent-loop.md) | Autonomous state machine (`explore → plan → edit → verify → recover → complete`), failure demotions, runaway step guards, context compaction. |
| **04** | [**Tool System & Registry**](04-tools.md) | `ToolDefinition` specification, 5 built-in tool groups (filesystem, terminal, search, git, agent), custom tool creation, UI presentation cards. |
| **05** | [**Permissions & The 3 Pauses**](05-permissions.md) | Safe human-in-the-loop mechanics, `permission.required`, `ask_user.required`, `mcp.approval_required`, recovery on denial, `autoApprove`. |
| **06** | [**Model Context Protocol (MCP)**](06-mcp.md) | Connecting external tools via stdio & HTTP SSE, tool namespacing (`<id>__<tool>`), 22 development tools in `@smoke-monkey/mcp`. |
| **07** | [**Just-in-Time Skills**](07-skills.md) | The two-tier JIT skill injection pattern (94% token savings), multi-root discovery (`.agents/skills`, `.claude/skills`), 25 bundled engineering skills. |
| **08** | [**Sub-Contexts & Memory**](08-subcontexts.md) | Modular system prompt blocks, runtime switching with `context_manage`, scratchpad notes, multi-turn session persistence. |
| **09** | [**Lifecycle Hooks & Errors**](09-hooks-and-errors.md) | Intercepting `beforeModelCall` and `beforeToolCall`, fail-closed security policies, PII redaction, `AgentErrorInfo` structured error hierarchy. |
| **10** | [**Drop-In React Chat UI**](10-ui-components.md) | `@smoke-monkey/ui` component anatomy, `SyntheticTransport` zero-backend testing, `WebSocketTransport`, 14 theme presets, custom component slots. |

---

## Architectural Visual Reference

![Smoke Monkey 3-Pillar Architecture](../../assets/smoke_monkey_trio_architecture.jpg)
