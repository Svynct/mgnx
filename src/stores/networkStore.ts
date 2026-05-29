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

export interface IfaceHistory { rx: number[]; tx: number[]; }

const HISTORY_LEN = 60;

interface NetworkStore {
  interfaces: NetworkInterface[];
  connections: NetworkConnection[];
  ifaceHistory: Record<string, IfaceHistory>;
  setInterfaces: (ifaces: NetworkInterface[]) => void;
  setConnections: (conns: NetworkConnection[]) => void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  interfaces: [],
  connections: [],
  ifaceHistory: {},
  setInterfaces: (ifaces) => set((s) => {
    const ifaceHistory = { ...s.ifaceHistory };
    for (const iface of ifaces) {
      const prev = ifaceHistory[iface.name] ?? { rx: [], tx: [] };
      ifaceHistory[iface.name] = {
        rx: [...prev.rx, iface.rx_bytes_per_sec].slice(-HISTORY_LEN),
        tx: [...prev.tx, iface.tx_bytes_per_sec].slice(-HISTORY_LEN),
      };
    }
    return { interfaces: ifaces, ifaceHistory };
  }),
  setConnections: (connections) => set({ connections }),
}));
