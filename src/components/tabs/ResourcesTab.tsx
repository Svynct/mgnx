import { useResourceStore } from '../../stores/resourceStore';
import { useThermalStore } from '../../stores/thermalStore';
import { Sparkline } from '../Sparkline';

function UsageBar({ used, total, color }: { used: number; total: number; color: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: 'var(--surface0)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--overlay0)', minWidth: 80, textAlign: 'right' }}>
        {(used / 1024).toFixed(1)}G / {(total / 1024).toFixed(1)}G
      </span>
    </div>
  );
}

function tempHeat(c: number): string {
  if (c >= 90) return 'var(--red)';
  if (c >= 75) return 'var(--yellow)';
  return 'var(--green)';
}

function coreHeat(usage: number): string {
  if (usage >= 75) return 'var(--red)';
  if (usage >= 50) return 'var(--yellow)';
  if (usage >= 25) return '#c6a0f6';
  return 'var(--green)';
}

function formatMhz(mhz: number): string {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${mhz} MHz`;
}

export function ResourcesTab() {
  const { cpu_model, core_count, cores, ram_used_mb, ram_total_mb,
          swap_used_mb, swap_total_mb, cpuHistory, ramHistory } = useResourceStore();
  const { cpu_temp_c } = useThermalStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 500 }}>{cpu_model || 'CPU'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--overlay0)', fontSize: 11 }}>{core_count} cores</span>
            {cpu_temp_c !== null && (
              <span style={{ fontSize: 11, color: tempHeat(cpu_temp_c) }}>{cpu_temp_c.toFixed(0)}°C</span>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {cores.map((c) => (
            <div key={c.index}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 10, color: 'var(--overlay0)', marginBottom: 2,
              }}>
                <span>C{c.index}</span>
                {c.frequency_mhz !== null && <span>{formatMhz(c.frequency_mhz)}</span>}
              </div>
              <div style={{ height: 6, background: 'var(--surface0)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${c.usage}%`, height: '100%',
                  background: coreHeat(c.usage), borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <Sparkline data={cpuHistory} color="var(--mauve)" />
      </div>

      <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 12 }}>Memory</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--overlay0)', marginBottom: 4 }}>RAM</div>
          <UsageBar used={ram_used_mb} total={ram_total_mb} color="var(--blue)" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--overlay0)', marginBottom: 4 }}>Swap</div>
          <UsageBar used={swap_used_mb} total={swap_total_mb} color="var(--teal)" />
        </div>
        <Sparkline data={ramHistory} color="var(--blue)" />
      </div>
    </div>
  );
}
