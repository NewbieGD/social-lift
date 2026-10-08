// "New" marks: which cosmetic items the player has already seen in the Styles, Decoration and Pets
// screens. Items found, bought or earned since the last visit are highlighted once.

const KEY = 'sl_seen_items';

function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function write(s: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* blocked storage: the marks just do not persist */
  }
}

/**
 * Items owned that were not seen yet. On the very first launch of this version everything the
 * player already has counts as seen (so that nothing is flagged at once).
 */
export function unseen(owned: string[]): Set<string> {
  const seen = read();
  if (!seen) {
    write(new Set(owned));
    return new Set();
  }
  return new Set(owned.filter((id) => !seen.has(id)));
}

export function markSeen(ids: Iterable<string>): void {
  const seen = read() ?? new Set<string>();
  for (const id of ids) seen.add(id);
  write(seen);
}
