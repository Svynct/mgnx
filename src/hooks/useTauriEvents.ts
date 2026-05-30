import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useProcessStore } from '../stores/processStore';
import { useResourceStore } from '../stores/resourceStore';
import { useNetworkStore } from '../stores/networkStore';
import { useDiskStore } from '../stores/diskStore';
import { useGpuStore } from '../stores/gpuStore';
import { useThermalStore } from '../stores/thermalStore';
import { useBatteryStore } from '../stores/batteryStore';

export function useTauriEvents() {
  useEffect(() => {
    const unlisteners = [
      listen('processes-update', (e) => useProcessStore.getState().setProcesses(e.payload as any)),
      listen('resources-update', (e) => useResourceStore.getState().push(e.payload as any)),
      listen('network-update',      (e) => useNetworkStore.getState().setInterfaces(e.payload as any)),
      listen('connections-update',  (e) => useNetworkStore.getState().setConnections(e.payload as any)),
      listen('disk-update',      (e) => useDiskStore.getState().setDisks(e.payload as any)),
      listen('gpu-update',       (e) => useGpuStore.getState().setPayload(e.payload as any)),
      listen('gpu-available',    (e) => useGpuStore.getState().setAvailable(e.payload as boolean)),
      listen('thermal-update',   (e) => useThermalStore.getState().setThermal(e.payload as any)),
      listen('battery-update',   (e) => useBatteryStore.getState().setBattery(e.payload as any)),
    ];
    return () => { unlisteners.forEach((p) => p.then((fn) => fn())); };
  }, []);
}
