import React, { useState } from 'react';
import { useTauriEvents } from './hooks/useTauriEvents';
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
      <TabBar active={tab} onSelect={setTab} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>{content[tab]}</div>
    </div>
  );
}
