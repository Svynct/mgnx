import { describe, it, expect, beforeEach } from 'vitest';
import { useProcessStore, adjacentPid, hoistPinned, ProcessEntry } from '../../stores/processStore';

beforeEach(() => {
  useProcessStore.setState({ processes: [], filter: '', sortBy: 'cpu', pinned: [], expanded: [] });
});

function proc(pid: number): ProcessEntry {
  return { pid, ppid: 0, name: `p${pid}`, cpu_percent: 0, memory_mb: 0, status: 'R', user: 'u', threads: 1 };
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

describe('togglePin', () => {
  it('adds a pid then removes it', () => {
    useProcessStore.getState().togglePin(42);
    expect(useProcessStore.getState().pinned).toEqual([42]);
    useProcessStore.getState().togglePin(42);
    expect(useProcessStore.getState().pinned).toEqual([]);
  });
});

describe('toggleExpand', () => {
  it('starts collapsed (empty) and adds a pid', () => {
    expect(useProcessStore.getState().expanded).toEqual([]);
    useProcessStore.getState().toggleExpand(7);
    expect(useProcessStore.getState().expanded).toEqual([7]);
  });

  it('removes a pid on the second toggle', () => {
    useProcessStore.getState().toggleExpand(7);
    useProcessStore.getState().toggleExpand(7);
    expect(useProcessStore.getState().expanded).toEqual([]);
  });

  it('tracks multiple expanded pids independently', () => {
    useProcessStore.getState().toggleExpand(1);
    useProcessStore.getState().toggleExpand(2);
    expect(useProcessStore.getState().expanded).toEqual([1, 2]);
    useProcessStore.getState().toggleExpand(1);
    expect(useProcessStore.getState().expanded).toEqual([2]);
  });
});

describe('hoistPinned', () => {
  const rows = [proc(1), proc(2), proc(3)];

  it('floats pinned pids first in row order, unpinned after', () => {
    const result = hoistPinned(rows, [3, 1]);
    expect(result.map((p) => p.pid)).toEqual([1, 3, 2]);
  });

  it('returns the same order when nothing is pinned', () => {
    expect(hoistPinned(rows, []).map((p) => p.pid)).toEqual([1, 2, 3]);
  });

  it('ignores a pinned pid that is not present in rows', () => {
    expect(hoistPinned(rows, [99]).map((p) => p.pid)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input rows', () => {
    const input = [proc(1), proc(2)];
    const snapshot = input.map((p) => p.pid);
    hoistPinned(input, [2]);
    expect(input.map((p) => p.pid)).toEqual(snapshot);
  });
});
