# Feature guide — skills (SKILL.md, just-in-time)

Skills are **just-in-time instruction bundles** — the same format Claude Code,
Codex, opencode, and AniGravity use. The library does not preload them: it
catalogs them in the system prompt, and the model pulls one in with `use_skill`
exactly when the task matches its description.

## The file format

```
<dir>/<skill-id>/SKILL.md          # folder form (recommended)
# or
<dir>/<skill-id>.md                # single-file form
```

`SKILL.md` (or `<skill-id>.md`) starts with `name:` and `description:`
frontmatter, then a body with the actual instructions the agent should follow:

```md
---
name: commit-message
description: Write conventional, concise git commit messages for the current change set.
---

1. Read the staged changes (git_status / git_diff).
2. Write a subject in conventional format (feat|fix|refactor|docs|chore(scope)?).
3. Use the repo's commit history tone (git_log).
```

- `name` → the skill id used by `use_skill`.
- `description` → what shows in the catalog; make it concrete so the model
  selects it only when relevant.
- The body is injected verbatim (under `## Skill: <name>`) into the **next
  turn's** guidance when used — the just-in-time contract: nothing wasted until
  the moment it matters.

## Discovery

Order of checks (first match wins; ids deduped):

1. `AgentOptions.skills: Skill[]` — objects you register directly.
2. `AgentOptions.skillsDir: string | string[]` — your explicit folders.
3. Default ecosystem folders — new time auto-scanned when neither is set:
   `.opencode/skills`, `.claude/skills`, `.codex/skills` under the workspace,
   then the home equivalents (`~/.opencode`, `~/.claude`, `~/.codex`).

Load programmatically: `loadSkillsFromDir(dir)`, `loadSkillsFromDirs([dirs])`,
or `defaultSkillDirs`.

## The two tools

- `list_skills` — read-only; returns id + description + (optionally) file path.
  The model browser by this.
- `use_skill(id)` — errors on unknown id; otherwise pushes the body into the
  run context. Only available when skills are registered.

> Both are absent when zero skills are loaded, so the model never sees dead tools.

## Wiring skills into a product

```ts
const agent = createAgent({
  workspacePath,
  skillsDir: ['skills'],          // e.g. skills/commit-message/SKILL.md
  // OR build them yourself:
  // skills: [{ id: 'commit-message', name: 'commit-message',
  //            description: '...', content: '# ...' }],
})
agent.skills.all()   // [{ id, name, description }]  — catalog your product exposes
agent.skills.get('commit-message')?.content
```

## Product patterns

- **Domain playbooks** — every repeatable expert activity becomes a skill
  (`code-review`, `api-design`, `deploy-runbook`, `rag-ingest`).
- **Zero-waste prompting** — descriptions only until use; huge bodies cost nothing
  when unused.
- **Cross-agent portability** — the format is identical for Claude Code / Codex /
  opencode: a skill written here runs there unchanged, and vice-versa.