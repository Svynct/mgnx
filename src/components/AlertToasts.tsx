import { useEffect } from 'react';
import { useAlertsStore, FiredAlert } from '../stores/alertsStore';

function Toast({ alert }: { alert: FiredAlert }) {
  const dismiss = useAlertsStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(alert.id), 8000);
    return () => clearTimeout(t);
  }, [alert.id, dismiss]);

  return (
    <div onClick={() => dismiss(alert.id)} style={{
      background: 'var(--mantle)',
      border: '1px solid var(--red)',
      padding: '8px 12px',
      borderRadius: 6,
      fontSize: 12,
      cursor: 'pointer',
      maxWidth: 320,
      color: 'var(--text)',
    }}>
      {alert.message}
    </div>
  );
}

export function AlertToasts() {
  const alerts = useAlertsStore((s) => s.alerts);
  if (alerts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 12, right: 12, zIndex: 3000,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {alerts.map((a) => <Toast key={a.id} alert={a} />)}
    </div>
  );
}
