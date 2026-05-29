import { useNetworkStore, NetworkInterface, NetworkConnection, IfaceHistory } from '../../stores/networkStore';
import { Sparkline } from '../Sparkline';

function fmtSpeed(bps: number): string {
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function fmtMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

function InterfaceCard({ iface, history }: { iface: NetworkInterface; history: IfaceHistory | undefined }) {
  return (
    <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontWeight: 500 }}>{iface.name}</span>
        <span className={`badge ${iface.is_up ? 'active' : ''}`}>
          {iface.is_up ? 'UP' : 'DOWN'}
        </span>
        {iface.ip && <span style={{ fontSize: 11, color: 'var(--overlay0)' }}>{iface.ip}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--overlay0)' }}>↓ Download</div>
          <div>{fmtSpeed(iface.rx_bytes_per_sec)}</div>
          <div style={{ fontSize: 10, color: 'var(--overlay0)' }}>Total: {fmtMb(iface.rx_total_mb)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--overlay0)' }}>↑ Upload</div>
          <div>{fmtSpeed(iface.tx_bytes_per_sec)}</div>
          <div style={{ fontSize: 10, color: 'var(--overlay0)' }}>Total: {fmtMb(iface.tx_total_mb)}</div>
        </div>
      </div>
      {history && history.rx.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Sparkline data={history.rx} color="var(--green)" max={Math.max(...history.rx, 1)} />
          <Sparkline data={history.tx} color="var(--blue)" max={Math.max(...history.tx, 1)} />
        </div>
      )}
    </div>
  );
}

function SystemConnections({ conns }: { conns: NetworkConnection[] }) {
  if (conns.length === 0) return null;
  return (
    <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--overlay0)', marginBottom: 6 }}>
        Connections ({conns.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--overlay0)', borderBottom: '1px solid var(--surface0)' }}>
            <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 400 }}>Proto</th>
            <th style={{ textAlign: 'left', fontWeight: 400 }}>Local Port</th>
            <th style={{ textAlign: 'left', fontWeight: 400 }}>Remote</th>
            <th style={{ textAlign: 'left', fontWeight: 400 }}>State</th>
          </tr>
        </thead>
        <tbody>
          {conns.slice(0, 20).map((c) => (
            <tr key={`${c.proto}-${c.local_port}-${c.remote_addr}`} style={{ color: 'var(--subtext1)' }}>
              <td>{c.proto}</td>
              <td>{c.local_port}</td>
              <td>{c.remote_addr}</td>
              <td>{c.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NetworkTab() {
  const { interfaces, connections, ifaceHistory } = useNetworkStore();
  if (interfaces.length === 0) {
    return <div style={{ color: 'var(--overlay0)', padding: 20 }}>No network interfaces detected.</div>;
  }
  return (
    <div>
      {interfaces.map((iface) => (
        <InterfaceCard key={iface.name} iface={iface} history={ifaceHistory[iface.name]} />
      ))}
      <SystemConnections conns={connections} />
    </div>
  );
}
