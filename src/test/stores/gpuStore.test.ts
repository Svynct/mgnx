import { describe, it, expect } from 'vitest';
import { useGpuStore } from '../../stores/gpuStore';

describe('gpuStore', () => {
  it('starts with gpu hidden', () => {
    expect(useGpuStore.getState().available).toBe(false);
  });

  it('marks GPU available', () => {
    useGpuStore.getState().setAvailable(true);
    expect(useGpuStore.getState().available).toBe(true);
  });
});
