# 04. Tool System & Built-in Tool Libraries

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Tools give AI models the ability to act on the world: inspecting source code, making edits, executing test suites, querying databases, and communicating with developers.

In Smoke Monkey Harness, every tool is modeled as a strongly-typed `ToolDefinition` with JSON Schema validation, contextual execution, and visual presentation metadata for frontend rendering.

---

## The `ToolDefinition` Contract

Every tool conforms to the following TypeScript interface:

```ts
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema or Zod object
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
  };
  // Presentational metadata for UI rendering (never sent to the LLM)
  presentation?: {
    label: string;
    icon: string;    // Emoji or SVG glyph key
    tone?: 'info' | 'success' | 'warning' | 'error';
    group?: string;  // e.g. 'utilities' | 'database' | 'deployment'
  };
  execute(input: any, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  isError?: boolean;
}
```

---

## Built-In Tool Groups

The harness includes 5 battle-tested tool groups optimized for autonomous code generation:

| Area | Tools | Description |
| :--- | :--- | :--- |
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `line_edit`, `replace_lines`, `apply_patch`, `delete_file`, `list_directory`, `inspect` | Precision code modification tools supporting exact line replacement, chunk edits, and unified diff patches. |
| **Terminal** | `run_command`, `run_tests` | Sandboxed command execution with real-time stdout/stderr streaming and non-zero exit code capture. |
| **Search** | `glob`, `grep` | Fast regex code search and file pattern matching across large repositories. |
| **Git** | `git_status`, `git_diff`, `git_log` | Version control inspection to evaluate changes before and after edits. |
| **Agent** | `ask_user`, `context_manage`, `finish_task`, `todo_write` | Agent meta-tools for asking human questions, managing system subcontexts, and updating task checklists. |

### Selecting Tool Groups

By default, `agent.run()` registers all core groups. You can restrict active tools via `options.tools`:

```ts
import { createAgent, TOOL_GROUPS } from '@smoke-monkey/harness';

const agent = createAgent({
  workspacePath: process.cwd(),
  // Expose only search and git inspection tools (read-only safe mode)
  tools: ['search', 'git'], 
});
```

---

## Writing Custom Tools

You can easily register proprietary tools (APIs, internal databases, cloud deployments) directly in `options.tools`:

```ts
import { createAgent, type ToolDefinition } from '@smoke-monkey/harness';

// 1. Define your custom tool
const fetchDbMetricsTool: ToolDefinition = {
  name: 'fetch_db_metrics',
  description: 'Fetches database connection pool and latency metrics for an environment.',
  inputSchema: {
    type: 'object',
    properties: {
      environment: { 
        type: 'string', 
        enum: ['staging', 'production'],
        description: 'Target environment' 
      },
      durationMinutes: { 
        type: 'number', 
        default: 15 
      },
    },
    required: ['environment'],
  },
  // Rich presentation configuration for @smoke-monkey/ui
  presentation: {
    label: 'DB Metrics',
    icon: 'database',
    tone: 'info',
    group: 'database',
  },
  async execute(input, ctx) {
    try {
      const stats = await dbService.getMetrics(input.environment, input.durationMinutes);
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Failed to fetch DB metrics: ${err.message}` }],
        isError: true, // Informs the LLM that the execution failed
      };
    }
  },
};

// 2. Supply it during agent creation
const agent = createAgent({
  workspacePath: process.cwd(),
  tools: [fetchDbMetricsTool],
});
```

---

## The Up-Front Registration Rule

> **Important**: Tools must be registered during initialization or before `agent.run()` begins.
>
> If a tool is dynamically registered mid-run, the LLM will not be aware of its JSON Schema in the active prompt, and any subsequent call to it will be rejected as unrecognized.

---

## Rich UI Tool Presentations

The `presentation` property is completely decoupled from the LLM prompt:
- **No Token Overhead**: Presentational fields (`label`, `icon`, `tone`, `group`) are stripped before schemas are sent to the provider.
- **Frontend Synchronization**: When `@smoke-monkey/ui` connects, it calls `agent.getToolPresentations()` to register custom icons and labels before the first event arrives.

```ts
// Export all registered tool presentations to pass to @smoke-monkey/ui
const presentations = agent.getToolPresentations();
// { fetch_db_metrics: { label: 'DB Metrics', icon: 'database', tone: 'info', group: 'database' } }
```

In `@smoke-monkey/ui`:
```tsx
<SmokeMonkeyChat 
  transport={transport} 
  toolPresentations={presentations} 
/>
```

---

## Next Steps

- Guard tool execution with approval gates: [05. Permissions](05-permissions.md)
- Bring in external tools using the Model Context Protocol: [06. Model Context Protocol](06-mcp.md)
- Implement security firewalls and secret redaction with hooks: [09. Lifecycle Hooks](09-hooks-and-errors.md)
