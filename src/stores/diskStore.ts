import { create } from 'zustand';

export interface DiskEntry {
  mount: string; device: string; fs_type: string;
  used_bytes: number; total_bytes: number;
  read_bytes_per_sec: number; write_bytes_per_sec: number;
  inodes_used: number; inodes_total: number;
}

interface DiskStore {
  disks: DiskEntry[];
  setDisks: (disks: DiskEntry[]) => void;
}

export const useDiskStore = create<DiskStore>((set) => ({
  disks: [],
  setDisks: (disks) => set({ disks }),
}));
