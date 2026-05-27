import { useState, useEffect } from 'react';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useKeyboardNav } from './hooks/useKeyboardNav';
import { useProcessStore } from './stores/processStore';
import { TopBar } from './components/TopBar';
import { TabBar, TabName } from './components/TabBar';
import { ProcessesTab } from './components/tabs/ProcessesTab';
import { ResourcesTab } from './components/tabs/ResourcesTab';
import { NetworkTab } from './components/tabs/NetworkTab';
import { DiskTab } from './components/tabs/DiskTab';
import { GpuTab } from './components/tabs/GpuTab';

export default function App() {
  useTauriEvents();
  const [tab, setTab] = useState<TabName>('processes');
  const { filtered, setSelectedPid } = useProcessStore();
  const rows = filtered();

  const nav = useKeyboardNav(tab, useProcessStore.getState().selectedPid !== null, {
    rowCount: rows.length,
    filterCount: 4,
    actionCount: 6,
    onTabChange: setTab,
    onRowSelect: (idx) => setSelectedPid(rows[idx]?.pid ?? null),
    onRowDeselect: () => setSelectedPid(null),
    onActionActivate: () => {},
    onFilterActivate: () => {},
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => nav.handleKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nav.handleKey]);

  const content: Record<TabName, React.ReactElement> = {
    processes: <ProcessesTab />,
    resources: <ResourcesTab />,
    network:   <NetworkTab />,
    disk:      <DiskTab />,
    gpu:       <GpuTab />,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <TabBar active={tab} onSelect={setTab} activeZone={nav.zone} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>{content[tab]}</div>
    </div>
  );
}
