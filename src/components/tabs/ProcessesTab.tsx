import { useRef, useEffect, useState } from 'react';
import { useProcessStore } from '../../stores/processStore';
import { ProcessRow } from '../ProcessRow';
import { ContextMenu } from '../ContextMenu';
import { ActionBar } from '../ActionBar';
import { ReniceModal } from '../ReniceModal';
import { DetailsDrawer } from '../DetailsDrawer';
import { Zone } from '../../hooks/useKeyboardNav';

const COL_HEADERS: { label: string; align: 'left' | 'right' }[] = [
  { label: 'PID',     align: 'left'  },
  { label: 'Name',    align: 'left'  },
  { label: 'CPU%',    align: 'right' },
  { label: 'Memory',  align: 'right' },
  { label: 'Status',  align: 'left'  },
  { label: 'User',    align: 'left'  },
  { label: 'Threads', align: 'right' },
];

const SORT_KEYS = ['cpu', 'mem', 'name'] as const;

interface ProcessesTabProps {
  navZone?: Zone;
  navRowIdx?: number;
  navFilterIdx?: number;
  navActionIdx?: number;
}

export function ProcessesTab({ navZone, navRowIdx = 0, navFilterIdx = 0, navActionIdx = 0 }: ProcessesTabProps) {
  const { filtered, filter, setFilter, sortBy, setSortBy, selectedPid, setSelectedPid } = useProcessStore();
  const filterRef = useRef<HTMLInputElement>(null);
  const focusedRowRef = useRef<HTMLTableRowElement>(null);
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

  // Scroll keyboard-focused row into view
  useEffect(() => {
    if (navZone === 'content') focusedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [navZone, navRowIdx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={filterRef}
          placeholder="Filter processes… (press /)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 220 }}
        />
        {SORT_KEYS.map((s, i) => (
          <button key={s} onClick={() => setSortBy(s)}
            style={{
              borderColor: sortBy === s ? 'var(--mauve)' : (navZone === 'filters' && navFilterIdx === i ? 'var(--blue)' : undefined),
              color: sortBy === s ? 'var(--mauve)' : (navZone === 'filters' && navFilterIdx === i ? 'var(--blue)' : undefined),
              outline: navZone === 'filters' && navFilterIdx === i ? '1px solid var(--blue)' : undefined,
            }}>
            {s.toUpperCase()}
          </button>
        ))}
        <span className="badge">{rows.length} processes</span>
        {navZone && navZone !== 'tabs' && (
          <span className="badge active" style={{ marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase' }}>
            {navZone}
          </span>
        )}
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
              {COL_HEADERS.map((h) => (
                <th key={h.label} style={{ textAlign: h.align, padding: '4px 6px', fontWeight: 400 }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <ProcessRow
                key={p.pid}
                ref={navZone === 'content' && navRowIdx === i ? focusedRowRef : undefined}
                proc={p}
                selected={selectedPid === p.pid}
                keyboardFocused={navZone === 'content' && navRowIdx === i}
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
        navZone={navZone}
        navActionIdx={navActionIdx}
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
