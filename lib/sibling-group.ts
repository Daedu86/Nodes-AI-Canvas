// Deterministic sibling group id derived from a parent id,
// but distinct from the parent id to avoid semantic collisions.
// Uses a tiny DJB2 hash for stability and speed (no crypto dependency).

export function computeSiblingGroupId(parentId: string): string {
  let hash = 5381 >>> 0;
  for (let i = 0; i < parentId.length; i++) {
    hash = (((hash << 5) + hash) ^ parentId.charCodeAt(i)) >>> 0; // hash * 33 ^ c
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `sib_${hex}`;
}

// Compute a deterministic group id from a set of message ids.
export function computeSiblingGroupIdFromIds(ids: string[]): string {
  const sorted = [...new Set(ids.filter(Boolean))].sort();
  let hash = 2166136261 >>> 0; // FNV-1a basis
  for (const s of sorted) {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hash ^= 1249; // delimiter
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `sib_${hex}`;
}

export type Pair = { a: string; b: string };

export function siblingComponentFor(id: string, links: Pair[]): string[] {
  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    if (!l?.a || !l?.b) continue;
    if (!adj.has(l.a)) adj.set(l.a, new Set());
    if (!adj.has(l.b)) adj.set(l.b, new Set());
    adj.get(l.a)!.add(l.b);
    adj.get(l.b)!.add(l.a);
  }
  if (!adj.has(id)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const q: string[] = [id];
  seen.add(id);
  while (q.length) {
    const cur = q.shift()!;
    out.push(cur);
    for (const nb of adj.get(cur) || []) {
      if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
  }
  return out;
}
