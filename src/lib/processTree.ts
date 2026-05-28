import type { ProcessEntry } from '../stores/processStore';

type SortKey = 'cpu' | 'mem' | 'name';

export interface TreeRow {
  proc: ProcessEntry;
  depth: number; // 0 = root
  hasChildren: boolean;
  expanded: boolean;
  pinned: boolean; // part of the active pinned ancestor chain
  cpuAccum: number; // own + every descendant's cpu_percent (already % of total cores)
  memAccum: number; // own + every descendant's memory_mb (PSS — never exceeds physical RAM)
}

interface TreeNode {
  proc: ProcessEntry;
  children: TreeNode[];
  cpuAccum: number;
  memAccum: number;
}

// Roots (depth 0) are expanded by default; everything deeper is folded. The
// `toggled` set flips a node's fold state relative to this default.
export const AUTO_EXPAND_DEPTH = 1;

// Walks ppid links from `pid` up to its root, returning the ordered path
// [pid, parent, …, root]. Cycle-safe. Empty when `pid` is absent.
export function ancestorChain(processes: ProcessEntry[], pid: number): number[] {
  const byPid = new Map<number, ProcessEntry>();
  for (const p of processes) byPid.set(p.pid, p);
  const chain: number[] = [];
  const seen = new Set<number>();
  let cur: number | undefined = pid;
  while (cur !== undefined && byPid.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    const parent: number = byPid.get(cur)!.ppid;
    cur = parent === 0 ? undefined : parent;
  }
  return chain;
}

// The same path as a set (membership tests for the pinned chain).
export function ancestorPids(processes: ProcessEntry[], pid: number): Set<number> {
  return new Set(ancestorChain(processes, pid));
}

// Orders siblings by accumulated subtree weight (heaviest subtree leads); pinned
// chain members lead their level. Memory uses PSS so the sum reflects real RAM.
function sortNodes(nodes: TreeNode[], sortBy: SortKey, pinned: Set<number>): void {
  nodes.sort((a, b) => {
    const ap = pinned.has(a.proc.pid) ? 0 : 1;
    const bp = pinned.has(b.proc.pid) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (sortBy === 'cpu') return b.cpuAccum - a.cpuAccum;
    if (sortBy === 'mem') return b.memAccum - a.memAccum;
    return a.proc.name.localeCompare(b.proc.name);
  });
}

// Post-order DFS path-sum: build every child first, then fold their accumulated
// totals back into this node (own + Σ descendants), for both cpu and PSS memory.
// `seen` breaks ppid cycles.
function buildNode(
  pid: number,
  byPid: Map<number, ProcessEntry>,
  childPids: Map<number, number[]>,
  seen: Set<number>,
  sortBy: SortKey,
  pinned: Set<number>,
): TreeNode {
  const proc = byPid.get(pid)!;
  const node: TreeNode = { proc, children: [], cpuAccum: proc.cpu_percent, memAccum: proc.memory_mb };
  seen.add(pid);
  for (const childPid of childPids.get(pid) ?? []) {
    if (seen.has(childPid)) continue; // cycle guard
    const child = buildNode(childPid, byPid, childPids, seen, sortBy, pinned);
    node.children.push(child);
    node.cpuAccum += child.cpuAccum;
    node.memAccum += child.memAccum;
  }
  sortNodes(node.children, sortBy, pinned);
  return node;
}

// A process is a root when its ppid is 0 or points at a pid not in this snapshot.
function isRoot(proc: ProcessEntry, byPid: Map<number, ProcessEntry>): boolean {
  return proc.ppid === 0 || !byPid.has(proc.ppid);
}

// Pre-order DFS: emit a row for `node`, then recurse into its children when the
// node is open. A node is open by default when its depth < AUTO_EXPAND_DEPTH;
// membership in `toggled` flips that. Roots are always emitted by the caller.
function emitRows(
  node: TreeNode,
  depth: number,
  toggled: Set<number>,
  pinned: Set<number>,
  out: TreeRow[],
): void {
  const open = (depth < AUTO_EXPAND_DEPTH) !== toggled.has(node.proc.pid);
  out.push({
    proc: node.proc,
    depth,
    hasChildren: node.children.length > 0,
    expanded: open,
    pinned: pinned.has(node.proc.pid),
    cpuAccum: node.cpuAccum,
    memAccum: node.memAccum,
  });
  if (!open) return;
  for (const child of node.children) emitRows(child, depth + 1, toggled, pinned, out);
}

// Builds the visible tree rows. Every row carries its subtree-accumulated cpu/mem
// (a leaf's accum is just its own); pinned chain members are hoisted to the top of
// their level. By default roots show one level of children; `toggled` holds the
// pids the user flipped from that default.
export function buildVisibleTree(
  processes: ProcessEntry[],
  toggled: Set<number>,
  sortBy: SortKey,
  pinned: Set<number>,
): TreeRow[] {
  const byPid = new Map<number, ProcessEntry>();
  for (const p of processes) byPid.set(p.pid, p);
  const childPids = new Map<number, number[]>();
  for (const p of processes) {
    if (isRoot(p, byPid)) continue;
    const siblings = childPids.get(p.ppid) ?? [];
    siblings.push(p.pid);
    childPids.set(p.ppid, siblings);
  }

  const seen = new Set<number>();
  const roots = processes
    .filter((p) => isRoot(p, byPid))
    .map((p) => buildNode(p.pid, byPid, childPids, seen, sortBy, pinned));
  sortNodes(roots, sortBy, pinned);

  const out: TreeRow[] = [];
  for (const root of roots) emitRows(root, 0, toggled, pinned, out);
  return out;
}

// Flat mode (active while filtering): every process is its own depth-0 leaf whose
// accum is just its own usage.
export function flatToTreeRows(procs: ProcessEntry[]): TreeRow[] {
  return procs.map((proc) => ({
    proc,
    depth: 0,
    hasChildren: false,
    expanded: false,
    pinned: false,
    cpuAccum: proc.cpu_percent,
    memAccum: proc.memory_mb,
  }));
}
