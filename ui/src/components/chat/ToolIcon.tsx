import type { CSSProperties } from 'react';
import {
  CircleHelp,
  FileSearch,
  GitBranch,
  ListTodo,
  PencilLine,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ToolPresentation, ToolTone } from '../../types/tools';
import type { ToolFamily } from '../../lib/toolRuns';
import { toolFamily } from '../../lib/toolRuns';
import { cn } from '../../lib/cn';

const FAMILY_ICONS: Record<ToolFamily, LucideIcon> = {
  inspect: FileSearch,
  edit: PencilLine,
  run: SquareTerminal,
  verify: Wrench,
  git: GitBranch,
  plan: ListTodo,
  ask: CircleHelp,
};

export const TOOL_FAMILY_ICONS = FAMILY_ICONS;

export interface ToolIconProps {
  /** Any tool name; the family is inferred when `family` is omitted. */
  name?: string;
  family?: ToolFamily;
  /** Emoji declared by the tool. Wins over the family glyph when present. */
  icon?: string;
  /** Declared accent. Applied to either the emoji or the family glyph. */
  tone?: ToolTone;
  className?: string;
  /** Tint the glyph, e.g. to match a status. */
  style?: CSSProperties;
}

/** Accent per declared tone, so a custom tool can read as its own kind. */
const TONE_CLASS: Record<ToolTone, string> = {
  default: '',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * Per-family glyph so a run of tool calls is scannable: reads, edits, command
 * runs, tests, git, planning and questions each get their own icon instead of
 * one generic wrench.
 *
 * A tool that declares its own emoji gets that instead — inference is a
 * guess about an unknown name, and for a custom tool like `charge_card` the
 * guess ("run") is wrong in a way the author already solved.
 */
export function ToolIcon({ name, family, icon, tone, className, style }: ToolIconProps) {
  // `default` maps to an empty string so it adds nothing, which keeps a
  // tone-less call's classes identical to before tones existed.
  const toneClass = tone ? TONE_CLASS[tone] : '';
  if (icon) {
    return (
      <span
        className={cn(
          'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] leading-none',
          toneClass,
          className,
        )}
        style={style}
        aria-hidden="true"
      >
        {icon}
      </span>
    );
  }
  const Icon = FAMILY_ICONS[family ?? toolFamily(name ?? '')];
  return (
    <Icon
      className={cn('h-3.5 w-3.5 shrink-0', toneClass, className)}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Resolve a tool's label: declared first, then a title-cased name. */
export function toolLabel(name: string, presentation?: ToolPresentation): string {
  if (presentation?.label) return presentation.label;
  const spaced = name.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
