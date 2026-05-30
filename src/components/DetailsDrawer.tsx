import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProcessStore } from '../stores/processStore';

interface ThreadInfo { tid: number; state: string; }
interface ProcessDetails {
  pid: number; cmdline: string; cwd: string; fd_count: number;
  env_count: number; threads: ThreadInfo[]; ppid: number;
  start_time: string; cpu_time_s: number;
}

interface DetailsDrawerProps { pid: number; onClose: () => void; }

export function DetailsDrawer({ pid, onClose }: DetailsDrawerProps) {
  const [details, setDetails] = useState<ProcessDetails | null>(null);
  const [error, setError] = useState('');
  const proc = useProcessStore((s) => s.processes.find((p) => p.pid === pid));

  useEffect(() => {
    invoke<ProcessDetails>('process_details', { pid })
      .then(setDetails)
      .catch((e) => setError(String(e)));
  }, [pid]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', zIndex: 2000 }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '60vh', overflow: 'auto',
          background: 'var(--mantle)', borderTop: '1px solid var(--surface1)',
          padding: 20, borderRadius: '12px 12px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 500 }}>Process {pid}</span>
          <button onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>
        {error && <div style={{ color: 'var(--red)' }}>{error}</div>}
        {details && (
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 12 }}>
            <span style={{ color: 'var(--overlay0)' }}>Command</span>
            <span style={{ wordBreak: 'break-all' }}>{details.cmdline}</span>
            <span style={{ color: 'var(--overlay0)' }}>CWD</span>
            <span>{details.cwd}</span>
            <span style={{ color: 'var(--overlay0)' }}>Parent PID</span>
            <span>{details.ppid}</span>
            <span style={{ color: 'var(--overlay0)' }}>Started</span>
            <span>{details.start_time}</span>
            <span style={{ color: 'var(--overlay0)' }}>CPU time</span>
            <span>{details.cpu_time_s.toFixed(2)}s</span>
            <span style={{ color: 'var(--overlay0)' }}>Open files</span>
            <span>{details.fd_count}</span>
            <span style={{ color: 'var(--overlay0)' }}>Env vars</span>
            <span>{details.env_count}</span>
            <span style={{ color: 'var(--overlay0)' }}>Disk read</span>
            <span>{proc?.disk_read_total_mb != null
              ? `${proc.disk_read_total_mb.toFixed(1)} MB`
              : '—'}</span>
            <span style={{ color: 'var(--overlay0)' }}>Disk written</span>
            <span>{proc?.disk_write_total_mb != null
              ? `${proc.disk_write_total_mb.toFixed(1)} MB`
              : '—'}</span>
            <span style={{ color: 'var(--overlay0)' }}>Threads</span>
            <div>
              {details.threads.map((t) => (
                <div key={t.tid} style={{ color: 'var(--overlay0)' }}>
                  TID {t.tid} — {t.state}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
