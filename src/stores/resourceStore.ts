import { create } from 'zustand';

export interface CpuCoreUsage { index: number; usage: number; }

export interface ResourcesPayload {
  cpu_model: string;
  core_count: number;
  cores: CpuCoreUsage[];
  ram_used_mb: number;
  ram_total_mb: number;
  swap_used_mb: number;
  swap_total_mb: number;
}

const HISTORY_LEN = 60;

interface ResourceStore extends ResourcesPayload {
  cpuHistory: number[];
  ramHistory: number[];
  push: (payload: ResourcesPayload) => void;
}

const defaults: ResourcesPayload = {
  cpu_model: '', core_count: 0, cores: [],
  ram_used_mb: 0, ram_total_mb: 0, swap_used_mb: 0, swap_total_mb: 0,
};

export const useResourceStore = create<ResourceStore>((set) => ({
  ...defaults,
  cpuHistory: [],
  ramHistory: [],
  push: (payload) => {
    const avgCpu = payload.cores.length
      ? payload.cores.reduce((s, c) => s + c.usage, 0) / payload.cores.length
      : 0;
    const ramPct = payload.ram_total_mb > 0
      ? (payload.ram_used_mb / payload.ram_total_mb) * 100
      : 0;
    set((s) => ({
      ...payload,
      cpuHistory: [...s.cpuHistory, avgCpu].slice(-HISTORY_LEN),
      ramHistory: [...s.ramHistory, ramPct].slice(-HISTORY_LEN),
    }));
  },
}));
