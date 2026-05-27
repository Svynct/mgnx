import { invoke } from '@tauri-apps/api/core';
import { Zone } from '../hooks/useKeyboardNav';

interface ActionBarProps {
  selectedPid: number | null;
  navZone?: Zone;
  navActionIdx?: number;
  onAction: (action: 'renice' | 'details') => void;
}

export function ActionBar({ selectedPid, navZone, navActionIdx = 0, onAction }: ActionBarProps) {
  if (selectedPid === null) {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--surface0)',
        color: 'var(--overlay0)', fontSize: 12, textAlign: 'center' }}>
        Select a process · Enter to confirm · Esc to deselect
      </div>
    );
  }

  const act = (cmd: string) => invoke(cmd, { pid: selectedPid });
  const focused = (i: number) => navZone === 'actions' && navActionIdx === i
    ? { outline: '1px solid var(--blue)', outlineOffset: 2 } : {};

  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px',
      borderTop: '1px solid var(--surface0)', background: 'var(--mantle)' }}>
      <button style={focused(0)} onClick={() => onAction('details')}>Details</button>
      <button style={focused(1)} onClick={() => act('process_suspend')}>Suspend</button>
      <button style={focused(2)} onClick={() => act('process_resume')}>Resume</button>
      <button style={focused(3)} onClick={() => onAction('renice')}>Renice…</button>
      <button className="danger" style={focused(4)} onClick={() => act('process_term')}>SIGTERM</button>
      <button className="danger" style={focused(5)} onClick={() => act('process_kill')}>SIGKILL</button>
    </div>
  );
}
