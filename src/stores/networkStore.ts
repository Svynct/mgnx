import { create } from 'zustand';

export interface NetworkConnection {
  proto: string; local_port: number; remote_addr: string; state: string;
}

export interface NetworkInterface {
  name: string; is_up: boolean; ip: string; link_speed_mbps: number;
  rx_bytes_per_sec: number; tx_bytes_per_sec: number;
  rx_total_mb: number; tx_total_mb: number;
  connections: NetworkConnection[];
}

interface NetworkStore {
  interfaces: NetworkInterface[];
  setInterfaces: (ifaces: NetworkInterface[]) => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  interfaces: [],
  setInterfaces: (interfaces) => set({ interfaces }),
}));
