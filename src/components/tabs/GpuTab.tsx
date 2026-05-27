import { useGpuStore } from '../../stores/gpuStore';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface0)', borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--overlay0)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

export function GpuTab() {
  const gpu = useGpuStore();

  if (!gpu.available || !gpu.name) {
    return <div style={{ color: 'var(--overlay0)', padding: 20 }}>No supported GPU detected.</div>;
  }

  const vramPct = gpu.vram_total_mb && gpu.vram_total_mb > 0
    ? ((gpu.vram_used_mb ?? 0) / gpu.vram_total_mb) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{gpu.name}</div>
          <div style={{ fontSize: 11, color: 'var(--overlay0)', marginTop: 4 }}>
            Driver {gpu.driver_version} · {gpu.compute_version}
          </div>
        </div>
        <span className="badge active">
          {(gpu.vendor ?? '').toUpperCase()} · {gpu.vendor === 'nvidia' ? 'nvml' : 'rocm'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <MetricCard label="GPU Usage" value={`${(gpu.usage_percent ?? 0).toFixed(1)}%`} />
        <MetricCard label="VRAM" value={`${gpu.vram_used_mb ?? 0} / ${gpu.vram_total_mb ?? 0} MB`} />
        <MetricCard label="Temperature" value={`${(gpu.temperature_c ?? 0).toFixed(0)}°C`} />
        <MetricCard label="Power" value={`${(gpu.power_draw_w ?? 0).toFixed(0)}W / ${(gpu.power_limit_w ?? 0).toFixed(0)}W`} />
        <MetricCard label="Core Clock" value={`${gpu.core_clock_mhz ?? 0} MHz`} />
        <MetricCard label="Mem Clock" value={`${gpu.mem_clock_mhz ?? 0} MHz`} />
      </div>

      <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--overlay0)', marginBottom: 6 }}>VRAM Usage</div>
        <div style={{ height: 8, background: 'var(--surface0)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${vramPct}%`, height: '100%',
            background: 'var(--mauve)', borderRadius: 4 }} />
        </div>
      </div>

      {gpu.processes && gpu.processes.length > 0 && (
        <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--overlay0)', marginBottom: 8 }}>GPU Processes</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--overlay0)', borderBottom: '1px solid var(--surface0)' }}>
                <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 400 }}>PID</th>
                <th style={{ textAlign: 'left', fontWeight: 400 }}>Name</th>
                <th style={{ textAlign: 'right', fontWeight: 400 }}>VRAM</th>
                <th style={{ textAlign: 'left', fontWeight: 400 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {gpu.processes.map((p) => (
                <tr key={p.pid}>
                  <td>{p.pid}</td>
                  <td>{p.name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{p.vram_mb} MB</td>
                  <td style={{ color: 'var(--overlay0)' }}>{p.proc_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
