export type TabName = 'processes' | 'resources' | 'network' | 'disk' | 'gpu';

interface TabBarProps {
  tabs: TabName[];
  active: TabName;
  onSelect: (t: TabName) => void;
}

export function TabBar({ tabs, active, onSelect }: TabBarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--mantle)',
      borderBottom: '1px solid var(--surface0)', padding: '0 12px' }}>
      {tabs.map((t) => (
        <button key={t}
          tabIndex={-1}
          className={t === active ? 'tab active' : 'tab'}
          onClick={() => onSelect(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}
