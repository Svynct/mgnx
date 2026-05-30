import { describe, it, expect, beforeEach } from 'vitest';
import { useProcessStore, adjacentPid, filterProcesses, ProcessEntry } from '../../stores/processStore';

beforeEach(() => {
  useProcessStore.setState({ processes: [], filter: '', sortBy: 'cpu', pinnedPid: null, toggled: new Set() });
});

function proc(pid: number, ppid = 0, overrides: Partial<ProcessEntry> = {}): ProcessEntry {
  return {
    pid, ppid, name: `p${pid}`, cpu_percent: 0, memory_mb: 0, status: 'R', user: 'u', threads: 1,
    disk_read_bytes_per_sec: null, disk_write_bytes_per_sec: null,
    disk_read_total_mb: null, disk_write_total_mb: null,
    ...overrides,
  };
}

describe('processStore', () => {
  it('stores process list', () => {
    useProcessStore.getState().setProcesses([proc(1, 0, { name: 'init', cpu_percent: 0.1, memory_mb: 10, user: 'root' })]);
    expect(useProcessStore.getState().processes).toHaveLength(1);
    expect(useProcessStore.getState().processes[0].pid).toBe(1);
  });

  it('filters by name', () => {
    useProcessStore.getState().setProcesses([
      proc(1, 0, { name: 'init', user: 'root' }),
      proc(2, 0, { name: 'chrome', user: 'user' }),
    ]);
    useProcessStore.getState().setFilter('chrome');
    const s = useProcessStore.getState();
    const filtered = filterProcesses(s.processes, s.filter, s.sortBy);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('chrome');
  });

  it('sorts by memory', () => {
    useProcessStore.getState().setProcesses([
      proc(1, 0, { name: 'a', memory_mb: 100 }),
      proc(2, 0, { name: 'b', memory_mb: 50 }),
    ]);
    useProcessStore.getState().setSortBy('mem');
    const s = useProcessStore.getState();
    const sorted = filterProcesses(s.processes, s.filter, s.sortBy);
    expect(sorted[0].pid).toBe(1);
  });

  it('sorts by disk_read desc, treating null as -Infinity', () => {
    useProcessStore.getState().setProcesses([
      proc(1, 0, { disk_read_bytes_per_sec: 100 }),
      proc(2, 0),
      proc(3, 0, { disk_read_bytes_per_sec: 500 }),
    ]);
    useProcessStore.getState().setSortBy('disk_read');
    const s = useProcessStore.getState();
    const sorted = filterProcesses(s.processes, s.filter, s.sortBy);
    expect(sorted.map((p) => p.pid)).toEqual([3, 1, 2]);
  });

  it('sorts by disk_write desc, null last', () => {
    useProcessStore.getState().setProcesses([
      proc(1, 0),
      proc(2, 0, { disk_write_bytes_per_sec: 2048 }),
    ]);
    useProcessStore.getState().setSortBy('disk_write');
    const s = useProcessStore.getState();
    const sorted = filterProcesses(s.processes, s.filter, s.sortBy);
    expect(sorted.map((p) => p.pid)).toEqual([2, 1]);
  });
});

describe('adjacentPid', () => {
  const rows: ProcessEntry[] = [1, 2, 3].map((pid) => proc(pid));

  it('returns first pid when nothing selected', () => {
    expect(adjacentPid(rows, null, 1)).toBe(1);
    expect(adjacentPid(rows, null, -1)).toBe(1);
  });

  it('moves down and up by one', () => {
    expect(adjacentPid(rows, 1, 1)).toBe(2);
    expect(adjacentPid(rows, 2, -1)).toBe(1);
  });

  it('clamps at the ends', () => {
    expect(adjacentPid(rows, 3, 1)).toBe(3);
    expect(adjacentPid(rows, 1, -1)).toBe(1);
  });

  it('falls back to first when the current pid is gone', () => {
    expect(adjacentPid(rows, 999, 1)).toBe(1);
  });

  it('returns null for an empty list', () => {
    expect(adjacentPid([], 5, 1)).toBe(null);
  });
});

describe('togglePin (single pin + ancestor chain)', () => {
  // 1 -> 2 -> 3 chain, plus an unrelated root 4.
  const tree = [proc(1, 0), proc(2, 1), proc(3, 2), proc(4, 0)];

  it('pins a process and toggling it again unpins', () => {
    useProcessStore.getState().setProcesses(tree);
    useProcessStore.getState().togglePin(1);
    expect(useProcessStore.getState().pinnedPid).toBe(1);
    useProcessStore.getState().togglePin(1);
    expect(useProcessStore.getState().pinnedPid).toBeNull();
  });

  it('pinning a child opens its mid-chain ancestors so the chain is visible', () => {
    useProcessStore.getState().setProcesses(tree); // 1 -> 2 -> 3
    useProcessStore.getState().togglePin(3);
    expect(useProcessStore.getState().pinnedPid).toBe(3);
    // Mid ancestor 2 (depth 1, folded by default) is opened; root 1 stays default.
    expect(useProcessStore.getState().toggled).toEqual(new Set([2]));
  });

  it('allows only one pin: pinning an unrelated process replaces the current pin', () => {
    useProcessStore.getState().setProcesses(tree);
    useProcessStore.getState().togglePin(1);
    useProcessStore.getState().togglePin(4);
    expect(useProcessStore.getState().pinnedPid).toBe(4);
  });

  it('unpins when toggling any node in the current pinned chain', () => {
    useProcessStore.getState().setProcesses(tree);
    useProcessStore.getState().togglePin(3); // chain = {3,2,1}
    useProcessStore.getState().togglePin(1); // 1 is in the chain -> unpin
    expect(useProcessStore.getState().pinnedPid).toBeNull();
  });
});

describe('toggleFold', () => {
  it('starts empty (pure depth default) and flips a pid', () => {
    expect(useProcessStore.getState().toggled).toEqual(new Set());
    useProcessStore.getState().toggleFold(7);
    expect(useProcessStore.getState().toggled).toEqual(new Set([7]));
  });

  it('clears a pid on the second toggle', () => {
    useProcessStore.getState().toggleFold(7);
    useProcessStore.getState().toggleFold(7);
    expect(useProcessStore.getState().toggled).toEqual(new Set());
  });

  it('tracks multiple toggled pids independently', () => {
    useProcessStore.getState().toggleFold(1);
    useProcessStore.getState().toggleFold(2);
    expect(useProcessStore.getState().toggled).toEqual(new Set([1, 2]));
    useProcessStore.getState().toggleFold(1);
    expect(useProcessStore.getState().toggled).toEqual(new Set([2]));
  });
});

