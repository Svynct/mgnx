import { useRef, useEffect, useState } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { ProcessRow } from '../ProcessRow';
import { ContextMenu } from '../ContextMenu';
import { ActionBar } from '../ActionBar';
import { ReniceModal } from '../ReniceModal';
import { DetailsDrawer } from '../DetailsDrawer';

const COL_HEADERS = ['PID', 'Name', 'CPU%', 'Memory', 'Status', 'User', 'Threads'];

export function ProcessesTab() {
  const { filtered, filter, setFilter, sortBy, setSortBy, selectedPid, setSelectedPid } = useProcessStore();
  const filterRef = useRef<HTMLInputElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pid: number } | null>(null);
  const [showRenice, setShowRenice] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const rows = filtered();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== filterRef.current) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={filterRef}
          placeholder="Filter processes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 220 }}
        />
        {(['cpu', 'mem', 'name'] as const).map((s) => (
          <button key={s} onClick={() => setSortBy(s)}
            style={{ borderColor: sortBy === s ? 'var(--mauve)' : undefined,
                     color: sortBy === s ? 'var(--mauve)' : undefined }}>
            {s.toUpperCase()}
          </button>
        ))}
        <span className="badge">{rows.length} processes</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 60 }} /><col /><col style={{ width: 70 }} />
            <col style={{ width: 90 }} /><col style={{ width: 80 }} />
            <col style={{ width: 80 }} /><col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr style={{ color: 'var(--overlay0)', fontSize: 11, borderBottom: '1px solid var(--surface0)' }}>
              {COL_HEADERS.map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 0', fontWeight: 400 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <ProcessRow
                key={p.pid}
                proc={p}
                selected={selectedPid === p.pid}
                onSelect={() => setSelectedPid(selectedPid === p.pid ? null : p.pid)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, pid: p.pid });
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} pid={ctxMenu.pid}
          onClose={() => setCtxMenu(null)}
          onRenice={() => { setSelectedPid(ctxMenu.pid); setShowRenice(true); }}
          onDetails={() => { setSelectedPid(ctxMenu.pid); setShowDetails(true); }}
        />
      )}

      <ActionBar
        selectedPid={selectedPid}
        onAction={(a) => { if (a === 'renice') setShowRenice(true); else setShowDetails(true); }}
      />

      {showRenice && selectedPid !== null && (
        <ReniceModal pid={selectedPid} onClose={() => setShowRenice(false)} />
      )}
      {showDetails && selectedPid !== null && (
        <DetailsDrawer pid={selectedPid} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
}
