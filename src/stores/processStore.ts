import { create } from 'zustand';

export interface ProcessEntry {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  status: string;
  user: string;
  threads: number;
}

interface ProcessStore {
  processes: ProcessEntry[];
  filter: string;
  sortBy: 'cpu' | 'mem' | 'name';
  selectedPid: number | null;
  setProcesses: (ps: ProcessEntry[]) => void;
  setFilter: (f: string) => void;
  setSortBy: (s: 'cpu' | 'mem' | 'name') => void;
  setSelectedPid: (pid: number | null) => void;
  filtered: () => ProcessEntry[];
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: [],
  filter: '',
  sortBy: 'cpu',
  selectedPid: null,
  setProcesses: (processes) => set({ processes }),
  setFilter: (filter) => set({ filter }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSelectedPid: (selectedPid) => set({ selectedPid }),
  filtered: () => {
    const { processes, filter, sortBy } = get();
    let result = filter
      ? processes.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
      : [...processes];
    if (sortBy === 'cpu') result.sort((a, b) => b.cpu_percent - a.cpu_percent);
    else if (sortBy === 'mem') result.sort((a, b) => b.memory_mb - a.memory_mb);
    else result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  },
}));
