# Feature guide — permissions & the three pauses

Real products need a human in the loop. The harness defines **three pause
types**, each resolving through one method on the agent. `autoApprove: true`
collapses #1 (#read-only auto-passes) and #3's recommended path — useful for
local/demo/trusted workflows.

## The three pauses

### 1. `permission.required` — tool approval
Fires when a tool needs consent: any mutating file operation, terminal command,
or unknown-power tool. Read-only tools (search/git read/grep/list) auto-pass by
default policy.

```ts
agent.on('permission.required', (e) =>
  agent.resolvePermission(e.data.toolCallId, 'allow'))   // or 'deny'
```

Permission policy is per-agent: `permission` option (`PermissionPolicy`) can
customise — e.g. always-allow a whitelist of commands, ask harder for
`destructiveHint` tools, or reply to the requester with context.

### 2. `ask_user.required` — the model asks the human
The model itself pauses and poses a question (payload has `question`; the tool
is `ask_user`). Answer with `respond`:

```ts
agent.on('ask_user.required', (e) => {
  const toolCallId = e.data.toolCallId
  myUi.prompt(e.data.payload.question).then((answer) => agent.respond(toolCallId, answer))
})
```

Emission is `ask_user.response` once answered.

### 3. `request_mcp_approval` / `mcp.approval_required` — MCP server opt-in
An unknown/disabled MCP server is needed. Resolve with `resolveMcpDecision`:

```ts
agent.on('mcp.approval_required', (e) =>
  agent.resolveMcpDecision(e.data.toolCallId, {
    action: 'enable',                                   // enable (persists in-config)
    names: e.data.payload.recommendedToEnableIds ?? [],
  }))
// also: { action: 'leave' } (leave disabled, keep run) | { action: 'deny' } (block + stop)
```

`mcp.resolved` fires on the outcome.

## Default policy

`PermissionPolicy` default: **allow read-only, require approval for
mutations/commands**. Metadata respected: `ToolDefinition.annotations`
(`readOnlyHint`, `destructiveHint`) and the tool group membership
(`READ_ONLY_TOOLS`, `FILE_MUTATING_TOOLS`).

## autoApprove

`autoApprove: true` — every permission auto-allows, MCP recommendations
auto-enable. The run still pauses on genuine `ask_user.required` (the agent
wants information only a human has). The scaffold wires all three with
`autoApprove: true` so a fresh agent runs with zero UI wiring — turn it off for
production and route each pause to your product.

## Product patterns

- **GUI apps** — render each pause as a modal/card; wire timestamps and session
  ids so approval state survives reloads.
- **Trusted-run mode** — `permission.evaluate` can pre-approve a fixed command
  list (e.g. `npm test`) while still gating `rm`, network calls, or git pushes.
- **Audits** — every `permission.required`/`resolve` pair and `mcp.resolved`
  shows up in the event stream; persist it for an approval audit trail.