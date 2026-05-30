import { create } from 'zustand';

export type SortDefault = 'cpu' | 'mem' | 'name';
export type TempUnit = 'C' | 'F';

export interface AppConfig {
  refresh_rate_hz: number;
  default_sort: SortDefault;
  temperature_unit: TempUnit;
}

interface ConfigStore {
  config: AppConfig;
  loaded: boolean;
  setConfig: (c: AppConfig) => void;
}

const defaults: AppConfig = {
  refresh_rate_hz: 1.0,
  default_sort: 'cpu',
  temperature_unit: 'C',
};

export const useConfigStore = create<ConfigStore>((set) => ({
  config: defaults,
  loaded: false,
  setConfig: (config) => set({ config, loaded: true }),
}));
