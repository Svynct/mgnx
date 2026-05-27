import { describe, it, expect } from 'vitest';
import { useDiskStore, DiskEntry } from '../../stores/diskStore';

const disk: DiskEntry = {
  mount: '/', device: '/dev/sda1', fs_type: 'ext4',
  used_bytes: 100, total_bytes: 200,
  read_bytes_per_sec: 10, write_bytes_per_sec: 5,
  inodes_used: 1, inodes_total: 2,
};

describe('diskStore', () => {
  it('starts empty and stores disks', () => {
    expect(useDiskStore.getState().disks).toEqual([]);
    useDiskStore.getState().setDisks([disk]);
    expect(useDiskStore.getState().disks).toHaveLength(1);
    expect(useDiskStore.getState().disks[0].mount).toBe('/');
  });
});
