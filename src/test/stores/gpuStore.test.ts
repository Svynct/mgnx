import { describe, it, expect } from 'vitest';
import { useGpuStore, GpuPayload } from '../../stores/gpuStore';

const payload: GpuPayload = {
  vendor: 'NVIDIA', name: 'RTX 4090', driver_version: '595.71', compute_version: '8.9',
  usage_percent: 42, vram_used_mb: 2048, vram_total_mb: 24576,
  temperature_c: 55, power_draw_w: 120, power_limit_w: 450,
  core_clock_mhz: 2500, mem_clock_mhz: 10500, processes: [],
};

describe('gpuStore', () => {
  it('starts with gpu hidden', () => {
    expect(useGpuStore.getState().available).toBe(false);
  });

  it('marks GPU available', () => {
    useGpuStore.getState().setAvailable(true);
    expect(useGpuStore.getState().available).toBe(true);
  });

  it('merges payload fields into state', () => {
    useGpuStore.getState().setPayload(payload);
    const s = useGpuStore.getState();
    expect(s.vendor).toBe('NVIDIA');
    expect(s.usage_percent).toBe(42);
    expect(s.vram_total_mb).toBe(24576);
  });
});
