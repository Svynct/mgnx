import { describe, it, expect } from 'vitest';
import { useThermalStore, ThermalPayload } from '../../stores/thermalStore';

describe('thermalStore', () => {
  it('starts with null cpu temp and empty drives', () => {
    expect(useThermalStore.getState().cpu_temp_c).toBeNull();
    expect(useThermalStore.getState().drives).toEqual([]);
  });

  it('setThermal updates all fields', () => {
    const payload: ThermalPayload = {
      cpu_temp_c: 65.0,
      drives: [{ name: 'Samsung SSD 980 PRO', temp_c: 38.0 }],
    };
    useThermalStore.getState().setThermal(payload);
    const state = useThermalStore.getState();
    expect(state.cpu_temp_c).toBe(65.0);
    expect(state.drives).toHaveLength(1);
    expect(state.drives[0].name).toBe('Samsung SSD 980 PRO');
  });
});
