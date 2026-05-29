import { create } from 'zustand';

export interface DriveTemp {
  name: string;
  temp_c: number | null;
}

export interface ThermalPayload {
  cpu_temp_c: number | null;
  drives: DriveTemp[];
}

interface ThermalStore extends ThermalPayload {
  setThermal: (p: ThermalPayload) => void;
}

export const useThermalStore = create<ThermalStore>((set) => ({
  cpu_temp_c: null,
  drives: [],
  setThermal: (p) => set(p),
}));
