import { create } from 'zustand';

export interface GpuProcess { pid: number; name: string; vram_mb: number; proc_type: string; }

export interface GpuPayload {
  vendor: string; name: string; driver_version: string; compute_version: string;
  usage_percent: number; vram_used_mb: number; vram_total_mb: number;
  temperature_c: number; power_draw_w: number; power_limit_w: number;
  core_clock_mhz: number; mem_clock_mhz: number; processes: GpuProcess[];
}

interface GpuStore extends Partial<GpuPayload> {
  available: boolean;
  setAvailable: (v: boolean) => void;
  setPayload: (p: GpuPayload) => void;
}

export const useGpuStore = create<GpuStore>((set) => ({
  available: false,
  setAvailable: (available) => set({ available }),
  setPayload: (payload) => set({ ...payload }),
}));
