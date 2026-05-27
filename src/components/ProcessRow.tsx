import { forwardRef, memo } from 'react';
import { ProcessEntry } from '../stores/processStore';

function heatColor(cpu: number): string {
  if (cpu >= 15) return 'var(--red)';
  if (cpu >= 8)  return 'var(--yellow)';
  if (cpu >= 1)  return 'var(--green)';
  return 'var(--overlay0)';
}

function heatAttr(cpu: number): string {
  if (cpu >= 15) return 'red';
  if (cpu >= 8)  return 'yellow';
  if (cpu >= 1)  return 'green';
  return 'muted';
}

function formatMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb.toFixed(0)}M`;
}

interface ProcessRowProps {
  proc: ProcessEntry;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  cpuAccum: number;
  memAccum: number;
  selected: boolean;
  pinned?: boolean;
  rowHeight: number;
  scrollMarginTop: number;
  onSelect: (pid: number) => void;
  onContextMenu: (pid: number, e: React.MouseEvent) => void;
  onToggleExpand: (pid: number) => void;
}

export const ProcessRow = memo(
  forwardRef<HTMLTableRowElement, ProcessRowProps>(
    ({ proc, depth, hasChildren, expanded, cpuAccum, memAccum, selected, pinned,
       rowHeight, scrollMarginTop, onSelect, onContextMenu, onToggleExpand }, ref) => {
      // A collapsed parent rolls its descendants' totals into its own row; an
      // expanded parent (children are separate rows now) and leaves show own values.
      const showAccum = hasChildren && !expanded;
      const cpu = showAccum ? cpuAccum : proc.cpu_percent;
      const mem = showAccum ? memAccum : proc.memory_mb;
      const caret = hasChildren ? (expanded ? '▼' : '▶') : ' ';
      return (
      <tr
        ref={ref}
        data-heat={heatAttr(cpu)}
        onClick={() => onSelect(proc.pid)}
        onContextMenu={(e) => onContextMenu(proc.pid, e)}
        style={{
          height: rowHeight,
          scrollMarginTop,
          background: selected
            ? 'color-mix(in srgb, var(--mauve) 18%, var(--bg))'
            : 'transparent',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        {/* Inset box-shadow draws the pin accent without affecting row height. */}
        <td style={{
          padding: '3px 6px', color: 'var(--overlay0)',
          boxShadow: pinned ? 'inset 3px 0 0 0 var(--mauve)' : undefined,
        }}>{proc.pid}</td>
        {/* Depth indent + fixed-width caret; clicking the caret toggles expand
            without selecting the row. Both are inline so row height is unaffected. */}
        <td style={{ paddingLeft: 6 + depth * 14, paddingRight: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span
            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleExpand(proc.pid); }}
            style={{ display: 'inline-block', width: 14, textAlign: 'center', color: 'var(--overlay0)', cursor: hasChildren ? 'pointer' : 'default' }}
          >{caret}</span>
          {proc.name}
        </td>
        <td style={{ padding: '3px 6px', color: heatColor(cpu), textAlign: 'right' }}>
          {cpu.toFixed(1)}%
        </td>
        <td style={{ padding: '3px 6px', textAlign: 'right' }}>{formatMem(mem)}</td>
        <td style={{ padding: '3px 6px', color: 'var(--overlay0)' }}>{proc.status}</td>
        <td style={{ padding: '3px 6px', color: 'var(--overlay0)' }}>{proc.user}</td>
        <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--overlay0)' }}>{proc.threads}</td>
      </tr>
      );
    }
  )
);
