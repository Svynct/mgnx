import { describe, it, expect, beforeEach } from 'vitest';
import { useProcessStore, adjacentPid, ProcessEntry } from '../../stores/processStore';

beforeEach(() => {
  useProcessStore.setState({ processes: [], filter: '', sortBy: 'cpu', pinnedPid: null, toggled: [] });
});

function proc(pid: number, ppid = 0): ProcessEntry {
  return { pid, ppid, name: `p${pid}`, cpu_percent: 0, memory_mb: 0, status: 'R', user: 'u', threads: 1 };
}

describe('processStore', () => {
  it('stores process list', () => {
    const proc = { pid: 1, ppid: 0, name: 'init', cpu_percent: 0.1, memory_mb: 10, status: 'Running', user: 'root', threads: 1 };
    useProcessStore.getState().setProcesses([proc]);
    expect(useProcessStore.getState().processes).toHaveLength(1);
    expect(useProcessStore.getState().processes[0].pid).toBe(1);
  });

  it('filters by name', () => {
    useProcessStore.getState().setProcesses([
      { pid: 1, ppid: 0, name: 'init', cpu_percent: 0, memory_mb: 0, status: 'Running', user: 'root', threads: 1 },
      { pid: 2, ppid: 0, name: 'chrome', cpu_percent: 0, memory_mb: 0, status: 'Running', user: 'user', threads: 1 },
    ]);
    useProcessStore.getState().setFilter('chrome');
    const filtered = useProcessStore.getState().filtered();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('chrome');
  });

  it('sorts by memory', () => {
    useProcessStore.getState().setProcesses([
      { pid: 1, ppid: 0, name: 'a', cpu_percent: 0, memory_mb: 100, status: 'Running', user: 'u', threads: 1 },
      { pid: 2, ppid: 0, name: 'b', cpu_percent: 0, memory_mb: 50,  status: 'Running', user: 'u', threads: 1 },
    ]);
    useProcessStore.getState().setSortBy('mem');
    const sorted = useProcessStore.getState().filtered();
    expect(sorted[0].pid).toBe(1);
  });
});

describe('adjacentPid', () => {
  const rows: ProcessEntry[] = [1, 2, 3].map((pid) => ({
    pid, ppid: 0, name: `p${pid}`, cpu_percent: 0, memory_mb: 0, status: 'R', user: 'u', threads: 1,
  }));

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
    expect(useProcessStore.getState().toggled).toEqual([2]);
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
    expect(useProcessStore.getState().toggled).toEqual([]);
    useProcessStore.getState().toggleFold(7);
    expect(useProcessStore.getState().toggled).toEqual([7]);
  });

  it('clears a pid on the second toggle', () => {
    useProcessStore.getState().toggleFold(7);
    useProcessStore.getState().toggleFold(7);
    expect(useProcessStore.getState().toggled).toEqual([]);
  });

  it('tracks multiple toggled pids independently', () => {
    useProcessStore.getState().toggleFold(1);
    useProcessStore.getState().toggleFold(2);
    expect(useProcessStore.getState().toggled).toEqual([1, 2]);
    useProcessStore.getState().toggleFold(1);
    expect(useProcessStore.getState().toggled).toEqual([2]);
  });
});

