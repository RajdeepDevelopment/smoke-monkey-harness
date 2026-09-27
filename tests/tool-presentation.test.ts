import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, definitionToAgentTool, type ToolDefinition } from '../src/tools/tool-registry.js';
import { customToolNames, withCustomTools } from '../src/services/tool-library.js';
import { resolveExposedTools, TOOL_GROUPS } from '../src/services/run-context.js';
import { AgentEventEmitter } from '../src/services/agent-event.emitter.js';
// Imported across the package boundary on purpose: `ui/` has no test runner of
// its own, and this is pure branching that is easy to get wrong in a way no
// amount of clicking in a demo would reveal.
import { resolvePresentation, withPresentation } from '../ui/src/lib/toolRuns.js';

function def(name: string, presentation?: ToolDefinition['presentation']): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    inputSchema: { type: 'object', properties: {} },
    ...(presentation ? { presentation } : {}),
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

describe('custom tool presentation', () => {
  it('carries a presentation from the definition through to the agent tool', () => {
    const tool = definitionToAgentTool(def('charge_card', { icon: '💳', label: 'Charge card' }));
    assert.equal(tool.presentation?.icon, '💳');
    assert.equal(tool.presentation?.label, 'Charge card');
  });

  it('leaves presentation absent when a tool declares none', () => {
    const tool = definitionToAgentTool(def('plain_tool'));
    // Absent, not `undefined`-valued: a missing key and an explicit undefined
    // would serialise differently over the wire.
    assert.equal('presentation' in tool, false);
  });

  it('resolves presentation for one tool and lists them all by name', () => {
    const registry = new ToolRegistry();
    registry.register(definitionToAgentTool(def('charge_card', { icon: '💳', label: 'Charge card' })));
    registry.register(definitionToAgentTool(def('no_icon', { family: 'verify' })));
    registry.register(definitionToAgentTool(def('bare')));

    assert.equal(registry.getPresentation('charge_card')?.icon, '💳');
    assert.equal(registry.getPresentation('bare'), undefined);

    const all = registry.getPresentations();
    assert.deepEqual(Object.keys(all).sort(), ['charge_card', 'no_icon']);
    assert.equal(all.no_icon.family, 'verify');
  });

  it('returns a fresh object so a caller cannot mutate the registry', () => {
    const registry = new ToolRegistry();
    registry.register(definitionToAgentTool(def('charge_card', { icon: '💳' })));

    const first = registry.getPresentations();
    first.charge_card.icon = 'tampered';
    assert.equal(registry.getPresentation('charge_card')?.icon, '💳');
  });

  it('never leaks presentation into the tool definition sent to the model', () => {
    // The model has no use for an icon, and spending tokens on it is a real
    // cost at scale.
    const registry = new ToolRegistry();
    registry.register(definitionToAgentTool(def('charge_card', { icon: '💳' })));
    const [described] = registry.getDefinitions();
    assert.equal('presentation' in described, false);
  });
});

describe('tool.completed payload', () => {
  function capture() {
    const emitter = new AgentEventEmitter();
    const seen: Array<Record<string, unknown>> = [];
    emitter.on('tool.completed', (e) => seen.push(e.data as unknown as Record<string, unknown>));
    return { emitter, seen };
  }

  it('names the tool, so a completion-only subscriber knows what finished', () => {
    const { emitter, seen } = capture();
    emitter.emitToolCompleted('s1', 'r1', 'call_1', 'charge_card', { success: true });
    assert.equal(seen[0]!.toolName, 'charge_card');
    assert.equal(seen[0]!.toolCallId, 'call_1');
  });

  it('includes the presentation when one is given, and omits the key when not', () => {
    const { emitter, seen } = capture();
    emitter.emitToolCompleted('s1', 'r1', 'call_1', 'charge_card', {}, { icon: '💳' });
    emitter.emitToolCompleted('s1', 'r1', 'call_2', 'read_file', {});
    assert.deepEqual(seen[0]!.presentation, { icon: '💳' });
    assert.equal('presentation' in seen[1]!, false);
  });
});

