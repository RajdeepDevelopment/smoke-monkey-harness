import { useEffect } from 'react';

export interface KeyboardShortcut {
  /** Single key, e.g. 'Enter', 'Escape'. */
  key: string;
  handler: (event: KeyboardEvent) => void;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Only fire when the event target is an editable element. */
  whenEditing?: boolean;
  preventDefault?: boolean;
}

/**
 * Global keyboard shortcuts, e.g. Enter-to-send while the composer is focused,
 * Escape-to-stop a stream. Attached to `window`; cleanup on unmount.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const matches =
          event.key === shortcut.key &&
          (shortcut.shiftKey ?? false) === event.shiftKey &&
          (shortcut.ctrlKey ?? false) === event.ctrlKey &&
          (shortcut.metaKey ?? false) === event.metaKey &&
          (shortcut.altKey ?? false) === event.altKey;
        if (!matches) continue;
        if (shortcut.whenEditing === true && !isEditable(event.target)) continue;
        if (shortcut.whenEditing === false && isEditable(event.target)) continue;
        if (shortcut.preventDefault) event.preventDefault();
        shortcut.handler(event);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === 'textarea' || tag === 'input' || tag === 'select';
}