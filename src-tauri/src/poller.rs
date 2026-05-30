use std::collections::HashMap;
use std::thread;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, Users};
use tauri::{AppHandle, Emitter};

use crate::types::{BatteryInfo, CpuCoreUsage, DiskEntry, NetworkConnection, NetworkInterface, ProcessEntry, ResourcesPayload};

pub struct SystemPoller {
    pub handle: AppHandle,
    pub gpu_backend: crate::gpu::GpuBackend,
    networks: Networks,
    disks: Disks,
    prev_rx: HashMap<String, u64>,
    prev_tx: HashMap<String, u64>,
    // device name → (sectors_read, sectors_written) from previous tick
    prev_disk_sectors: HashMap<String, (u64, u64)>,
    // pid → last-read PSS in MB; refreshed every 3rd tick to amortize /proc I/O.
    pss_cache: HashMap<u32, f64>,
    pss_tick: u32,
    // pid → (read_bytes, write_bytes) from previous tick; used for delta rate calc.
    prev_proc_io: HashMap<u32, (u64, u64)>,
    config: crate::config::AppConfig,
}

impl SystemPoller {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            gpu_backend: crate::gpu::detect_gpu(),
            handle,
            networks: Networks::new_with_refreshed_list(),
            disks: Disks::new_with_refreshed_list(),
            prev_rx: HashMap::new(),
            prev_tx: HashMap::new(),
            prev_disk_sectors: HashMap::new(),
            pss_cache: HashMap::new(),
            pss_tick: 0,
            prev_proc_io: HashMap::new(),
            config: crate::config::load(),
        }
    }

    pub fn start(mut self) {
        thread::spawn(move || {
            let mut sys = System::new_with_specifics(
                RefreshKind::new()
                    .with_cpu(CpuRefreshKind::everything())
                    .with_memory(MemoryRefreshKind::everything())
                    .with_processes(ProcessRefreshKind::everything()),
            );
            let mut users = Users::new_with_refreshed_list();
            let gpu_available = !matches!(self.gpu_backend, crate::gpu::GpuBackend::None);
            let mut tick: u32 = 0;

            loop {
                sys.refresh_cpu_specifics(CpuRefreshKind::everything());
                sys.refresh_memory();
                sys.refresh_processes_specifics(
                    ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::everything(),
                );
                // Users change rarely; refresh every 30 ticks (≈30s).
                if tick.is_multiple_of(30) { users.refresh_list(); }
                tick = tick.wrapping_add(1);
                self.networks.refresh();
                self.disks.refresh();

                self.emit_processes(&sys, &users);
                self.emit_resources(&sys);
                self.emit_network();
                self.emit_connections();
                self.emit_disks();
                self.emit_thermal();
                self.emit_battery();
                crate::gpu::poll_gpu(&self.gpu_backend, &self.handle);
                // Re-broadcast each tick: the one-shot emit at setup races the
                // webview mounting its listener and is usually missed.
                let _ = self.handle.emit("gpu-available", gpu_available);

                let interval_ms = (1000.0 / self.config.refresh_rate_hz).max(1.0) as u64;
                thread::sleep(Duration::from_millis(interval_ms));
            }
        });
    }

    fn emit_processes(&mut self, sys: &System, users: &Users) {
        // sysinfo's cpu_usage() is per-core (100% = one full core, can exceed 100%
        // for multi-threaded procs). Divide by core count so 100% = all cores busy.
        let cpu_count = sys.cpus().len().max(1) as f32;

        // Refresh PSS from /proc every 3rd tick; otherwise serve cached values.
        // This cuts /proc reads from N/tick to N/3 ticks on busy systems.
        self.pss_tick = self.pss_tick.wrapping_add(1);
        let refresh_pss = self.pss_tick.is_multiple_of(3);

        let mut entries: Vec<ProcessEntry> = sys
            .processes()
            .values()
            // sysinfo lists threads as separate entries on Linux; each shares its
            // process's address space, so including them multiplies memory by the
            // thread count. Keep only real processes.
            .filter(|p| p.thread_kind().is_none())
            .map(|p| {
                let pid = p.pid().as_u32();
                let user = p
                    .user_id()
                    .and_then(|uid| users.get_user_by_id(uid))
                    .map(|u| u.name().to_string())
                    .unwrap_or_default();

                let memory_mb = if refresh_pss {
                    let pss = read_pss_mb(pid)
                        .unwrap_or_else(|| p.memory() as f64 / 1_048_576.0);
                    self.pss_cache.insert(pid, pss);
                    pss
                } else {
                    *self.pss_cache.get(&pid)
                        .unwrap_or(&(p.memory() as f64 / 1_048_576.0))
                };

                let (
                    disk_read_bytes_per_sec,
                    disk_write_bytes_per_sec,
                    disk_read_total_mb,
                    disk_write_total_mb,
                ) = match read_pid_io(pid) {
                    Some((read_now, write_now)) => {
                        let (read_per_sec, write_per_sec) = match self.prev_proc_io.get(&pid) {
                            Some(&(prev_r, prev_w)) => (
                                read_now.saturating_sub(prev_r) as f64,
                                write_now.saturating_sub(prev_w) as f64,
                            ),
                            None => (0.0, 0.0),
                        };
                        self.prev_proc_io.insert(pid, (read_now, write_now));
                        (
                            Some(read_per_sec),
                            Some(write_per_sec),
                            Some(read_now as f64 / 1_048_576.0),
                            Some(write_now as f64 / 1_048_576.0),
                        )
                    }
                    None => (None, None, None, None),
                };

                ProcessEntry {
                    pid,
                    ppid: p.parent().map(|pp| pp.as_u32()).unwrap_or(0),
                    name: p.name().to_string_lossy().into_owned(),
                    cpu_percent: p.cpu_usage() / cpu_count,
                    memory_mb,
                    status: format!("{:?}", p.status()),
                    user,
                    threads: p.tasks().map(|t| t.len() as u32).unwrap_or(1),
                    disk_read_bytes_per_sec,
                    disk_write_bytes_per_sec,
                    disk_read_total_mb,
                    disk_write_total_mb,
                }
            })
            .collect();

        // GC: drop prev_proc_io entries for pids no longer alive. Prevents both
        // unbounded growth and pid-recycle giving a bogus huge delta on first sight.
        let live_pids: std::collections::HashSet<u32> =
            entries.iter().map(|e| e.pid).collect();
        self.prev_proc_io.retain(|pid, _| live_pids.contains(pid));

        entries.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        if let Err(e) = self.handle.emit("processes-update", entries) {
            eprintln!("emit processes-update failed: {e}");
        }
    }

    fn emit_resources(&self, sys: &System) {
        let cpus = sys.cpus();
        let model = cpus.first().map(|c| c.brand().to_string()).unwrap_or_default();
        let cores: Vec<CpuCoreUsage> = cpus
            .iter()
            .enumerate()
            .map(|(i, c)| CpuCoreUsage {
                index: i,
                usage: c.cpu_usage(),
                frequency_mhz: read_cpu_freq_mhz(i),
            })
            .collect();

        let payload = ResourcesPayload {
            cpu_model: model,
            core_count: cpus.len(),
            cores,
            ram_used_mb: sys.used_memory() as f64 / 1_048_576.0,
            ram_total_mb: sys.total_memory() as f64 / 1_048_576.0,
            swap_used_mb: sys.used_swap() as f64 / 1_048_576.0,
            swap_total_mb: sys.total_swap() as f64 / 1_048_576.0,
        };

        if let Err(e) = self.handle.emit("resources-update", payload) {
            eprintln!("emit resources-update failed: {e}");
        }
    }

    fn emit_network(&mut self) {
        let ips = interface_ips();
        // Collect immutable borrow of `networks` before mutating `prev_*` maps.
        let snapshots: Vec<(String, u64, u64, bool)> = self
            .networks
            .iter()
            .map(|(name, data)| {
                let is_up = data.mac_address().to_string() != "00:00:00:00:00:00";
                (name.clone(), data.total_received(), data.total_transmitted(), is_up)
            })
            .collect();

        let ifaces: Vec<NetworkInterface> = snapshots
            .into_iter()
            .map(|(name, rx_now, tx_now, is_up)| {
                let rx_per_sec =
                    rx_now.saturating_sub(*self.prev_rx.get(&name).unwrap_or(&rx_now)) as f64;
                let tx_per_sec =
                    tx_now.saturating_sub(*self.prev_tx.get(&name).unwrap_or(&tx_now)) as f64;
                self.prev_rx.insert(name.clone(), rx_now);
                self.prev_tx.insert(name.clone(), tx_now);

                NetworkInterface {
                    ip: ips.get(&name).cloned().unwrap_or_default(),
                    name,
                    is_up,
                    link_speed_mbps: 0,
                    rx_bytes_per_sec: rx_per_sec,
                    tx_bytes_per_sec: tx_per_sec,
                    rx_total_mb: rx_now as f64 / 1_048_576.0,
                    tx_total_mb: tx_now as f64 / 1_048_576.0,
                }
            })
            .collect();

        if let Err(e) = self.handle.emit("network-update", ifaces) {
            eprintln!("emit network-update failed: {e}");
        }
    }

    fn emit_connections(&self) {
        let conns = parse_proc_connections();
        if let Err(e) = self.handle.emit("connections-update", conns) {
            eprintln!("emit connections-update failed: {e}");
        }
    }

    fn emit_thermal(&self) {
        let payload = crate::parse::read_thermal();
        if let Err(e) = self.handle.emit("thermal-update", payload) {
            eprintln!("emit thermal-update failed: {e}");
        }
    }

    fn emit_battery(&self) {
        let payload = read_battery();
        if let Err(e) = self.handle.emit("battery-update", payload) {
            eprintln!("emit battery-update failed: {e}");
        }
    }

    fn emit_disks(&mut self) {
        let diskstats = std::fs::read_to_string("/proc/diskstats")
            .map(|s| crate::parse::parse_diskstats(&s))
            .unwrap_or_default();

        let entries: Vec<DiskEntry> = self
            .disks
            .iter()
            .map(|d| {
                let mount = d.mount_point().to_string_lossy().into_owned();
                // sysinfo returns device path like "/dev/sda1"; strip prefix for diskstats lookup.
                let raw_dev = d.name().to_string_lossy().into_owned();
                let dev_key = raw_dev.trim_start_matches("/dev/").to_string();

                let (read_bps, write_bps) = if let Some(&(r_now, w_now)) = diskstats.get(&dev_key) {
                    let (r_prev, w_prev) = self.prev_disk_sectors.get(&dev_key).copied().unwrap_or((r_now, w_now));
                    let rbps = r_now.saturating_sub(r_prev) as f64 * 512.0;
                    let wbps = w_now.saturating_sub(w_prev) as f64 * 512.0;
                    (rbps, wbps)
                } else {
                    (0.0, 0.0)
                };

                let (inodes_used, inodes_total) = statvfs_inodes(&mount);

                DiskEntry {
                    mount,
                    device: raw_dev,
                    fs_type: d.file_system().to_string_lossy().into_owned(),
                    used_bytes: d.total_space() - d.available_space(),
                    total_bytes: d.total_space(),
                    read_bytes_per_sec: read_bps,
                    write_bytes_per_sec: write_bps,
                    inodes_used,
                    inodes_total,
                }
            })
            .collect();

        // Update prev counters after building entries.
        for (dev, counts) in diskstats {
            self.prev_disk_sectors.insert(dev, counts);
        }

        if let Err(e) = self.handle.emit("disk-update", entries) {
            eprintln!("emit disk-update failed: {e}");
        }
    }
}

