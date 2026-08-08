let counter = 0;

/** Session-local unique id. Never persisted, never used as a content identity. */
export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
