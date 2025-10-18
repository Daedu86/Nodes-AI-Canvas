"use client";

// Lightweight sibling link store using localStorage.
// Stores undirected pairs of message ids that should be visualized as siblings.

const KEY = "a-ui.sibling-links.v1";
const DET_KEY = "a-ui.sibling-detached.v1";

export type SiblingLink = { a: string; b: string };

function read(): SiblingLink[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any) => x && typeof x.a === "string" && typeof x.b === "string");
  } catch {
    return [];
  }
}

function write(arr: SiblingLink[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

function normalize(a: string, b: string): SiblingLink {
  return a < b ? { a, b } : { a: b, b: a };
}

export function listSiblingLinks(): SiblingLink[] {
  return read();
}

export function addSiblingLink(id1: string, id2: string) {
  if (!id1 || !id2 || id1 === id2) return;
  const cur = read();
  const link = normalize(id1, id2);
  if (cur.some((l) => l.a === link.a && l.b === link.b)) return;
  cur.push(link);
  write(cur);
}

export function removeSiblingLink(id1: string, id2: string) {
  const cur = read();
  const link = normalize(id1, id2);
  const next = cur.filter((l) => !(l.a === link.a && l.b === link.b));
  write(next);
}

export function listDetached(): string[] {
  try {
    const raw = localStorage.getItem(DET_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: any) => typeof x === "string");
  } catch {
    return [];
  }
}

export function addDetached(id: string) {
  if (!id) return;
  try {
    const cur = listDetached();
    if (cur.includes(id)) return;
    cur.push(id);
    localStorage.setItem(DET_KEY, JSON.stringify(cur));
  } catch {}
}
