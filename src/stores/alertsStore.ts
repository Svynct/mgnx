import { create } from 'zustand';

export type AlertKind = 'Cpu' | 'Memory' | 'Disk' | 'CpuTemp';

export interface FiredAlert {
  id: number;
  kind: AlertKind;
  value: number;
  threshold: number;
  message: string;
}

interface AlertsStore {
  alerts: FiredAlert[];
  push: (a: Omit<FiredAlert, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useAlertsStore = create<AlertsStore>((set) => ({
  alerts: [],
  push: (a) => set((s) => ({ alerts: [...s.alerts, { ...a, id: nextId++ }] })),
  dismiss: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
}));
