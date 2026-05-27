import { ProcessEntry } from '../stores/processStore';

type SortKey = 'cpu' | 'mem' | 'name';

export interface TreeRow {
  proc: ProcessEntry;
  depth: number; // 0 = root
  hasChildren: boolean;
  expanded: boolean;
  cpuAccum: number; // self + all descendants cpu_percent
  memAccum: number; // self + all descendants memory_mb
}

// Internal node carrying the post-order accumulated totals and resolved children.
interface TreeNode {
  proc: ProcessEntry;
  children: TreeNode[];
  cpuAccum: number;
  memAccum: number;
}

// Orders siblings (roots or a node's children) per the active sort key. Collapsed
// parents are compared by their accumulated totals so the heaviest subtree leads.
function sortNodes(nodes: TreeNode[], sortBy: SortKey): void {
  if (sortBy === 'cpu') nodes.sort((a, b) => b.cpuAccum - a.cpuAccum);
  else if (sortBy === 'mem') nodes.sort((a, b) => b.memAccum - a.memAccum);
  else nodes.sort((a, b) => a.proc.name.localeCompare(b.proc.name));
}

// Builds the node for `pid`, recursing into children. `seen` breaks cycles: a pid
// already on the current ancestor path is not re-descended. Accumulates self + kids.
function buildNode(
  pid: number,
  byPid: Map<number, ProcessEntry>,
  childPids: Map<number, number[]>,
  seen: Set<number>,
  sortBy: SortKey,
): TreeNode {
  const proc = byPid.get(pid)!;
  const node: TreeNode = { proc, children: [], cpuAccum: proc.cpu_percent, memAccum: proc.memory_mb };
  seen.add(pid);
  for (const childPid of childPids.get(pid) ?? []) {
    if (seen.has(childPid)) continue; // cycle guard
    const child = buildNode(childPid, byPid, childPids, seen, sortBy);
    node.children.push(child);
    node.cpuAccum += child.cpuAccum;
    node.memAccum += child.memAccum;
  }
  sortNodes(node.children, sortBy);
  return node;
}

// A process is a root when its ppid is 0 or points at a pid not in this snapshot.
function isRoot(proc: ProcessEntry, byPid: Map<number, ProcessEntry>): boolean {
  return proc.ppid === 0 || !byPid.has(proc.ppid);
}

// Pre-order DFS: emit a row for `node`, then recurse into its children only when
// the node is expanded. Roots are always emitted by the caller.
function emitRows(
  node: TreeNode,
  depth: number,
  expanded: Set<number>,
  out: TreeRow[],
): void {
  const isExpanded = expanded.has(node.proc.pid);
  out.push({
    proc: node.proc,
    depth,
    hasChildren: node.children.length > 0,
    expanded: isExpanded,
    cpuAccum: node.cpuAccum,
    memAccum: node.memAccum,
  });
  if (!isExpanded) return;
  for (const child of node.children) emitRows(child, depth + 1, expanded, out);
}

// Builds the visible (post-collapse) tree rows from a flat process snapshot.
// Roots and each node's children are sorted by `sortBy`; collapsed-with-children
// rows carry accumulated totals, everything else carries its own values.
export function buildVisibleTree(
  processes: ProcessEntry[],
  expanded: Set<number>,
  sortBy: SortKey,
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
    .map((p) => buildNode(p.pid, byPid, childPids, seen, sortBy));
  sortNodes(roots, sortBy);

  const out: TreeRow[] = [];
  for (const root of roots) emitRows(root, 0, expanded, out);
  return out;
}

// Floats whole subtrees (root + its deeper rows) to the top when any row in the
// segment is pinned, preserving segment order. Pure: never mutates the input.
export function hoistPinnedTree(rows: TreeRow[], pinned: number[]): TreeRow[] {
  if (pinned.length === 0) return rows;
  const pinnedSet = new Set(pinned);
  const segments: TreeRow[][] = [];
  for (const row of rows) {
    if (row.depth === 0 || segments.length === 0) segments.push([row]);
    else segments[segments.length - 1].push(row);
  }
  const top: TreeRow[][] = [];
  const rest: TreeRow[][] = [];
  for (const seg of segments) {
    (seg.some((r) => pinnedSet.has(r.proc.pid)) ? top : rest).push(seg);
  }
  return [...top, ...rest].flat();
}

// Flat mode (active while filtering): every process is its own depth-0 leaf with
// no children and its own values — no tree structure is imposed on a filtered set.
export function flatToTreeRows(procs: ProcessEntry[]): TreeRow[] {
  return procs.map((proc) => ({
    proc,
    depth: 0,
    hasChildren: false,
    expanded: false,
    cpuAccum: proc.cpu_percent,
    memAccum: proc.memory_mb,
  }));
}
