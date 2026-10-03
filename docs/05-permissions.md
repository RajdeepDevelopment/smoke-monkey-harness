# 05. Permissions & The Three Interactive Pauses

> ⭐️ **Love Smoke Monkey Harness?** Please support the project with a star on [GitHub](https://github.com/RajdeepDevelopment/smoke-monkey-harness)!
> 🌐 **Interactive Simulator:** Test the agent loop and stream live at [smoke-monkey-harness.vercel.app](https://smoke-monkey-harness.vercel.app/)

---


Autonomous agents must not execute destructive file operations, deploy unauthorized infrastructure, or run arbitrary shell commands without human oversight.

Rather than crashing the process or aborting the run when user input is required, Smoke Monkey Harness introduces **The Three Interactive Pauses**: first-class suspension points that freeze the agent loop until the human or client application provides an explicit resolution.

---

## The Three Pauses at a Glance

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          THE THREE INTERACTIVE PAUSES                            │
├─────────────────────────┬───────────────────────────────┬────────────────────────┤
│ Pause Event             │ Why It Suspends               │ Surface Resolution API │
├─────────────────────────┼───────────────────────────────┼────────────────────────┤
│ 1. `permission.required`│ A mutating tool (file edit,   │ `agent.resolvePermission`│
│                         │ terminal command) needs allow │                        │
│                         │ or deny approval.             │                        │
├─────────────────────────┼───────────────────────────────┼────────────────────────┤
│ 2. `ask_user.required`  │ The agent explicitly needs    │ `agent.respond`        │
│                         │ human clarification or input. │                        │
├─────────────────────────┼───────────────────────────────┼────────────────────────┤
│ 3. `mcp.approval_required`│ An unapproved external MCP  │ `agent.resolveMcpDecision`│
│                         │ server was called.            │                        │
└─────────────────────────┴───────────────────────────────┴────────────────────────┘
```

---

## 1. Tool Permission Pause (`permission.required`)

By default, **read-only tools** (`read_file`, `glob`, `grep`, `git_status`) run automatically without interrupting the user.

Any **mutating tool** (`write_file`, `edit_file`, `run_command`, `delete_file`) immediately emits `permission.required` and suspends execution:

```mermaid
sequenceDiagram
    participant Model as LLM Turn
    participant Loop as AgentLoop
    participant User as Human (UI or CLI)

    Model->>Loop: Invoke write_file on src/config.ts
    Loop->>Loop: Mutating tool detected!
    Loop-->>User: emit permission.required with tool details
    Note over Loop: Loop is suspended
    User->>Loop: agent.resolvePermission(toolCallId, allow or deny)
    alt Allowed
        Loop->>Loop: Execute tool and return file write success
        Loop->>Model: Tool result returned
    else Denied
        Loop->>Model: Return Permission denied by user
        Note over Model: Agent pivots to alternative plan
    end
```

### Resolving Permissions in Code

```ts
agent.on('permission.required', async (e) => {
  const { toolCallId, toolName, input } = e.data;
  
  console.log(`Tool: ${toolName}`);
  console.log(`Arguments:`, JSON.stringify(input, null, 2));

  // Determine approval (via CLI prompt, UI modal, or webhook)
  const isApproved = await promptUserApproval();

  // Resolve the pause
  await agent.resolvePermission(toolCallId, isApproved ? 'allow' : 'deny');
});
```

> **What happens on `deny`?**  
> The loop does **not** crash. Instead, the denial is cleanly injected back to the model as an error message (`Permission denied by user`), allowing the agent to formulate an alternate plan without mutating that resource.

---

## 2. Clarification Pause (`ask_user.required`)

When the model calls the built-in `ask_user` tool, it suspends execution until the developer provides an answer:

```ts
agent.on('ask_user.required', async (e) => {
  const { toolCallId, question } = e.data;
  
  console.log(`Agent is asking: "${question}"`);
  const answer = await getUserResponse();

  // Supply the answer back to the agent
  await agent.respond(toolCallId, answer);
});
```

---

## 3. External MCP Approval Pause (`mcp.approval_required`)

When the agent attempts to access an untrusted or disabled external MCP server, the harness halts execution until the server is explicitly enabled:

```ts
agent.on('mcp.approval_required', async (e) => {
  const { toolCallId, serverId, serverConfig } = e.data;
  
  const allow = await confirmEnableServer(serverId);

  await agent.resolveMcpDecision(toolCallId, {
    action: allow ? 'enable' : 'deny',
    names: [serverId],
  });
});
```

---

## Automated Environments (`autoApprove: true`)

In automated CI/CD runners, benchmarks, or isolated Docker containers where human interaction is impossible:

```ts
const agent = createAgent({
  workspacePath: process.cwd(),
  autoApprove: true, // Automatically approves tool permissions and MCP activations
});
```

> **Note**: Even with `autoApprove: true`, `ask_user.required` remains active. If the model asks a question, your application must still listen and answer via `agent.respond()`.

---

## UI Integration with `@smoke-monkey/ui`

In `@smoke-monkey/ui`, pauses are handled automatically without writing boilerplate event bridges:
1. When `permission.required` fires, `@smoke-monkey/ui` renders an **interactive inline approval card** with `Allow` and `Deny` buttons.
2. When `ask_user.required` fires, it turns the chat composer into an active response input.
3. User clicks automatically send resolution payloads across the WebSocket/Fetch transport.

---

## Next Steps

- Integrate external tools via MCP: [06. Model Context Protocol](06-mcp.md)
- Load specialized developer skills dynamically: [07. Just-in-Time Skills](07-skills.md)
- Wire interactive UI approval components: [10. React UI Components](10-ui-components.md)
