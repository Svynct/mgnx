use std::collections::HashMap;
use std::thread;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, Users};
use tauri::{AppHandle, Emitter};

use crate::types::{CpuCoreUsage, DiskEntry, NetworkConnection, NetworkInterface, ProcessEntry, ResourcesPayload};

pub struct SystemPoller {
    pub handle: AppHandle,
    pub gpu_backend: crate::gpu::GpuBackend,
    networks: Networks,
    disks: Disks,
    prev_rx: HashMap<String, u64>,
    prev_tx: HashMap<String, u64>,
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

            loop {
                sys.refresh_cpu_specifics(CpuRefreshKind::everything());
                sys.refresh_memory();
                sys.refresh_processes_specifics(
                    ProcessesToUpdate::All,
                    true,
                    ProcessRefreshKind::everything(),
                );
                users.refresh_list();
                self.networks.refresh();
                self.disks.refresh();

                self.emit_processes(&sys, &users);
                self.emit_resources(&sys);
                self.emit_network();
                self.emit_disks();
                crate::gpu::poll_gpu(&self.gpu_backend, &self.handle);
                // Re-broadcast each tick: the one-shot emit at setup races the
                // webview mounting its listener and is usually missed.
                let _ = self.handle.emit("gpu-available", gpu_available);

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    fn emit_processes(&self, sys: &System, users: &Users) {
        // sysinfo's cpu_usage() is per-core (100% = one full core, can exceed 100%
        // for multi-threaded procs). Divide by core count so 100% = all cores busy.
        let cpu_count = sys.cpus().len().max(1) as f32;
        let mut entries: Vec<ProcessEntry> = sys
            .processes()
            .values()
            // sysinfo lists threads as separate entries on Linux; each shares its
            // process's address space, so including them multiplies memory by the
            // thread count. Keep only real processes.
            .filter(|p| p.thread_kind().is_none())
            .map(|p| {
                let user = p
                    .user_id()
                    .and_then(|uid| users.get_user_by_id(uid))
                    .map(|u| u.name().to_string())
                    .unwrap_or_default();

                ProcessEntry {
                    pid: p.pid().as_u32(),
                    ppid: p.parent().map(|pp| pp.as_u32()).unwrap_or(0),
                    name: p.name().to_string_lossy().into_owned(),
                    cpu_percent: p.cpu_usage() / cpu_count,
                    // PSS (proportional set size) so a subtree sum can't exceed
                    // physical RAM; RSS would double-count shared pages. Falls
                    // back to RSS when smaps_rollup is unreadable.
                    memory_mb: read_pss_mb(p.pid().as_u32())
                        .unwrap_or_else(|| p.memory() as f64 / 1_048_576.0),
                    status: format!("{:?}", p.status()),
                    user,
                    threads: p.tasks().map(|t| t.len() as u32).unwrap_or(1),
                }
            })
            .collect();

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
        let conns = parse_proc_connections();

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
                    name,
                    is_up,
                    ip: String::new(),
                    link_speed_mbps: 0,
                    rx_bytes_per_sec: rx_per_sec,
                    tx_bytes_per_sec: tx_per_sec,
                    rx_total_mb: rx_now as f64 / 1_048_576.0,
                    tx_total_mb: tx_now as f64 / 1_048_576.0,
                    connections: conns.clone(),
                }
            })
            .collect();

        if let Err(e) = self.handle.emit("network-update", ifaces) {
            eprintln!("emit network-update failed: {e}");
        }
    }

    fn emit_disks(&self) {
        let entries: Vec<DiskEntry> = self
            .disks
            .iter()
            .map(|d| DiskEntry {
                mount: d.mount_point().to_string_lossy().into_owned(),
                device: d.name().to_string_lossy().into_owned(),
                fs_type: d.file_system().to_string_lossy().into_owned(),
                used_bytes: d.total_space() - d.available_space(),
                total_bytes: d.total_space(),
                read_bytes_per_sec: 0.0,
                write_bytes_per_sec: 0.0,
                inodes_used: 0,
                inodes_total: 0,
            })
            .collect();

        if let Err(e) = self.handle.emit("disk-update", entries) {
            eprintln!("emit disk-update failed: {e}");
        }
    }
}

// Reads /proc/<pid>/smaps_rollup and returns its PSS in MB (None when unreadable —
// kernel threads or processes owned by another user). Parsing lives in parse::pss_mb.
fn read_pss_mb(pid: u32) -> Option<f64> {
    let content = std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup")).ok()?;
    crate::parse::pss_mb(&content)
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
