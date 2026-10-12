import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  GitBranch,
  ListChecks,
  Loader2,
  X,
} from 'lucide-react';
import type { ActiveContext, AgentTodo, ContextState, TodoStatus } from '../../types/agent';
import { todoCounts } from '../../types/agent';
import { cn } from '../../lib/cn';

export interface AgentStatusRailProps {
  /** The agent's live task list (`todo_write`). Empty hides the card. */
  todos?: AgentTodo[];
  /** The agent's live sub-context panel (`context_manage`). Null hides it. */
  contexts?: ContextState | null;
  /** Hide the task-list card. Default true when todos are present. */
  showTodos?: boolean;
  /** Hide the sub-context card. Default true when contexts are present. */
  showContexts?: boolean;
  /** Let each card collapse. Default true. */
  collapsible?: boolean;
  /** Click a sub-context chip. */
  onContextClick?: (context: ActiveContext) => void;
  className?: string;
}

/**
 * The agent's live status rail: a pinned task list and the currently active
 * sub-contexts.
 *
 * Both are run-level surfaces — the agent replaces them wholesale as it works,
 * and neither belongs in the transcript. The rail is rendered inside the chat
 * scroll container and sticks to the top of it (see `.agent-status-rail`), so
 * "what is the agent doing right now" stays visible while the conversation
 * scrolls underneath.
 *
 * ```tsx
 * <AgentStatusRail todos={state.todos} contexts={state.contexts} />
 * ```
 */
export function AgentStatusRail({
  todos = [],
  contexts = null,
  showTodos = true,
  showContexts = true,
  collapsible = true,
  onContextClick,
  className,
}: AgentStatusRailProps) {
  const hasContexts = showContexts && !!contexts && contexts.active.length > 0;
  const hasTodos = showTodos && todos.length > 0;
  if (!hasContexts && !hasTodos) return null;

  return (
    <div className={cn('agent-status-rail', className)} data-sm-agent-rail="">
      {hasContexts && (
        <RailCard
          kind="context"
          icon={<GitBranch className="h-3 w-3" />}
          title="Sub-contexts"
          summary={`${contexts!.count}/${contexts!.maxActive}`}
          collapsible={collapsible}
        >
          <div className="flex flex-wrap gap-1.5">
            {contexts!.active.map((ctx) =>
              onContextClick ? (
                <button
                  key={ctx.id}
                  type="button"
                  className="context-chip"
                  title={ctx.title}
                  onClick={() => onContextClick(ctx)}
                >
                  <GitBranch aria-hidden />
                  <span className="min-w-0">{ctx.title}</span>
                </button>
              ) : (
                <span key={ctx.id} className="context-chip" title={ctx.title}>
                  <GitBranch aria-hidden />
                  <span className="min-w-0">{ctx.title}</span>
                </span>
              ),
            )}
          </div>
        </RailCard>
      )}

      {hasTodos && (
        <RailCard
          kind="todo"
          icon={<ListChecks className="h-3 w-3" />}
          title="Task list"
          summary={`${todoCounts(todos).completed}/${todos.length}`}
          collapsible={collapsible}
        >
          <div role="list">
            {todos.map((todo, i) => (
              <TodoRow key={`${todo.content}-${i}`} todo={todo} />
            ))}
          </div>
        </RailCard>
      )}
    </div>
  );
}

function RailCard({
  kind,
  icon,
  title,
  summary,
  collapsible,
  children,
}: {
  kind: 'context' | 'todo';
  icon: ReactNode;
  title: string;
  summary: string;
  collapsible: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const expanded = !collapsible || open;

  return (
    <div className={cn('agent-card', `agent-card--${kind}`)}>
      <button
        type="button"
        className="agent-card__header"
        aria-expanded={expanded}
        onClick={() => collapsible && setOpen((v) => !v)}
        disabled={!collapsible}
      >
        <span className="agent-card__icon">{icon}</span>
        <span className="agent-card__title">{title}</span>
        <span className="agent-card__count">{summary}</span>
        {collapsible && (
          <ChevronDown
            aria-hidden
            className={cn(
              'agent-card__chevron transition-transform',
              expanded ? 'rotate-0' : '-rotate-90',
            )}
          />
        )}
      </button>
      {expanded && <div className="agent-card__body">{children}</div>}
    </div>
  );
}

function TodoRow({ todo }: { todo: AgentTodo }) {
  const status: TodoStatus = todo.status;
  const done = status === 'completed';
  const active = status === 'in_progress';
  const cancelled = status === 'cancelled';

  return (
    <div
      role="listitem"
      className={cn('todo-row', cancelled && 'todo-row--cancelled')}
    >
      <span
        className={cn(
          'todo-row__check',
          done && 'todo-row__check--done',
          active && 'todo-row__check--active',
        )}
        aria-hidden
      >
        {done ? (
          <Check />
        ) : active ? (
          <Loader2 className="animate-spin" />
        ) : cancelled ? (
          <X />
        ) : null}
      </span>
      <span className={cn('todo-row__text', done && 'todo-row__text--done', cancelled && 'todo-row__text--cancelled')}>
        {todo.content}
      </span>
    </div>
  );
}
