import { useGpuStore } from '../stores/gpuStore';

export type TabName = 'processes' | 'resources' | 'network' | 'disk' | 'gpu';

interface TabBarProps {
  active: TabName;
  onSelect: (t: TabName) => void;
  activeZone?: string;
}

export function TabBar({ active, onSelect, activeZone }: TabBarProps) {
  const gpuAvailable = useGpuStore((s) => s.available);
  const tabs: TabName[] = ['processes', 'resources', 'network', 'disk'];
  if (gpuAvailable) tabs.push('gpu');

  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--mantle)',
      borderBottom: '1px solid var(--surface0)', padding: '0 12px' }}>
      {tabs.map((t) => (
        <button key={t}
          onClick={() => onSelect(t)}
          style={{
            background: 'none', border: 'none',
            borderBottom: active === t ? '2px solid var(--mauve)' : '2px solid transparent',
            color: active === t ? 'var(--mauve)' : 'var(--overlay0)',
            padding: '8px 16px', cursor: 'pointer',
            textTransform: 'capitalize', fontSize: 13,
          }}>
          {t}
        </button>
      ))}
      {activeZone === 'tabs' && (
        <span className="badge active" style={{ marginLeft: 8, fontSize: 10 }}>TABS</span>
      )}
    </div>
  );
}