/// Returns a map of interface name → first IPv4 address string via getifaddrs.
fn interface_ips() -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(addrs) = nix::ifaddrs::getifaddrs() {
        for addr in addrs {
            if let Some(storage) = addr.address {
                if let Some(sin) = storage.as_sockaddr_in() {
                    map.entry(addr.interface_name).or_insert_with(|| {
                        format!("{}", sin.ip())
                    });
                }
            }
        }
    }
    map
}

/// Returns (inodes_used, inodes_total) for the filesystem at `mount` via statvfs.
/// Returns (0, 0) when the call fails (e.g. permission or unsupported fs).
fn statvfs_inodes(mount: &str) -> (u64, u64) {
    use std::ffi::CString;
    let path = CString::new(mount).unwrap_or_default();
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    let ret = unsafe { libc::statvfs(path.as_ptr(), &mut st) };
    if ret != 0 { return (0, 0); }
    let total = st.f_files;
    let free  = st.f_ffree;
    (total.saturating_sub(free), total)
}

// Reads /proc/<pid>/smaps_rollup and returns its PSS in MB (None when unreadable —
// kernel threads or processes owned by another user). Parsing lives in parse::pss_mb.
fn read_pss_mb(pid: u32) -> Option<f64> {
    let content = std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup")).ok()?;
    crate::parse::pss_mb(&content)
}

