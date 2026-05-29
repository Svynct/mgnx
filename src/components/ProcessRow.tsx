import { forwardRef, memo } from 'react';
import { ProcessEntry } from '../stores/processStore';

function heatLevel(cpu: number): { color: string; attr: string } {
  if (cpu >= 15) return { color: 'var(--red)',     attr: 'red'    };
  if (cpu >= 8)  return { color: 'var(--yellow)',  attr: 'yellow' };
  if (cpu >= 1)  return { color: 'var(--green)',   attr: 'green'  };
  return                 { color: 'var(--overlay0)', attr: 'muted' };
}

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}Gb`;
  if (mb >= 1) return `${mb.toFixed(0)}Mb`;
  return `${(mb * 1024).toFixed(0)}Kb`;
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
  onToggleFold: (pid: number) => void;
}

export const ProcessRow = memo(
  forwardRef<HTMLTableRowElement, ProcessRowProps>(
    ({ proc, depth, hasChildren, expanded, cpuAccum, memAccum, selected, pinned,
       rowHeight, scrollMarginTop, onSelect, onContextMenu, onToggleFold }, ref) => {
      // Every row shows its subtree total (own + all descendants). A leaf's accum
      // is just its own usage; a parent rolls up its children. CPU is already a
      // share of all cores (poller divides by core count); memory is summed RSS.
      const cpu = cpuAccum;
      const mem = memAccum;
      const heat = heatLevel(cpu);
      const caret = hasChildren ? (expanded ? '▼' : '▶') : ' ';
      return (
      <tr
        ref={ref}
        data-heat={heat.attr}
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
            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggleFold(proc.pid); }}
            style={{ display: 'inline-block', width: 14, textAlign: 'center', color: 'var(--overlay0)', cursor: hasChildren ? 'pointer' : 'default' }}
          >{caret}</span>
          {proc.name}
        </td>
        <td style={{ padding: '3px 6px', color: heat.color, textAlign: 'right' }}>
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
