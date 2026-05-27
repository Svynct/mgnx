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

const SORT_KEYS = ['cpu', 'mem', 'name'] as const;

export default function App() {
  useTauriEvents();
  const [tab, setTab] = useState<TabName>('processes');
  const { filtered, setSelectedPid, setSortBy } = useProcessStore();
  const rows = filtered();

  const nav = useKeyboardNav(tab, useProcessStore.getState().selectedPid !== null, {
    rowCount: rows.length,
    filterCount: SORT_KEYS.length,
    actionCount: 6,
    onTabChange: setTab,
    onRowSelect: (idx) => setSelectedPid(rows[idx]?.pid ?? null),
    onRowDeselect: () => setSelectedPid(null),
    onActionActivate: () => {},
    onFilterActivate: (idx) => setSortBy(SORT_KEYS[idx]),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => nav.handleKey(e);
    // capture=true: intercept Tab before browser focus management
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [nav.handleKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <TabBar active={tab} onSelect={setTab} activeZone={nav.zone} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {tab === 'processes'
          ? <ProcessesTab
              navZone={nav.zone}
              navRowIdx={nav.rowIdx}
              navFilterIdx={nav.filterIdx}
              navActionIdx={nav.actionIdx}
            />
          : tab === 'resources' ? <ResourcesTab />
          : tab === 'network'   ? <NetworkTab />
          : tab === 'disk'      ? <DiskTab />
          : <GpuTab />}
      </div>
    </div>
  );
}
