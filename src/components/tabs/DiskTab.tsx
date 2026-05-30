import { useDiskStore, DiskEntry, DiskHistory } from '../../stores/diskStore';
import { useThermalStore, DriveTemp } from '../../stores/thermalStore';
import { useConfigStore } from '../../stores/configStore';
import { formatTemp } from '../../lib/temp';
import { Sparkline } from '../Sparkline';

function fmtBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9)  return `${(b / 1e9).toFixed(1)} GB`;
  return `${(b / 1e6).toFixed(0)} MB`;
}

function fmtSpeed(bps: number): string {
  if (bps >= 1_048_576) return `${(bps / 1_048_576).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

function driveTempColor(c: number | null): string {
  if (c === null) return 'var(--overlay0)';
  if (c >= 65) return 'var(--red)';
  if (c >= 50) return 'var(--yellow)';
  return 'var(--green)';
}

function DriveTempSection({ drives }: { drives: DriveTemp[] }) {
  const tempUnit = useConfigStore((s) => s.config.temperature_unit);
  if (drives.length === 0) return null;
  return (
    <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 500, marginBottom: 10 }}>Drive Temperatures</div>
      {drives.map((d, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
          marginBottom: i < drives.length - 1 ? 6 : 0 }}>
          <span style={{ color: 'var(--text)' }}>{d.name}</span>
          <span style={{ color: driveTempColor(d.temp_c) }}>
            {d.temp_c !== null ? formatTemp(d.temp_c, tempUnit) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiskCard({ disk, history }: { disk: DiskEntry; history: DiskHistory | undefined }) {
  const usedPct = disk.total_bytes > 0 ? (disk.used_bytes / disk.total_bytes) * 100 : 0;
  const inodePct = disk.inodes_total > 0 ? (disk.inodes_used / disk.inodes_total) * 100 : 0;
  const barColor = usedPct >= 90 ? 'var(--red)' : usedPct >= 75 ? 'var(--yellow)' : 'var(--teal)';

  return (
    <div style={{ background: 'var(--mantle)', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>{disk.mount}</span>
        <span style={{ fontSize: 11, color: 'var(--overlay0)' }}>
          {disk.device} · {disk.fs_type}
        </span>
      </div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
          <span style={{ color: 'var(--overlay0)' }}>Used</span>
          <span>{fmtBytes(disk.used_bytes)} / {fmtBytes(disk.total_bytes)} ({usedPct.toFixed(1)}%)</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface0)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${usedPct}%`, height: '100%', background: barColor, borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12, fontSize: 12 }}>
        <div>
          <div style={{ color: 'var(--overlay0)', fontSize: 10 }}>Read</div>
          <div>{fmtSpeed(disk.read_bytes_per_sec)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--overlay0)', fontSize: 10 }}>Write</div>
          <div>{fmtSpeed(disk.write_bytes_per_sec)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--overlay0)', fontSize: 10 }}>Free</div>
          <div>{fmtBytes(disk.total_bytes - disk.used_bytes)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--overlay0)', fontSize: 10 }}>Inodes</div>
          <div>{inodePct > 0 ? `${inodePct.toFixed(1)}%` : 'N/A'}</div>
        </div>
      </div>
      {history && history.read.length >= 2 && history.write.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <Sparkline data={history.read} color="var(--teal)" max={Math.max(...history.read, 1)} />
          <Sparkline data={history.write} color="var(--yellow)" max={Math.max(...history.write, 1)} />
        </div>
      )}
    </div>
  );
}

export function DiskTab() {
  const { disks, diskHistory } = useDiskStore();
  const { drives } = useThermalStore();
  if (disks.length === 0) {
    return <div style={{ color: 'var(--overlay0)', padding: 20 }}>No disks detected.</div>;
  }
  return (
    <div>
      <DriveTempSection drives={drives} />
      {disks.map((d) => <DiskCard key={d.mount} disk={d} history={diskHistory[d.mount]} />)}
    </div>
  );
}
