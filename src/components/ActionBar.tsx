import { invoke } from '@tauri-apps/api/core';

interface ActionBarProps {
  selectedPid: number | null;
  onAction: (action: 'renice' | 'details') => void;
}

export function ActionBar({ selectedPid, onAction }: ActionBarProps) {
  if (selectedPid === null) {
    return (
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--surface0)',
        color: 'var(--overlay0)', fontSize: 12, textAlign: 'center' }}>
        Select a process · ↑/↓ to move · Esc to deselect
      </div>
    );
  }

  const act = (cmd: string) => invoke(cmd, { pid: selectedPid });

  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 12px',
      borderTop: '1px solid var(--surface0)', background: 'var(--mantle)' }}>
      <button onClick={() => onAction('details')}>Details</button>
      <button onClick={() => act('process_suspend')}>Suspend</button>
      <button onClick={() => act('process_resume')}>Resume</button>
      <button onClick={() => onAction('renice')}>Renice…</button>
      <button className="danger" onClick={() => act('process_term')}>SIGTERM</button>
      <button className="danger" onClick={() => act('process_kill')}>SIGKILL</button>
    </div>
  );
}
