import { useRef, useEffect, useState, useCallback } from 'react';
import { useProcessStore, adjacentPid } from '../../stores/processStore';
import { TreeRow } from '../../lib/processTree';
import { isEditableTarget } from '../../lib/keyboard';
import { ProcessRow } from '../ProcessRow';
import { ContextMenu } from '../ContextMenu';
import { ActionBar } from '../ActionBar';
import { ReniceModal } from '../ReniceModal';
import { DetailsDrawer } from '../DetailsDrawer';

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
const ROW_H = 26;      // must match ProcessRow height for virtualization math
const HEADER_H = 30;
const OVERSCAN = 10;

interface ProcessesTabProps {
  rows: TreeRow[];
}

export function ProcessesTab({ rows }: ProcessesTabProps) {
  const filter = useProcessStore((s) => s.filter);
  const setFilter = useProcessStore((s) => s.setFilter);
  const sortBy = useProcessStore((s) => s.sortBy);
  const setSortBy = useProcessStore((s) => s.setSortBy);
  const selectedPid = useProcessStore((s) => s.selectedPid);
  const setSelectedPid = useProcessStore((s) => s.setSelectedPid);
  const pinned = useProcessStore((s) => s.pinned);
  const togglePin = useProcessStore((s) => s.togglePin);
  const toggleExpand = useProcessStore((s) => s.toggleExpand);

  const filterRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pid: number } | null>(null);
  const [showRenice, setShowRenice] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  // Stable callbacks so memoized ProcessRows don't re-render on every poll.
  const onSelectRow = useCallback((pid: number) => {
    const cur = useProcessStore.getState().selectedPid;
    setSelectedPid(cur === pid ? null : pid);
  }, [setSelectedPid]);

  const onCtxRow = useCallback((pid: number, e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, pid });
  }, []);

  // Stable so memoized ProcessRows keep their identity across polls.
  const onToggleExpand = useCallback((pid: number) => toggleExpand(pid), [toggleExpand]);

  // '/' focuses the filter box.
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

  // Up/Down move the selected process (by pid); Space toggles its pin; Enter
  // expands/collapses the selected node (only when it has children). Reads latest
  // rows/selection/pins via ref so the listener never needs re-binding.
  const navRef = useRef({ rows, selectedPid, pinned });
  navRef.current = { rows, selectedPid, pinned };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') { setSelectedPid(null); return; }
      if (e.key === ' ') {
        const { selectedPid, pinned } = navRef.current;
        if (selectedPid === null) return;
        e.preventDefault(); // Space otherwise scrolls the page.
        const wasPinned = pinned.includes(selectedPid);
        togglePin(selectedPid);
        if (!wasPinned && scrollerRef.current) scrollerRef.current.scrollTop = 0;
        return;
      }
      if (e.key === 'Enter') {
        const { rows, selectedPid } = navRef.current;
        if (selectedPid === null) return;
        e.preventDefault();
        const row = rows.find((r) => r.proc.pid === selectedPid);
        if (row?.hasChildren) toggleExpand(selectedPid);
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const { rows, selectedPid } = navRef.current;
      // adjacentPid tracks by pid; feed it the visible rows' processes in order.
      const procs = rows.map((r) => r.proc);
      setSelectedPid(adjacentPid(procs, selectedPid, e.key === 'ArrowDown' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [setSelectedPid, togglePin, toggleExpand]);

  // Keep the selected row visible (only scrolls when out of view; poll updates
  // don't change selectedPid, so this never fires on the 1s refresh).
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedPid]);

  // Track viewport height for the virtual window.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = rows.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const visible = rows.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_H;
  const padBottom = Math.max(0, (total - endIdx) * ROW_H);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={filterRef}
          placeholder="Filter processes… (press /)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 220 }}
        />
        {SORT_KEYS.map((s) => (
          <button key={s} onClick={() => setSortBy(s)}
            style={{
              borderColor: sortBy === s ? 'var(--mauve)' : undefined,
              color: sortBy === s ? 'var(--mauve)' : undefined,
            }}>
            {s.toUpperCase()}
          </button>
        ))}
        <span className="badge">{total} processes</span>
      </div>

      <div ref={scrollerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 60 }} /><col /><col style={{ width: 70 }} />
            <col style={{ width: 90 }} /><col style={{ width: 80 }} />
            <col style={{ width: 80 }} /><col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr style={{ height: HEADER_H, color: 'var(--overlay0)', fontSize: 11 }}>
              {COL_HEADERS.map((h) => (
                <th key={h.label} style={{
                  textAlign: h.align, padding: '4px 6px', fontWeight: 400,
                  position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
                  borderBottom: '1px solid var(--surface0)',
                }}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={7} style={{ padding: 0, border: 0 }} /></tr>}
            {visible.map((r) => (
              <ProcessRow
                key={r.proc.pid}
                ref={r.proc.pid === selectedPid ? selectedRowRef : undefined}
                proc={r.proc}
                depth={r.depth}
                hasChildren={r.hasChildren}
                expanded={r.expanded}
                cpuAccum={r.cpuAccum}
                memAccum={r.memAccum}
                selected={r.proc.pid === selectedPid}
                pinned={pinned.includes(r.proc.pid)}
                rowHeight={ROW_H}
                scrollMarginTop={HEADER_H}
                onSelect={onSelectRow}
                onContextMenu={onCtxRow}
                onToggleExpand={onToggleExpand}
              />
            ))}
            {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={7} style={{ padding: 0, border: 0 }} /></tr>}
          </tbody>
        </table>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} pid={ctxMenu.pid}
          isPinned={pinned.includes(ctxMenu.pid)}
          onTogglePin={() => {
            const wasPinned = pinned.includes(ctxMenu.pid);
            togglePin(ctxMenu.pid);
            if (!wasPinned && scrollerRef.current) scrollerRef.current.scrollTop = 0;
          }}
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
