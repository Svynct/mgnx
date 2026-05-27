import { describe, it, expect, beforeEach } from 'vitest';
import { useProcessStore } from '../../stores/processStore';

beforeEach(() => {
  useProcessStore.setState({ processes: [], filter: '', sortBy: 'cpu' });
});

describe('processStore', () => {
  it('stores process list', () => {
    const proc = { pid: 1, name: 'init', cpu_percent: 0.1, memory_mb: 10, status: 'Running', user: 'root', threads: 1 };
    useProcessStore.getState().setProcesses([proc]);
    expect(useProcessStore.getState().processes).toHaveLength(1);
    expect(useProcessStore.getState().processes[0].pid).toBe(1);
  });

  it('filters by name', () => {
    useProcessStore.getState().setProcesses([
      { pid: 1, name: 'init', cpu_percent: 0, memory_mb: 0, status: 'Running', user: 'root', threads: 1 },
      { pid: 2, name: 'chrome', cpu_percent: 0, memory_mb: 0, status: 'Running', user: 'user', threads: 1 },
    ]);
    useProcessStore.getState().setFilter('chrome');
    const filtered = useProcessStore.getState().filtered();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('chrome');
  });

  it('sorts by memory', () => {
    useProcessStore.getState().setProcesses([
      { pid: 1, name: 'a', cpu_percent: 0, memory_mb: 100, status: 'Running', user: 'u', threads: 1 },
      { pid: 2, name: 'b', cpu_percent: 0, memory_mb: 50,  status: 'Running', user: 'u', threads: 1 },
    ]);
    useProcessStore.getState().setSortBy('mem');
    const sorted = useProcessStore.getState().filtered();
    expect(sorted[0].pid).toBe(1);
  });
});
