import { describe, it, expect } from 'vitest';
import { useResourceStore } from '../../stores/resourceStore';

describe('resourceStore', () => {
  it('maintains 60-point CPU history ring buffer', () => {
    for (let i = 0; i < 65; i++) {
      useResourceStore.getState().push({
        cpu_model: 'Test CPU', core_count: 4,
        cores: [{ index: 0, usage: i, frequency_mhz: 1800 }],
        ram_used_mb: 0, ram_total_mb: 16384,
        swap_used_mb: 0, swap_total_mb: 4096,
      });
    }
    expect(useResourceStore.getState().cpuHistory).toHaveLength(60);
  });

  it('stores per-core frequency when present and null when unreadable', () => {
    useResourceStore.getState().push({
      cpu_model: 'X', core_count: 2,
      cores: [
        { index: 0, usage: 10, frequency_mhz: 2400 },
        { index: 1, usage: 20, frequency_mhz: null },
      ],
      ram_used_mb: 0, ram_total_mb: 16384,
      swap_used_mb: 0, swap_total_mb: 4096,
    });
    const stored = useResourceStore.getState().cores;
    expect(stored[0].frequency_mhz).toBe(2400);
    expect(stored[1].frequency_mhz).toBeNull();
  });
});
