import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore } from '../../stores/configStore';

beforeEach(() => {
  useConfigStore.setState({
    config: { refresh_rate_hz: 1.0, default_sort: 'cpu', temperature_unit: 'C' },
    loaded: false,
  });
});

describe('configStore', () => {
  it('defaults to 1Hz / cpu / C and unloaded', () => {
    const s = useConfigStore.getState();
    expect(s.config.refresh_rate_hz).toBe(1.0);
    expect(s.config.default_sort).toBe('cpu');
    expect(s.config.temperature_unit).toBe('C');
    expect(s.loaded).toBe(false);
  });

  it('setConfig stores values and flips loaded to true', () => {
    useConfigStore.getState().setConfig({
      refresh_rate_hz: 2.0,
      default_sort: 'mem',
      temperature_unit: 'F',
    });
    const s = useConfigStore.getState();
    expect(s.config.refresh_rate_hz).toBe(2.0);
    expect(s.config.default_sort).toBe('mem');
    expect(s.config.temperature_unit).toBe('F');
    expect(s.loaded).toBe(true);
  });
});