describe('presentation precedence', () => {
  const host = { charge_card: { icon: '🏦', label: 'Host label', family: 'run' as const } };

  it('prefers what the event declared over what the host supplied', () => {
    const resolved = resolvePresentation('charge_card', { icon: '💳' }, host);
    assert.equal(resolved?.icon, '💳');
  });

  it('merges per field, so an event that states only an icon still gets the host label', () => {
    // The alternative — "per-call wins, wholesale" — makes a host registry
    // useless for any tool that declares a partial presentation, which is the
    // common case.
    assert.deepEqual(resolvePresentation('charge_card', { icon: '💳' }, host), {
      icon: '💳',
      label: 'Host label',
      family: 'run',
    });
  });

  it('falls back to the host for a tool that arrived without one', () => {
    assert.deepEqual(resolvePresentation('charge_card', undefined, host), host.charge_card);
  });

  it('returns undefined when neither side knows the tool, leaving inference in charge', () => {
    assert.equal(resolvePresentation('mystery_tool', undefined, host), undefined);
    assert.equal(resolvePresentation('mystery_tool', undefined, undefined), undefined);
  });

  it('keeps call identity when there is nothing to merge', () => {
    const call = { id: '1', name: 'read_file', status: 'complete' } as never;
    assert.equal(withPresentation(call, undefined), call);
    // Host has an entry, but not for *this* tool: a new object here would
    // re-render every tool card on every unrelated host-map change.
    assert.equal(withPresentation(call, { other: { icon: 'x' } }), call);
  });

  it('produces a merged call when the host does have an entry', () => {
    const call = { id: '1', name: 'charge_card', status: 'complete', presentation: { icon: '💳' } } as never;
    const merged = withPresentation(call, host) as unknown as { presentation: { icon: string; label: string } };
    assert.equal(merged.presentation.icon, '💳');
    assert.equal(merged.presentation.label, 'Host label');
  });
});

describe('a registered custom tool is actually reachable', () => {
  function registryWith(...names: string[]): ToolRegistry {
    const registry = new ToolRegistry();
    for (const n of names) registry.register(definitionToAgentTool(def(n)));
    return registry;
  }

  it('exposes host tools that no built-in group covers', () => {
    const exposed = withCustomTools(resolveExposedTools(new Set(['core'])), registryWith('charge_card'));
    assert.ok(exposed.has('charge_card'));
  });

  it('does not double-count a custom tool that shadows a built-in name', () => {
    // A host overriding `read_file` is still one tool, and the built-in
    // spelling is what the loop's own checks use.
    const exposed = withCustomTools(resolveExposedTools(new Set(['core'])), registryWith('read_file'));
    const names = [...exposed].filter((n) => n === 'read_file');
    assert.equal(names.length, 1);
    assert.equal(customToolNames(registryWith('read_file')).length, 0);
  });

  it('leaves the built-in set untouched when there are no custom tools', () => {
    const groups = new Set(['core', 'editing']);
    assert.deepEqual(
      [...withCustomTools(resolveExposedTools(groups), registryWith())].sort(),
      [...resolveExposedTools(groups)].sort(),
    );
  });

  it('does not mutate the caller\'s set', () => {
    const groups = resolveExposedTools(new Set(['core']));
    const before = groups.size;
    withCustomTools(groups, registryWith('charge_card'));
    assert.equal(groups.size, before);
    assert.equal(groups.has('charge_card'), false);
  });

  it('exposes every custom tool, not just the first', () => {
    const exposed = withCustomTools(
      resolveExposedTools(new Set(['core'])),
      registryWith('charge_card', 'refund_order', 'check_inventory'),
    );
    for (const n of ['charge_card', 'refund_order', 'check_inventory']) {
      assert.ok(exposed.has(n), `${n} should be exposed`);
    }
  });

  it('names only what a host added, across all groups', () => {
    const everyBuiltin = new Set(Object.values(TOOL_GROUPS).flat());
    for (const n of everyBuiltin) {
      assert.equal(
        customToolNames(registryWith(n)).includes(n),
        false,
        `${n} is built-in and should not be reported as custom`,
      );
    }
    assert.deepEqual(customToolNames(registryWith('charge_card')), ['charge_card']);
  });
});
