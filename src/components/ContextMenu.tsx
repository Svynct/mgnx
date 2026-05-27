import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ContextMenuProps {
  x: number; y: number; pid: number;
  onClose: () => void;
  onRenice?: () => void;
  onDetails?: () => void;
}

function Item({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick}
      style={{ padding: '6px 14px', cursor: 'pointer',
        color: danger ? 'var(--red)' : 'var(--text)',
        fontSize: 12 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface1)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      {label}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--surface1)', margin: '2px 0' }} />;
}

export function ContextMenu({ x, y, pid, onClose, onRenice, onDetails }: ContextMenuProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const click = () => onClose();
    window.addEventListener('keydown', handler);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('mousedown', click);
    };
  }, [onClose]);

  const act = (cmd: string) => { invoke(cmd, { pid }); onClose(); };

  return (
    <div onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: y, left: x, zIndex: 1000,
        background: 'var(--mantle)', border: '1px solid var(--surface1)',
        borderRadius: 6, minWidth: 150, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
      <Item label="SIGKILL" danger onClick={() => act('process_kill')} />
      <Item label="SIGTERM" danger onClick={() => act('process_term')} />
      <Divider />
      <Item label="Resume"  onClick={() => act('process_resume')} />
      <Item label="Suspend" onClick={() => act('process_suspend')} />
      <Item label="Renice…" onClick={() => { onClose(); onRenice?.(); }} />
      <Divider />
      <Item label="Details" onClick={() => { onClose(); onDetails?.(); }} />
    </div>
  );
}
