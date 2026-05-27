import { create } from 'zustand';

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

// Floats pinned rows to the top, preserving their relative order within `rows`,
// then the unpinned rows. Tracks by pid so pins survive the 1s poll replace.
// Pure: never mutates the input array.
export function hoistPinned(rows: ProcessEntry[], pinned: number[]): ProcessEntry[] {
  if (pinned.length === 0) return rows;
  const pinnedSet = new Set(pinned);
  const top: ProcessEntry[] = [];
  const rest: ProcessEntry[] = [];
  for (const p of rows) (pinnedSet.has(p.pid) ? top : rest).push(p);
  return [...top, ...rest];
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
  pinned: number[];
  // PIDs whose tree children are revealed. Empty = everything collapsed (default).
  expanded: number[];
  setProcesses: (ps: ProcessEntry[]) => void;
  setFilter: (f: string) => void;
  setSortBy: (s: SortKey) => void;
  setSelectedPid: (pid: number | null) => void;
  togglePin: (pid: number) => void;
  toggleExpand: (pid: number) => void;
  filtered: () => ProcessEntry[];
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: [],
  filter: '',
  sortBy: 'cpu',
  selectedPid: null,
  pinned: [],
  expanded: [],
  setProcesses: (processes) => set({ processes }),
  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSelectedPid: (selectedPid) => set({ selectedPid }),
  togglePin: (pid) => set((s) => ({
    pinned: s.pinned.includes(pid) ? s.pinned.filter((p) => p !== pid) : [...s.pinned, pid],
  })),
  toggleExpand: (pid) => set((s) => ({
    expanded: s.expanded.includes(pid) ? s.expanded.filter((p) => p !== pid) : [...s.expanded, pid],
  })),
  filtered: () => {
    const { processes, filter, sortBy } = get();
    return filterProcesses(processes, filter, sortBy);
  },
}));
