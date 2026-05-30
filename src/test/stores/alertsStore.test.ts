import { describe, it, expect, beforeEach } from 'vitest';
import { useAlertsStore } from '../../stores/alertsStore';

beforeEach(() => {
  useAlertsStore.setState({ alerts: [] });
});

describe('alertsStore', () => {
  it('starts empty', () => {
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it('push appends an alert with auto-incrementing id', () => {
    useAlertsStore.getState().push({
      kind: 'Cpu', value: 92, threshold: 80, message: 'CPU > 80%',
    });
    useAlertsStore.getState().push({
      kind: 'Memory', value: 95, threshold: 90, message: 'Memory > 90%',
    });
    const alerts = useAlertsStore.getState().alerts;
    expect(alerts).toHaveLength(2);
    expect(alerts[0].kind).toBe('Cpu');
    expect(alerts[1].id).toBeGreaterThan(alerts[0].id);
  });

  it('dismiss removes only the matching id', () => {
    useAlertsStore.getState().push({
      kind: 'Cpu', value: 92, threshold: 80, message: 'a',
    });
    useAlertsStore.getState().push({
      kind: 'Memory', value: 95, threshold: 90, message: 'b',
    });
    const id1 = useAlertsStore.getState().alerts[0].id;
    useAlertsStore.getState().dismiss(id1);
    const remaining = useAlertsStore.getState().alerts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].kind).toBe('Memory');
  });
});
