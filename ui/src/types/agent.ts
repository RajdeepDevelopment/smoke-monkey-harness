/**
 * Agent-surface state that lives above the transcript rather than inside it.
 *
 * The harness streams two run-level signals that are not "messages": the live
 * task list (`todo_write`) and the sub-context panel (`context_manage`). Both
 * describe *what the agent is doing right now* and both are replaced wholesale
 * on every update, which is why the UI keeps them pinned above the chat instead
 * of appending them as message parts.
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type TodoPriority = 'high' | 'medium' | 'low' | (string & {});

/**
 * One row of the agent's task list, as emitted by the harness `todo_write`
 * tool. The harness sends the complete list on every call, so a consumer
 * should replace its previous `AgentTodo[]` rather than merge.
 */
export interface AgentTodo {
  /** What the task is — a short imperative line. */
  content: string;
  status: TodoStatus;
  priority?: TodoPriority;
}

/** A sub-context the agent currently has open. */
export interface ActiveContext {
  id: string;
  title: string;
}

/**
 * The live sub-context panel: which domain-guidance contexts are active, how
 * many, and the cap. Mirrors the harness `context.updated` payload.
 */
export interface ContextState {
  active: ActiveContext[];
  count: number;
  maxActive: number;
}

/** Normalize any status string the harness might send. */
export function toTodoStatus(value: unknown): TodoStatus {
  return value === 'in_progress' || value === 'completed' || value === 'cancelled'
    ? value
    : 'pending';
}

/**
 * Coerce a raw `todo.updated` payload into `AgentTodo[]`.
 *
 * The event data is untyped on the wire, so every field is checked: a
 * malformed row is dropped rather than rendered as `undefined`, and a missing
 * status reads as `pending` instead of crashing the card.
 */
export function normalizeTodos(input: unknown): AgentTodo[] {
  if (!Array.isArray(input)) return [];
  const todos: AgentTodo[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const content = typeof row.content === 'string' ? row.content.trim() : '';
    if (!content) continue;
    const todo: AgentTodo = { content, status: toTodoStatus(row.status) };
    if (typeof row.priority === 'string' && row.priority) todo.priority = row.priority;
    todos.push(todo);
  }
  return todos;
}

/** Coerce a raw `context.updated` payload into a `ContextState`. */
export function normalizeContexts(
  active: unknown,
  count: unknown,
  maxActive: unknown,
): ContextState {
  const list: ActiveContext[] = [];
  if (Array.isArray(active)) {
    for (const item of active) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) continue;
      list.push({ id, title: typeof row.title === 'string' && row.title ? row.title : id });
    }
  }
  return {
    active: list,
    count: typeof count === 'number' ? count : list.length,
    maxActive: typeof maxActive === 'number' ? maxActive : list.length,
  };
}

/** Counts per status, for the card's "3/5" summary. */
export function todoCounts(todos: AgentTodo[]): {
  total: number;
  completed: number;
  inProgress: number;
  cancelled: number;
} {
  let completed = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const t of todos) {
    if (t.status === 'completed') completed += 1;
    else if (t.status === 'in_progress') inProgress += 1;
    else if (t.status === 'cancelled') cancelled += 1;
  }
  return { total: todos.length, completed, inProgress, cancelled };
}