// Reads /proc/<pid>/io and returns (read_bytes, write_bytes). None covers both
// permission-denied (foreign uid) and "process disappeared between scan and read"
// — caller treats them identically (emit None to UI as a dash).
fn read_pid_io(pid: u32) -> Option<(u64, u64)> {
    let content = std::fs::read_to_string(format!("/proc/{pid}/io")).ok()?;
    crate::parse::parse_pid_io(&content)
}

// Reads /sys/devices/system/cpu/cpu<N>/cpufreq/scaling_cur_freq and converts
// kHz → MHz. None on systems without cpufreq (some VMs, older kernels).
fn read_cpu_freq_mhz(index: usize) -> Option<u32> {
    let content = std::fs::read_to_string(
        format!("/sys/devices/system/cpu/cpu{index}/cpufreq/scaling_cur_freq")
    ).ok()?;
    crate::parse::parse_cpu_freq_mhz(&content)
}

// Scans /sys/class/power_supply/ for a BAT* entry and reads its charge state.
// None when the directory is missing or no battery is present (desktops, VMs).
fn read_battery() -> Option<BatteryInfo> {
    let dir = std::fs::read_dir("/sys/class/power_supply/").ok()?;
    let bat_path = dir
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.to_uppercase().starts_with("BAT"))
            .unwrap_or(false))?;

    let read_u64 = |name: &str| -> Option<u64> {
        std::fs::read_to_string(bat_path.join(name))
            .ok()
            .and_then(|s| crate::parse::parse_sysfs_uint(&s))
    };
    let read_str = |name: &str| -> Option<String> {
        std::fs::read_to_string(bat_path.join(name))
            .ok()
            .map(|s| s.trim().to_string())
    };

    let percentage = read_u64("capacity")? as u8;
    let status = read_str("status").unwrap_or_else(|| "Unknown".to_string());

    let time_remaining_secs = match (read_u64("energy_full"), read_u64("energy_now"), read_u64("power_now")) {
        (Some(full), Some(now), Some(rate)) =>
            crate::parse::battery_time_remaining_secs(&status, now, full, rate),
        _ => match (read_u64("charge_full"), read_u64("charge_now"), read_u64("current_now")) {
            (Some(full), Some(now), Some(rate)) =>
                crate::parse::battery_time_remaining_secs(&status, now, full, rate),
            _ => None,
        },
    };

    Some(BatteryInfo { percentage, status, time_remaining_secs })
}

