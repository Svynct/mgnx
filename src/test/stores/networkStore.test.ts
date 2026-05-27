import { describe, it, expect } from 'vitest';
import { useNetworkStore, NetworkInterface } from '../../stores/networkStore';

const iface: NetworkInterface = {
  name: 'wlan0', is_up: true, ip: '192.168.1.2', link_speed_mbps: 866,
  rx_bytes_per_sec: 100, tx_bytes_per_sec: 50,
  rx_total_mb: 10, tx_total_mb: 5,
  connections: [{ proto: 'tcp', local_port: 443, remote_addr: '1.2.3.4', state: 'ESTABLISHED' }],
};

describe('networkStore', () => {
  it('starts empty and stores interfaces', () => {
    expect(useNetworkStore.getState().interfaces).toEqual([]);
    useNetworkStore.getState().setInterfaces([iface]);
    expect(useNetworkStore.getState().interfaces).toHaveLength(1);
    expect(useNetworkStore.getState().interfaces[0].name).toBe('wlan0');
    expect(useNetworkStore.getState().interfaces[0].connections).toHaveLength(1);
  });
});
