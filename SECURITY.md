# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report
privately using GitHub's Private Vulnerability Reporting:

1. Go to **Security → Report a vulnerability** in the repository
   ([https://github.com/RajdeepDevelopment/smoke-monkey-harness/security](https://github.com/RajdeepDevelopment/smoke-monkey-harness/security)).
2. Describe the vulnerability, the affected version(s), and steps to reproduce.
3. Keep details private until the maintainers have had a chance to respond.

You can expect an acknowledgement within 3–5 business days and a fix plan or
mitigation after triage.

## Scope

- Secrets and credentials must never be committed. Report any accidental
  exposure in a private channel immediately (rotate the secret first).
- Secrets are read from environment variables only (e.g. `NVIDIA_API_KEY`,
  `OPENAI_API_KEY`, `GEMINI_API_KEY`); `.env*`, `dist/`, and `coverage/` are
  gitignored.
- The plugin's MCP server launches `node` and shells; be careful accepting
  untrusted tool output or configurations.

## Responsible disclosure

We ask that you give maintainers a reasonable window to ship a fix before the
issue is disclosed publicly.