fn parse_proc_connections() -> Vec<NetworkConnection> {
    let mut conns = Vec::new();
    for (path, proto) in &[("/proc/net/tcp", "TCP"), ("/proc/net/tcp6", "TCP6")] {
        let Ok(content) = std::fs::read_to_string(path) else { continue };
        conns.extend(
            content
                .lines()
                .skip(1)
                .filter_map(|line| crate::parse::connection_line(proto, line)),
        );
    }
    conns
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_entry_sort_by_cpu_descending() {
        // Verify that sorting logic puts highest CPU first
        let mut entries = vec![
            ProcessEntry {
                pid: 1,
                ppid: 0,
                name: "low".to_string(),
                cpu_percent: 1.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
                disk_read_bytes_per_sec: None,
                disk_write_bytes_per_sec: None,
                disk_read_total_mb: None,
                disk_write_total_mb: None,
            },
            ProcessEntry {
                pid: 2,
                ppid: 0,
                name: "high".to_string(),
                cpu_percent: 99.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
                disk_read_bytes_per_sec: None,
                disk_write_bytes_per_sec: None,
                disk_read_total_mb: None,
                disk_write_total_mb: None,
            },
            ProcessEntry {
                pid: 3,
                ppid: 0,
                name: "mid".to_string(),
                cpu_percent: 50.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
                disk_read_bytes_per_sec: None,
                disk_write_bytes_per_sec: None,
                disk_read_total_mb: None,
                disk_write_total_mb: None,
            },
        ];
        entries.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        assert_eq!(entries[0].pid, 2);
        assert_eq!(entries[1].pid, 3);
        assert_eq!(entries[2].pid, 1);
    }

    #[test]
    fn process_entry_sort_handles_nan() {
        // NaN cpu_percent should not panic (unwrap_or(Equal) fallback)
        let mut entries = vec![
            ProcessEntry {
                pid: 1,
                ppid: 0,
                name: "a".to_string(),
                cpu_percent: f32::NAN,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
                disk_read_bytes_per_sec: None,
                disk_write_bytes_per_sec: None,
                disk_read_total_mb: None,
                disk_write_total_mb: None,
            },
            ProcessEntry {
                pid: 2,
                ppid: 0,
                name: "b".to_string(),
                cpu_percent: 5.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
                disk_read_bytes_per_sec: None,
                disk_write_bytes_per_sec: None,
                disk_read_total_mb: None,
                disk_write_total_mb: None,
            },
        ];
        // Should not panic:
        entries.sort_by(|a, b| {
            b.cpu_percent
                .partial_cmp(&a.cpu_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        // Just verify it completed without panic
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn memory_mb_conversion_is_correct() {
        // 1 MiB = 1_048_576 bytes
        let bytes: u64 = 1_048_576;
        let mb = bytes as f64 / 1_048_576.0;
        assert!((mb - 1.0).abs() < f64::EPSILON);

        let bytes_16gb: u64 = 16 * 1024 * 1024 * 1024;
        let mb_16gb = bytes_16gb as f64 / 1_048_576.0;
        assert!((mb_16gb - 16384.0).abs() < f64::EPSILON);
    }
}
