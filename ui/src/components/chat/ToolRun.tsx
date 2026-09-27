import type { ComponentType, ReactNode } from 'react';
import type { ToolCall } from '../../types/tool';
import type { RunPosition, ToolRun } from '../../lib/toolRuns';
import type { ToolCallCardProps } from './ToolCallCard';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/cn';

export interface ToolRunRowProps {
  call: ToolCall;
  position: RunPosition;
  /** Suppresses the top stub when a prose/artifact block broke the rail. */
  drawTop: boolean;
  className?: string;
  compact?: boolean;
  /** Card renderer. Defaults to <ToolCallCard/>; the `toolCall` slot overrides it. */
  Card?: ComponentType<ToolCallCardProps>;
}

/**
 * One call inside a chained run: a 24px rail gutter (line segments + node
 * dot) with the tool card beside it. The dot is tinted by status so a running
 * or failed call stands out inside the chain.
 */
export function ToolRunRow({ call, position, drawTop, className, compact, Card = ToolCallCard }: ToolRunRowProps) {
  const drawBottom = position === 'first' || position === 'mid';
  const dotState =
    call.status === 'running' || call.status === 'pending'
      ? ' sm-tool-run__node--running'
      : call.status === 'error'
        ? ' sm-tool-run__node--error'
        : '';

  return (
    <div className="sm-tool-run">
      <div className="sm-tool-run__gutter" aria-hidden="true">
        {drawTop && <span className="sm-tool-run__line sm-tool-run__line--top" />}
        {drawBottom && <span className="sm-tool-run__line sm-tool-run__line--main" />}
        <span className={cn('sm-tool-run__node', dotState)} />
      </div>
      <div className="sm-tool-run__body">
        <Card call={call} compact={compact} className={className} />
      </div>
    </div>
  );
}

export interface ToolRunHeaderProps {
  label: string;
  count: number;
  className?: string;
}

/** Phase label + call count that introduces a chained run. */
export function ToolRunHeader({ label, count, className }: ToolRunHeaderProps) {
  return (
    <div className={cn('sm-tool-run__header', className)}>
      <span className="sm-tool-run__header-dot" aria-hidden="true" />
      <span className="sm-tool-run__label">{label}</span>
      {count > 1 && (
        <span className="sm-tool-run__count">
          {count} <span className="sr-only">tool calls</span>calls
        </span>
      )}
    </div>
  );
}

export interface ToolRunGroupProps {
  run: ToolRun;
  calls: ToolCall[];
  compact?: boolean;
  className?: string;
  /** Rendered between the header and the rows. */
  children?: ReactNode;
  /** Card renderer. Defaults to <ToolCallCard/>; the `toolCall` slot overrides it. */
  Card?: ComponentType<ToolCallCardProps>;
}

/**
 * A full chained run: header, then one rail-connected row per call. The first
 * row draws the outgoing line but no incoming stub (nothing above it), and the
 * last row drops the outgoing line so the rail never dangles.
 */
export function ToolRunGroup({ run, calls, compact, className, children, Card }: ToolRunGroupProps) {
  return (
    <div className={className} data-tool-run={run.family} data-tool-run-size={run.total}>
      <ToolRunHeader label={run.label} count={run.total} />
      {children}
      {calls.map((call, i) => (
        <ToolRunRow
          key={call.id}
          call={call}
          compact={compact}
          Card={Card}
          position={run.positionById[call.id] ?? 'only'}
          drawTop={i > 0}
        />
      ))}
    </div>
  );
}
