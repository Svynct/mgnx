import { useState, useEffect, useRef, useMemo } from 'react';
import { useTauriEvents } from './hooks/useTauriEvents';
import { useProcessStore, filterProcesses } from './stores/processStore';
import { buildVisibleTree, flatToTreeRows, ancestorPids } from './lib/processTree';
import { useGpuStore } from './stores/gpuStore';
import { isEditableTarget } from './lib/keyboard';
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

  const processes = useProcessStore((s) => s.processes);
  const filter = useProcessStore((s) => s.filter);
  const sortBy = useProcessStore((s) => s.sortBy);
  const pinnedPid = useProcessStore((s) => s.pinnedPid);
  const toggled = useProcessStore((s) => s.toggled);

  // The pinned process plus its ancestors up to root; each is hoisted to the top
  // of its sibling level inside the tree.
  const pinnedSet = useMemo(
    () => (pinnedPid !== null ? ancestorPids(processes, pinnedPid) : new Set<number>()),
    [processes, pinnedPid],
  );

  const gpuAvailable = useGpuStore((s) => s.available);
  const tabs = useMemo<TabName[]>(
    () => gpuAvailable
      ? ['processes', 'resources', 'network', 'disk', 'gpu']
      : ['processes', 'resources', 'network', 'disk'],
    [gpuAvailable],
  );

  // While filtering, the tree flattens to a sorted list (no parent grouping);
  // otherwise an htop-style tree is built — roots show one level by default, the
  // `toggled` pids flip from that, and the pinned chain is hoisted per level.
  const rows = useMemo(
    () => filter
      ? flatToTreeRows(filterProcesses(processes, filter, sortBy))
      : buildVisibleTree(processes, toggled, sortBy, pinnedSet),
    [processes, filter, sortBy, toggled, pinnedSet],
  );

  // ArrowLeft/ArrowRight switch tabs globally. Listener registers once; reads
  // latest tab/tabs via a ref so it never needs re-binding.
  const tabNavRef = useRef({ tab, tabs });
  tabNavRef.current = { tab, tabs };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (e.repeat) return; // one tab per keypress
      // Drop DOM focus so a stale focus ring doesn't linger on a different tab
      // than the active one while arrow-navigating.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const { tab, tabs } = tabNavRef.current;
      const cur = Math.max(0, tabs.indexOf(tab));
      const step = e.key === 'ArrowRight' ? 1 : tabs.length - 1;
      setTab(tabs[(cur + step) % tabs.length]);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar />
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'processes'
          ? <ProcessesTab rows={rows} />
          : <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {tab === 'resources' ? <ResourcesTab />
                : tab === 'network' ? <NetworkTab />
                : tab === 'disk'    ? <DiskTab />
                : <GpuTab />}
            </div>}
      </div>
    </div>
  );
}
