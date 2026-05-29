import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore, NetworkInterface } from '../../stores/networkStore';

const iface: NetworkInterface = {
  name: 'wlan0', is_up: true, ip: '192.168.1.2', link_speed_mbps: 866,
  rx_bytes_per_sec: 100, tx_bytes_per_sec: 50,
  rx_total_mb: 10, tx_total_mb: 5,
  connections: [{ proto: 'tcp', local_port: 443, remote_addr: '1.2.3.4', state: 'ESTABLISHED' }],
};

describe('networkStore', () => {
  beforeEach(() => {
    useNetworkStore.setState({ interfaces: [], connections: [], ifaceHistory: {} });
  });

  it('starts empty and stores interfaces', () => {
    expect(useNetworkStore.getState().interfaces).toEqual([]);
    useNetworkStore.getState().setInterfaces([iface]);
    expect(useNetworkStore.getState().interfaces).toHaveLength(1);
    expect(useNetworkStore.getState().interfaces[0].name).toBe('wlan0');
    expect(useNetworkStore.getState().interfaces[0].connections).toHaveLength(1);
  });
});

function makeIface(name: string, rx: number, tx: number): NetworkInterface {
  return {
    name, is_up: true, ip: '', link_speed_mbps: 0,
    rx_bytes_per_sec: rx, tx_bytes_per_sec: tx,
    rx_total_mb: 0, tx_total_mb: 0, connections: [],
  };
}

describe('networkStore ifaceHistory', () => {
  beforeEach(() => {
    useNetworkStore.setState({ interfaces: [], ifaceHistory: {} });
  });

  it('starts with empty history', () => {
    expect(useNetworkStore.getState().ifaceHistory).toEqual({});
  });

  it('accumulates rx and tx per interface', () => {
    useNetworkStore.getState().setInterfaces([makeIface('eth0', 1000, 500)]);
    useNetworkStore.getState().setInterfaces([makeIface('eth0', 2000, 800)]);
    const h = useNetworkStore.getState().ifaceHistory['eth0'];
    expect(h.rx).toEqual([1000, 2000]);
    expect(h.tx).toEqual([500, 800]);
  });

  it('tracks multiple interfaces independently', () => {
    useNetworkStore.getState().setInterfaces([
      makeIface('eth0', 100, 50),
      makeIface('wlan0', 200, 100),
    ]);
    expect(useNetworkStore.getState().ifaceHistory['eth0'].rx).toEqual([100]);
    expect(useNetworkStore.getState().ifaceHistory['wlan0'].rx).toEqual([200]);
  });

  it('caps history at 60 entries', () => {
    for (let i = 0; i < 65; i++) {
      useNetworkStore.getState().setInterfaces([makeIface('eth0', i, i)]);
    }
    const h = useNetworkStore.getState().ifaceHistory['eth0'];
    expect(h.rx).toHaveLength(60);
    expect(h.rx[0]).toBe(5);
    expect(h.tx).toHaveLength(60);
    expect(h.tx[0]).toBe(5);
  });
});
