import { describe, it, expect, beforeEach } from 'vitest';
import { useDiskStore, DiskEntry } from '../../stores/diskStore';

const disk: DiskEntry = {
  mount: '/', device: '/dev/sda1', fs_type: 'ext4',
  used_bytes: 100, total_bytes: 200,
  read_bytes_per_sec: 10, write_bytes_per_sec: 5,
  inodes_used: 1, inodes_total: 2,
};

describe('diskStore', () => {
  beforeEach(() => {
    useDiskStore.setState({ disks: [], diskHistory: {} });
  });

  it('starts empty and stores disks', () => {
    expect(useDiskStore.getState().disks).toEqual([]);
    useDiskStore.getState().setDisks([disk]);
    expect(useDiskStore.getState().disks).toHaveLength(1);
    expect(useDiskStore.getState().disks[0].mount).toBe('/');
  });
});

function makeDisk(mount: string, read: number, write: number): DiskEntry {
  return {
    mount, device: '/dev/sda', fs_type: 'ext4',
    used_bytes: 0, total_bytes: 1,
    read_bytes_per_sec: read, write_bytes_per_sec: write,
    inodes_used: 0, inodes_total: 0,
  };
}

describe('diskStore diskHistory', () => {
  beforeEach(() => {
    useDiskStore.setState({ disks: [], diskHistory: {} });
  });

  it('starts with empty history', () => {
    expect(useDiskStore.getState().diskHistory).toEqual({});
  });

  it('accumulates read and write per mount', () => {
    useDiskStore.getState().setDisks([makeDisk('/', 1024, 512)]);
    useDiskStore.getState().setDisks([makeDisk('/', 2048, 256)]);
    const h = useDiskStore.getState().diskHistory['/'];
    expect(h.read).toEqual([1024, 2048]);
    expect(h.write).toEqual([512, 256]);
  });

  it('tracks multiple mounts independently', () => {
    useDiskStore.getState().setDisks([
      makeDisk('/', 100, 50),
      makeDisk('/home', 200, 100),
    ]);
    expect(useDiskStore.getState().diskHistory['/'].read).toEqual([100]);
    expect(useDiskStore.getState().diskHistory['/home'].read).toEqual([200]);
  });

  it('caps history at 60 entries', () => {
    for (let i = 0; i < 65; i++) {
      useDiskStore.getState().setDisks([makeDisk('/', i, i)]);
    }
    const h = useDiskStore.getState().diskHistory['/'];
    expect(h.read).toHaveLength(60);
    expect(h.read[0]).toBe(5);
    expect(h.write).toHaveLength(60);
    expect(h.write[0]).toBe(5);
  });
});
