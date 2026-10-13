import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import type { ToolCall } from "../../types/tool";
import { cn } from "../../lib/cn";
import { formatCompact } from "../../lib/format";
import { ToolIcon, toolLabel } from "./ToolIcon";
import { ErrorCard } from "./ErrorCard";

export interface ToolCallCardProps {
  call: ToolCall;
  /** Trim long inputs/outputs in the collapsed row. */
  compact?: boolean;
  className?: string;
}

const STATUS_TEXT: Record<ToolCall["status"], string> = {
  pending: "Queued",
  running: "Running",
  success: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

const STATUS_ICON = (status: ToolCall["status"]) => {
  switch (status) {
    case "running":
    case "pending":
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />;
    case "success":
      return <Check className="h-3 w-3 shrink-0 text-success/70" />;
    case "error":
      return <X className="h-3 w-3 shrink-0 text-destructive/80" />;
    default:
      return null;
  }
};

interface DelegatedTarget {
  agentId: string;
  agentName?: string;
  taskTitle?: string;
}

function extractDelegatedTargets(call: ToolCall): DelegatedTarget[] {
  if (call.name !== "delegate_task") return [];
  const map = new Map<string, DelegatedTarget>();

  const parseObj = (val: unknown): any => {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }
    return null;
  };

  const inp = parseObj(call.input);
  if (inp && typeof inp === "object") {
    if (typeof inp.target_agent_id === "string" && inp.target_agent_id.trim()) {
      const id = inp.target_agent_id.trim();
      map.set(id, {
        agentId: id,
        taskTitle: typeof inp.task_title === "string" ? inp.task_title.trim() : undefined,
      });
    }
    if (Array.isArray(inp.tasks)) {
      for (const t of inp.tasks) {
        if (t && typeof t.target_agent_id === "string" && t.target_agent_id.trim()) {
          const id = t.target_agent_id.trim();
          map.set(id, {
            agentId: id,
            taskTitle: typeof t.task_title === "string" ? t.task_title.trim() : undefined,
          });
        }
      }
    }
  }

  const out = parseObj(call.output);
  if (out && typeof out === "object") {
    if (typeof out.target_agent_id === "string" && out.target_agent_id.trim()) {
      const id = out.target_agent_id.trim();
      const existing: DelegatedTarget = map.get(id) || { agentId: id };
      if (out.target_agent_name) existing.agentName = out.target_agent_name;
      if (out.task_title) existing.taskTitle = out.task_title;
      map.set(id, existing);
    }
    if (Array.isArray(out.results)) {
      for (const r of out.results) {
        if (r && typeof r.target_agent_id === "string" && r.target_agent_id.trim()) {
          const id = r.target_agent_id.trim();
          const existing: DelegatedTarget = map.get(id) || { agentId: id };
          if (r.target_agent_name) existing.agentName = r.target_agent_name;
          if (r.task_title) existing.taskTitle = r.task_title;
          map.set(id, existing);
        }
      }
    }
  }

  return Array.from(map.values());
}

/**
 * A single tool invocation: family icon, name, duration and a status mark.
 * Deliberately borderless — the run rail and the surrounding prose supply the
 * structure, so the row itself stays quiet. Input/output expand in place.
 */
export function ToolCallCard({ call, compact, className }: ToolCallCardProps) {
  // A failure opens by default — the reason is the whole point of the card.
  const [open, setOpen] = useState(call.status === "running" || call.status === "error");
  const hasDetails = call.input !== undefined || call.output !== undefined || !!call.error;
  const failed = call.status === "error";
  const delegations = extractDelegatedTargets(call);

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((v) => !v)}
        title={`${toolLabel(call.name, call.presentation)} — ${STATUS_TEXT[call.status]}`}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors",
          hasDetails ? "cursor-pointer hover:bg-surface-800/50" : "cursor-default"
        )}
      >
        <ToolIcon
          name={call.name}
          icon={call.presentation?.icon}
          family={call.presentation?.family}
          tone={failed || call.status === "running" ? undefined : call.presentation?.tone}
          className={failed ? (call.error?.severity === "warning" ? "text-warning" : "text-destructive/80") : call.status === "running" ? "text-accent" : "text-ink-muted"}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-primary">
          {toolLabel(call.name, call.presentation)}
        </span>
        {call.durationMs != null && call.status !== "pending" && (
          <span className="shrink-0 text-[10px] tabular-nums text-ink-secondary">
            {formatCompact(call.durationMs)}ms
          </span>
        )}
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {STATUS_ICON(call.status)}
        </span>
        {!compact && hasDetails && (
          <ChevronsUpDown
            className={cn("h-3 w-3 shrink-0 text-ink-muted transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {/* Interactive delegation buttons to jump to delegated agent session */}
      {delegations.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6 pb-0.5">
          {delegations.map((d) => (
            <button
              key={d.agentId}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent("canvas:open-agent", {
                    detail: {
                      agentId: d.agentId,
                      agentName: d.agentName,
                      taskTitle: d.taskTitle,
                    },
                  })
                );
              }}
              className="group inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-300 transition-all hover:border-sky-400/60 hover:bg-sky-500/25 hover:text-sky-100 shadow-sm cursor-pointer"
              title={`Switch drawer to ${d.agentName || d.agentId} session`}
            >
              <span className="text-[12px]">👁️</span>
              <span>
                View {d.agentName ? `"${d.agentName}"` : `Agent (${d.agentId.slice(0, 10)}...)`} Session
              </span>
              <span className="opacity-60 transition-transform group-hover:translate-x-0.5">➔</span>
            </button>
          ))}
        </div>
      )}

      {open && hasDetails && (
        <div className="mt-1 grid gap-1.5 border-l border-surface-700 pl-3">
          {call.error ? (
            <ErrorCard error={call.error} dense />
          ) : (
            call.output !== undefined && <JsonBlock label={failed ? "Error" : "Output"} value={call.output} />
          )}
          {call.input !== undefined && <JsonBlock label="Input" value={call.input} />}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value);
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-ink-secondary">
        {label}
      </span>
      <pre className="max-h-48 overflow-auto rounded-md bg-surface-950/70 p-2 text-[10.5px] leading-relaxed text-ink-secondary">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  );
}
