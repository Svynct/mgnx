import { useResourceStore } from '../stores/resourceStore';
import { useNetworkStore } from '../stores/networkStore';
import { useGpuStore } from '../stores/gpuStore';

function Pill({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      background: 'var(--surface0)', borderRadius: 4, fontSize: 11 }}>
      <span style={{ color: 'var(--overlay0)' }}>{label}</span>
      <div style={{ width: 40, height: 4, background: 'var(--surface1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: 'var(--mauve)' }} />
      </div>
      <span>{value}</span>
    </div>
  );
}

export function TopBar() {
  const { cores, ram_used_mb, ram_total_mb } = useResourceStore();
  const { interfaces } = useNetworkStore();
  const { available, usage_percent } = useGpuStore();

  const avgCpu = cores.length
    ? cores.reduce((s, c) => s + c.usage, 0) / cores.length
    : 0;
  const ramPct = ram_total_mb > 0 ? (ram_used_mb / ram_total_mb) * 100 : 0;

  const rxTotal = interfaces.reduce((s, i) => s + i.rx_bytes_per_sec, 0);
  const txTotal = interfaces.reduce((s, i) => s + i.tx_bytes_per_sec, 0);
  const fmt = (b: number) => b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)}MB/s` : `${(b / 1024).toFixed(0)}KB/s`;

  return (
    <div style={{ display: 'flex', gap: 6, padding: '6px 12px',
      background: 'var(--mantle)', borderBottom: '1px solid var(--surface0)' }}>
      <Pill label="CPU" value={`${avgCpu.toFixed(1)}%`} pct={avgCpu} />
      <Pill label="MEM" value={`${(ram_used_mb / 1024).toFixed(1)}G`} pct={ramPct} />
      <Pill label="↓" value={fmt(rxTotal)} pct={Math.min(rxTotal / 10_485_760 * 100, 100)} />
      <Pill label="↑" value={fmt(txTotal)} pct={Math.min(txTotal / 10_485_760 * 100, 100)} />
      {available && <Pill label="GPU" value={`${(usage_percent ?? 0).toFixed(0)}%`} pct={usage_percent ?? 0} />}
    </div>
  );
}
