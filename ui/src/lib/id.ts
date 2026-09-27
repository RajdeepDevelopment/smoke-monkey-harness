let seq = 0;

/** Collision-safe id generator with a readable, sortable prefix. */
export function createId(prefix = 'msg'): string {
  const time = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 6)
      : Math.random().toString(36).slice(2, 8);
  const n = (seq = (seq + 1) % 0xffff).toString(36);
  return `${prefix}_${time}_${rand}_${n}`;
}