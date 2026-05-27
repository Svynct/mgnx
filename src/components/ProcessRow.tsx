import { forwardRef } from 'react';
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

interface ProcessRowProps {
  proc: ProcessEntry;
  selected: boolean;
  keyboardFocused?: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const ProcessRow = forwardRef<HTMLTableRowElement, ProcessRowProps>(
  ({ proc, selected, keyboardFocused, onSelect, onContextMenu }, ref) => (
    <tr
      ref={ref}
      data-heat={heatAttr(proc.cpu_percent)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        background: selected
          ? 'color-mix(in srgb, var(--mauve) 12%, var(--bg))'
          : 'transparent',
        outline: keyboardFocused ? '1px solid var(--blue)' : undefined,
        outlineOffset: '-1px',
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      <td style={{ padding: '3px 6px', color: 'var(--overlay0)' }}>{proc.pid}</td>
      <td style={{ padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc.name}</td>
      <td style={{ padding: '3px 6px', color: heatColor(proc.cpu_percent), textAlign: 'right' }}>
        {proc.cpu_percent.toFixed(1)}%
      </td>
      <td style={{ padding: '3px 6px', textAlign: 'right' }}>
        {proc.memory_mb >= 1024
          ? `${(proc.memory_mb / 1024).toFixed(1)}G`
          : `${proc.memory_mb.toFixed(0)}M`}
      </td>
      <td style={{ padding: '3px 6px', color: 'var(--overlay0)' }}>{proc.status}</td>
      <td style={{ padding: '3px 6px', color: 'var(--overlay0)' }}>{proc.user}</td>
      <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--overlay0)' }}>{proc.threads}</td>
    </tr>
  )
);
