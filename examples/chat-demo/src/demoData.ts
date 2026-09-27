// A little fake "environment" so the demo feels real without any servers.
// Swap these for data from your own backend whenever you're ready.

import type {
  ApiKeyOption,
  ChatModelOption,
  MCPServerOption,
  WorkspaceOption,
} from '@smoke-monkey/ui';

export const DEMO_MODELS: ChatModelOption[] = [
  { id: 'oc/big-pickle', label: 'Smoke Monkey Turbo', provider: 'smoke' },
  { id: 'oc/signet-5', label: 'Smoke Monkey Pro', provider: 'smoke' },
  { id: 'anthropic/claude-haiku', label: 'Claude Haiku', provider: 'anthropic' },
  { id: 'openai/gpt-mini', label: 'GPT-mini', provider: 'openai' },
];

export const DEMO_WORKSPACES: WorkspaceOption[] = [
  { id: 'local', name: 'Local' },
  { id: 'team-eng', name: 'Team · Engineering' },
  { id: 'docs', name: 'Docs & Research' },
];

const MCP_NAMES = [
  'filesystem',
  'github',
  'postgres',
  'redis',
  'web-search',
  'playwright',
  'docker',
  'kubernetes',
  'slack',
  'notion',
  'linear',
  'figma',
  'stripe',
  'aws',
  'gcp',
  'azure',
  'supabase',
  'firebase',
  's3',
  'dynamodb',
  'elasticsearch',
  'mongodb',
  'kafka',
  'rabbitmq',
  'sqlite',
  'browser-mcp',
  'tavily',
  'exa',
  'memory',
  'docs',
  'vscode',
  'terminal',
  'local-db',
  'health',
  'logs',
  'metrics',
  'realtime',
  'calendar',
  'email',
  'translator',
  'grammarly',
  'puppeteer',
  'gitlab',
];

export const DEMO_MCP_SERVERS: MCPServerOption[] = MCP_NAMES.map((name, i) => ({
  id: name,
  name,
  connected: i % 3 !== 0,
  toolCount: i % 3 === 0 ? 0 : 3 + (i % 7),
}));

export const DEMO_API_KEYS: ApiKeyOption[] = [
  { provider: 'openai', status: 'set' },
  { provider: 'anthropic', status: 'set' },
  { provider: 'google', status: 'set' },
  { provider: 'groq', status: 'missing' },
];

export const DEMO_SUGGESTIONS = [
  'Fix the failing tests',
  'Explain this code',
  'Add a feature',
  'Find a bug',
];