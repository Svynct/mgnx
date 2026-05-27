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

                thread::sleep(Duration::from_secs(1));
            }
        });
    }

    fn emit_processes(&self, sys: &System, users: &Users) {
        let mut entries: Vec<ProcessEntry> = sys
            .processes()
            .values()
            .map(|p| {
                let user = p
                    .user_id()
                    .and_then(|uid| users.get_user_by_id(uid))
                    .map(|u| u.name().to_string())
                    .unwrap_or_default();

                ProcessEntry {
                    pid: p.pid().as_u32(),
                    name: p.name().to_string_lossy().into_owned(),
                    cpu_percent: p.cpu_usage(),
                    memory_mb: p.memory() as f64 / 1_048_576.0,
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

fn parse_proc_connections() -> Vec<NetworkConnection> {
    let mut conns = Vec::new();
    for (path, proto) in &[("/proc/net/tcp", "TCP"), ("/proc/net/tcp6", "TCP6")] {
        let Ok(content) = std::fs::read_to_string(path) else { continue };
        for line in content.lines().skip(1) {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 4 {
                continue;
            }
            if let (Some(local_port), Some(remote), Some(state)) =
                (parse_hex_port(cols[1]), format_hex_addr(cols[2]), state_name(cols[3]))
            {
                conns.push(NetworkConnection {
                    proto: proto.to_string(),
                    local_port,
                    remote_addr: remote,
                    state: state.to_string(),
                });
            }
        }
    }
    conns
}

fn parse_hex_port(addr: &str) -> Option<u16> {
    addr.split(':').nth(1).and_then(|p| u16::from_str_radix(p, 16).ok())
}

fn format_hex_addr(addr: &str) -> Option<String> {
    let parts: Vec<&str> = addr.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let ip_hex = parts[0];
    let port = u16::from_str_radix(parts[1], 16).ok()?;
    if ip_hex.len() == 8 {
        let n = u32::from_str_radix(ip_hex, 16).ok()?;
        let b = n.to_le_bytes();
        Some(format!("{}.{}.{}.{}:{}", b[0], b[1], b[2], b[3], port))
    } else {
        Some(format!("[ipv6]:{}", port))
    }
}

fn state_name(hex: &str) -> Option<&'static str> {
    match hex {
        "01" => Some("ESTABLISHED"),
        "02" => Some("SYN_SENT"),
        "03" => Some("SYN_RECV"),
        "04" => Some("FIN_WAIT1"),
        "05" => Some("FIN_WAIT2"),
        "06" => Some("TIME_WAIT"),
        "07" => Some("CLOSE"),
        "08" => Some("CLOSE_WAIT"),
        "09" => Some("LAST_ACK"),
        "0A" => Some("LISTEN"),
        "0B" => Some("CLOSING"),
        _ => None,
    }
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
                name: "low".to_string(),
                cpu_percent: 1.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
            },
            ProcessEntry {
                pid: 2,
                name: "high".to_string(),
                cpu_percent: 99.0,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
            },
            ProcessEntry {
                pid: 3,
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
                name: "a".to_string(),
                cpu_percent: f32::NAN,
                memory_mb: 0.0,
                status: "R".to_string(),
                user: "u".to_string(),
                threads: 1,
            },
            ProcessEntry {
                pid: 2,
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

    #[test]
    fn parse_hex_port_returns_decimal_port() {
        assert_eq!(parse_hex_port("0100007F:0050"), Some(80)); // port 0x0050 = 80
        assert_eq!(parse_hex_port("0100007F:1F90"), Some(8080)); // 0x1F90 = 8080
        assert_eq!(parse_hex_port("no_colon"), None);
        assert_eq!(parse_hex_port(":ZZZZ"), None); // invalid hex
    }

    #[test]
    fn format_hex_addr_decodes_ipv4_little_endian() {
        // 0100007F = 127.0.0.1 in little-endian hex, port 0x0050 = 80
        let result = format_hex_addr("0100007F:0050");
        assert_eq!(result, Some("127.0.0.1:80".to_string()));

        // More than two colon-separated parts is rejected.
        let none = format_hex_addr("too:many:colons");
        assert!(none.is_none());
    }

    #[test]
    fn state_name_maps_known_states() {
        assert_eq!(state_name("01"), Some("ESTABLISHED"));
        assert_eq!(state_name("0A"), Some("LISTEN"));
        assert_eq!(state_name("FF"), None);
        assert_eq!(state_name(""), None);
    }
}
