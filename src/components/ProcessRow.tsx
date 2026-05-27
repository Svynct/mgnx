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
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function ProcessRow({ proc, selected, onSelect, onContextMenu }: ProcessRowProps) {
  return (
    <tr
      data-heat={heatAttr(proc.cpu_percent)}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        background: selected ? 'color-mix(in srgb, var(--mauve) 12%, var(--bg))' : 'transparent',
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      <td style={{ color: 'var(--overlay0)', width: 60 }}>{proc.pid}</td>
      <td style={{ flex: 1 }}>{proc.name}</td>
      <td style={{ color: heatColor(proc.cpu_percent), width: 70, textAlign: 'right' }}>
        {proc.cpu_percent.toFixed(1)}%
      </td>
      <td style={{ width: 90, textAlign: 'right' }}>
        {proc.memory_mb >= 1024
          ? `${(proc.memory_mb / 1024).toFixed(1)}G`
          : `${proc.memory_mb.toFixed(0)}M`}
      </td>
      <td style={{ width: 80, color: 'var(--overlay0)' }}>{proc.status}</td>
      <td style={{ width: 80, color: 'var(--overlay0)' }}>{proc.user}</td>
      <td style={{ width: 60, textAlign: 'right', color: 'var(--overlay0)' }}>{proc.threads}</td>
    </tr>
  );
}
