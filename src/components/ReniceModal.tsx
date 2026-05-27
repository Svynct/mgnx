import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ReniceModalProps { pid: number; currentNice?: number; onClose: () => void; }

export function ReniceModal({ pid, currentNice = 0, onClose }: ReniceModalProps) {
  const [value, setValue] = useState(String(currentNice));
  const [error, setError] = useState('');

  const submit = async () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < -20 || n > 19) {
      setError('Value must be between -20 and 19');
      return;
    }
    await invoke('process_renice', { pid, priority: n });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--mantle)', border: '1px solid var(--surface1)',
        borderRadius: 8, padding: 24, width: 280 }}>
        <div style={{ marginBottom: 12, fontWeight: 500 }}>Renice process {pid}</div>
        <input
          type="number" min={-20} max={19}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
          style={{ width: '100%', marginBottom: 8 }}
          autoFocus
        />
        {error && <div style={{ color: 'var(--red)', fontSize: 11, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={submit} style={{ borderColor: 'var(--mauve)', color: 'var(--mauve)' }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
