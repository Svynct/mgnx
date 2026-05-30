import { describe, it, expect, beforeEach } from 'vitest';
import { useBatteryStore } from '../../stores/batteryStore';

beforeEach(() => {
  useBatteryStore.setState({ battery: null });
});

describe('batteryStore', () => {
  it('defaults to null', () => {
    expect(useBatteryStore.getState().battery).toBeNull();
  });

  it('stores a BatteryInfo via setBattery', () => {
    useBatteryStore.getState().setBattery({
      percentage: 78, status: 'Discharging', time_remaining_secs: 7200,
    });
    const b = useBatteryStore.getState().battery;
    expect(b?.percentage).toBe(78);
    expect(b?.status).toBe('Discharging');
    expect(b?.time_remaining_secs).toBe(7200);
  });

  it('clears battery when set to null (battery removed mid-session)', () => {
    useBatteryStore.getState().setBattery({
      percentage: 50, status: 'Charging', time_remaining_secs: null,
    });
    useBatteryStore.getState().setBattery(null);
    expect(useBatteryStore.getState().battery).toBeNull();
  });
});
