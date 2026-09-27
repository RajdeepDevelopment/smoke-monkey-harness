import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProviderError,
  connectionLostError,
  emptyResponseError,
  errorMessageOf,
  hookBlockedError,
  permissionDeniedError,
  repeatedErrorError,
  runHardStopError,
  toAgentErrorInfo,
  toolBlockedError,
  toolCancelledError,
  toolFailedError,
  toolNotFoundError,
  type AgentErrorInfo,
} from '../src/services/agent-error.js';

describe('toAgentErrorInfo', () => {
  it('normalises a bare string without losing the message', () => {
    const e = toAgentErrorInfo('something broke');
    assert.equal(e.message, 'something broke');
    assert.equal(e.layer, 'run');
    assert.equal(e.severity, 'error');
    assert.equal(e.retryable, true);
  });

  it('applies the caller fallback for missing fields', () => {
    const e = toAgentErrorInfo('nope', { layer: 'tool', severity: 'warning', retryable: false, hint: 'do X' });
    assert.equal(e.layer, 'tool');
    assert.equal(e.severity, 'warning');
    assert.equal(e.retryable, false);
    assert.equal(e.hint, 'do X');
  });

  it('keeps a fully specified error untouched', () => {
    const full: AgentErrorInfo = {
      code: 'tool_x', layer: 'tool', severity: 'info', message: 'm', retryable: false,
    };
    assert.deepEqual(toAgentErrorInfo(full), full);
  });

  it('rejects invalid layer/severity instead of trusting them', () => {
    const e = toAgentErrorInfo({ layer: 'bogus', severity: 'nope' } as never, { layer: 'transport', severity: 'warning' });
    assert.equal(e.layer, 'transport');
    assert.equal(e.severity, 'warning');
  });

  it('handles null/undefined/empty message', () => {
    assert.equal(toAgentErrorInfo(undefined).message, 'Something went wrong.');
    assert.equal(toAgentErrorInfo('   ').message, 'Something went wrong.');
  });
});

describe('errorMessageOf', () => {
  it('reads .message, strings, and falls back', () => {
    assert.equal(errorMessageOf(new Error('boom')), 'boom');
    assert.equal(errorMessageOf('plain'), 'plain');
    assert.equal(errorMessageOf({ message: 'obj' }), 'obj');
    assert.equal(errorMessageOf(null), 'Unknown error');
  });
});

describe('classifyProviderError', () => {
  const cases: Array<[RegExp, Partial<AgentErrorInfo>]> = [
    [/429|rate limit|too many requests/i, { code: 'provider_rate_limited', severity: 'error', retryable: true }],
    [/insufficient_quota|quota exceeded/i, { code: 'provider_rate_limited', severity: 'error', retryable: true }],
    [/403 forbidden/i, { code: 'provider_auth', severity: 'fatal', retryable: false }],
    [/invalid api key/i, { code: 'provider_auth', severity: 'fatal', retryable: false }],
    [/request timed out/i, { code: 'provider_timeout', severity: 'error', retryable: true }],
    [/503 service unavailable/i, { code: 'provider_unavailable', severity: 'error', retryable: true }],
  ];

  for (const [re, expect] of cases) {
    it(`classifies ${re} as ${expect.code}`, () => {
      const e = classifyProviderError(`oc/some-model: ${re.source}`, 'gpt-x');
      assert.equal(e.code, expect.code);
      assert.equal(e.layer, 'provider');
      assert.equal(e.severity, expect.severity);
      assert.equal(e.retryable, expect.retryable);
    });
  }

  it('always produces a non-empty user-facing message and a hint when useful', () => {
    for (const re of [/429/, /403/, /timeout/, /500/, /weird unknown thing/]) {
      const e = classifyProviderError(re.source, 'gpt-x');
      assert.ok(e.message.length > 10, `message too short for ${re}`);
      assert.match(e.message, /gpt-x/, 'names the model');
    }
  });

  it('treats an abort as informational rather than an error', () => {
    const e = classifyProviderError('The operation was aborted');
    assert.equal(e.severity, 'info');
    assert.equal(e.retryable, true);
  });

  it('handles an empty provider error', () => {
    const e = classifyProviderError('');
    assert.equal(e.code, 'provider_empty_error');
    assert.ok(e.message.length > 0);
  });

  it('does not leak an unbounded provider dump into the message', () => {
    const e = classifyProviderError('x'.repeat(2000));
    assert.ok(e.message.length < 400, `message was ${e.message.length} chars`);
  });
});

describe('layer-specific constructors', () => {
  it('builds tool_not_found in the tool layer', () => {
    const e = toolNotFoundError('write_file', 'finalize');
    assert.equal(e.code, 'tool_not_found');
    assert.equal(e.layer, 'tool');
    assert.equal(e.retryable, false);
    assert.match(e.message, /finalize/);
  });

  it('builds a tool block as a warning, not an error', () => {
    const e = toolBlockedError('bash', 'doom loop');
    assert.equal(e.severity, 'warning');
    assert.equal(e.layer, 'tool');
  });

  it('builds a cancelled tool as info + retryable', () => {
    const e = toolCancelledError('bash');
    assert.equal(e.severity, 'info');
    assert.equal(e.retryable, true);
  });

  it('builds a tool failure that names the tool', () => {
    const e = toolFailedError('read_file', 'ENOENT');
    assert.match(e.message, /read_file/);
    assert.match(e.message, /ENOENT/);
    assert.equal(e.severity, 'error');
  });

  it('builds permission denials in the permission layer', () => {
    const e = permissionDeniedError('sensitive file', 'read_file');
    assert.equal(e.layer, 'permission');
    assert.equal(e.severity, 'warning');
    assert.match(e.message, /read_file/);
  });

  it('marks run-level stops as fatal and not retryable', () => {
    for (const e of [runHardStopError('cap hit'), repeatedErrorError('same error')]) {
      assert.equal(e.layer, 'run');
      assert.equal(e.severity, 'fatal');
      assert.equal(e.retryable, false);
    }
  });

  it('marks empty responses fatal but retryable and hints at 429', () => {
    const e = emptyResponseError('gpt-x');
    assert.equal(e.code, 'run_empty_responses');
    assert.equal(e.severity, 'fatal');
    assert.equal(e.retryable, true, 'a rate limit clears, so retrying is right');
    assert.match(e.hint!, /429/);
  });

  it('blocks a run fatally but a single tool call only as a warning', () => {
    assert.equal(hookBlockedError('beforeModelCall', 'no').severity, 'fatal');
    assert.equal(hookBlockedError('beforeModelCall', 'no').layer, 'hook');
    const toolBlock = hookBlockedError('beforeToolCall', 'no', 'tool');
    assert.equal(toolBlock.severity, 'warning');
    assert.equal(toolBlock.layer, 'tool');
    assert.equal(toolBlock.retryable, false);
  });

  it('builds a reconnectable transport error', () => {
    const e = connectionLostError('socket closed');
    assert.equal(e.layer, 'transport');
    assert.equal(e.severity, 'warning');
    assert.equal(e.retryable, true);
  });
});
