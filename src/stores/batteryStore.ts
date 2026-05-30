import { create } from 'zustand';

export interface BatteryInfo {
  percentage: number;
  status: string;
  time_remaining_secs: number | null;
}

interface BatteryStore {
  battery: BatteryInfo | null;
  setBattery: (b: BatteryInfo | null) => void;
}

export const useBatteryStore = create<BatteryStore>((set) => ({
  battery: null,
  setBattery: (battery) => set({ battery }),
}));
