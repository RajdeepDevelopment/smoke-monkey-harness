---
name: Commit Message
description: Write conventional, concise git commit messages for the current uncommitted changes. Use whenever the task involves committing changes or drafting a commit message.
---

# Conventional Commit Message

Follow Conventional Commits so history stays greppable and each commit is one change.

## When to use
- The user asks you to commit changes, or to draft a commit message for the working tree.

## Steps
1. Inspect the working tree first: `git status --short` and `git diff --stat` (and `git diff` for content you must summarise). Never write a message from memory or from a changelog.
2. Choose ONE type from: `feat` (new capability) · `fix` (bug fix) · `refactor` (no behaviour change) · `perf` · `style` · `docs` · `test` · `chore` (build, deps, tooling) · `build` · `ci` · `revert`. If the change mixes types, pick the dominant one and note the others as body bullets.
3. Subject line: lowercase, imperative mood, ≤ 72 characters, no trailing period. Format: `<type>: <short summary>` — e.g. `feat: add skills support to the harness`.
4. Body (only when the subject can't tell the story): blank line, then bullets of WHAT and WHY (not a changelog of hunks). Mention breaking changes with `BREAKING CHANGE:`.
5. Scope (optional): add after the type in parentheses when it aids scanning — `fix(mcp): …`.

## Do / Don't
- DO git-diff before writing; the message must describe the ACTUAL staged/working changes.
- DON'T use generic summaries ("updates", "changes", "fix stuff").
- DON'T exceed 72 chars on the subject.
- DON'T end the subject with a period.
- DON'T include file lists or diff stats in the message body — that's what the diff is for.
- If the user asked to commit, verify the targeted files are what you actually stage; never `git add -A` more than the change warrants unless asked.

## Finish
Output the final message in a code block, and if the user asked for a commit, apply it with `git commit -m "<subject>" [-m "<body>"]` and verify with `git log -1 --oneline`.