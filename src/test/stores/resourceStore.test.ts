import { describe, it, expect } from 'vitest';
import { useResourceStore } from '../../stores/resourceStore';

describe('resourceStore', () => {
  it('maintains 60-point CPU history ring buffer', () => {
    for (let i = 0; i < 65; i++) {
      useResourceStore.getState().push({
        cpu_model: 'Test CPU', core_count: 4,
        cores: [{ index: 0, usage: i }],
        ram_used_mb: 0, ram_total_mb: 16384,
        swap_used_mb: 0, swap_total_mb: 4096,
      });
    }
    expect(useResourceStore.getState().cpuHistory).toHaveLength(60);
  });
});
