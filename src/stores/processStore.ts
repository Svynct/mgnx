import { create } from 'zustand';
import { ancestorChain } from '../lib/processTree';

export interface ProcessEntry {
  pid: number;
  ppid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  status: string;
  user: string;
  threads: number;
}

type SortKey = 'cpu' | 'mem' | 'name';

export function filterProcesses(
  processes: ProcessEntry[],
  filter: string,
  sortBy: SortKey,
): ProcessEntry[] {
  const result = filter
    ? processes.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : [...processes];
  if (sortBy === 'cpu') result.sort((a, b) => b.cpu_percent - a.cpu_percent);
  else if (sortBy === 'mem') result.sort((a, b) => b.memory_mb - a.memory_mb);
  else result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// Returns the pid one step (dir=+1 down, -1 up) from `current` in the given order.
// Tracks by pid (not index) so selection follows a process across re-sorts.
export function adjacentPid(
  rows: ProcessEntry[],
  current: number | null,
  dir: 1 | -1,
): number | null {
  if (rows.length === 0) return null;
  if (current === null) return rows[0].pid;
  const idx = rows.findIndex((p) => p.pid === current);
  if (idx === -1) return rows[0].pid;
  const next = Math.min(rows.length - 1, Math.max(0, idx + dir));
  return rows[next].pid;
}

interface ProcessStore {
  processes: ProcessEntry[];
  filter: string;
  sortBy: SortKey;
  selectedPid: number | null;
  // The single pinned process. Its whole ancestor chain is treated as pinned and
  // floats to the top of each level. null = nothing pinned. Only one pin at a time.
  pinnedPid: number | null;
  // PIDs whose fold state is flipped from the depth default (roots open one level,
  // deeper folded). Empty = pure default. See AUTO_EXPAND_DEPTH in processTree.
  toggled: Set<number>;
  setProcesses: (ps: ProcessEntry[]) => void;
  setFilter: (f: string) => void;
  setSortBy: (s: SortKey) => void;
  setSelectedPid: (pid: number | null) => void;
  togglePin: (pid: number) => void;
  toggleFold: (pid: number) => void;
}

export const useProcessStore = create<ProcessStore>((set) => ({
  processes: [],
  filter: '',
  sortBy: 'cpu',
  selectedPid: null,
  pinnedPid: null,
  toggled: new Set<number>(),
  setProcesses: (processes) => set({ processes }),
  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSelectedPid: (selectedPid) => set({ selectedPid }),
  // Single pin: clicking any node in the current pinned chain unpins it; clicking
  // outside switches the pin to that node and opens its mid-chain ancestors (depth
  // ≥ 1 are folded by default) so the whole chain is visible at the top of its
  // levels. The root stays at its default-open state.
  togglePin: (pid) => set((s) => {
    const current = s.pinnedPid !== null ? new Set(ancestorChain(s.processes, s.pinnedPid)) : new Set<number>();
    if (current.has(pid)) return { pinnedPid: null };
    const chain = ancestorChain(s.processes, pid); // [pid, …mid…, root]
    const toggled = new Set(s.toggled);
    for (const mid of chain.slice(1, -1)) toggled.add(mid); // open depth-≥1 ancestors
    if (chain.length > 0) toggled.delete(chain[chain.length - 1]); // keep root default-open
    return { pinnedPid: pid, toggled };
  }),
  toggleFold: (pid) => set((s) => {
    const next = new Set(s.toggled);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return { toggled: next };
  }),
}));
