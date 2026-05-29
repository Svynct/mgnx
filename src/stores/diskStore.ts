import { create } from 'zustand';

export interface DiskEntry {
  mount: string; device: string; fs_type: string;
  used_bytes: number; total_bytes: number;
  read_bytes_per_sec: number; write_bytes_per_sec: number;
  inodes_used: number; inodes_total: number;
}

export interface DiskHistory { read: number[]; write: number[]; }

const HISTORY_LEN = 60;

interface DiskStore {
  disks: DiskEntry[];
  diskHistory: Record<string, DiskHistory>;
  setDisks: (disks: DiskEntry[]) => void;
}

export const useDiskStore = create<DiskStore>((set) => ({
  disks: [],
  diskHistory: {},
  setDisks: (disks) => set((s) => {
    const diskHistory = { ...s.diskHistory };
    for (const disk of disks) {
      const prev = diskHistory[disk.mount] ?? { read: [], write: [] };
      diskHistory[disk.mount] = {
        read: [...prev.read, disk.read_bytes_per_sec].slice(-HISTORY_LEN),
        write: [...prev.write, disk.write_bytes_per_sec].slice(-HISTORY_LEN),
      };
    }
    return { disks, diskHistory };
  }),
}));
