use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub ppid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: f64,
    pub status: String,
    pub user: String,
    pub threads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuCoreUsage {
    pub index: usize,
    pub usage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcesPayload {
    pub cpu_model: String,
    pub core_count: usize,
    pub cores: Vec<CpuCoreUsage>,
    pub ram_used_mb: f64,
    pub ram_total_mb: f64,
    pub swap_used_mb: f64,
    pub swap_total_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConnection {
    pub proto: String,
    pub local_port: u16,
    pub remote_addr: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub is_up: bool,
    pub ip: String,
    pub link_speed_mbps: u64,
    pub rx_bytes_per_sec: f64,
    pub tx_bytes_per_sec: f64,
    pub rx_total_mb: f64,
    pub tx_total_mb: f64,
    pub connections: Vec<NetworkConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskEntry {
    pub mount: String,
    pub device: String,
    pub fs_type: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub read_bytes_per_sec: f64,
    pub write_bytes_per_sec: f64,
    pub inodes_used: u64,
    pub inodes_total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuProcess {
    pub pid: u32,
    pub name: String,
    pub vram_mb: u64,
    pub proc_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuPayload {
    pub vendor: String,
    pub name: String,
    pub driver_version: String,
    pub compute_version: String,
    pub usage_percent: f32,
    pub vram_used_mb: u64,
    pub vram_total_mb: u64,
    pub temperature_c: f32,
    pub power_draw_w: f32,
    pub power_limit_w: f32,
    pub core_clock_mhz: u32,
    pub mem_clock_mhz: u32,
    pub processes: Vec<GpuProcess>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessDetails {
    pub pid: u32,
    pub cmdline: String,
    pub cwd: String,
    pub fd_count: usize,
    pub env_count: usize,
    pub threads: Vec<ThreadInfo>,
    pub ppid: u32,
    pub start_time: String,
    pub cpu_time_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadInfo {
    pub tid: u32,
    pub state: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_entry_serde_roundtrip() {
        let entry = ProcessEntry {
            pid: 42,
            ppid: 1,
            name: "bash".to_string(),
            cpu_percent: 1.5,
            memory_mb: 128.0,
            status: "Running".to_string(),
            user: "alice".to_string(),
            threads: 2,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let decoded: ProcessEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.pid, 42);
        assert_eq!(decoded.name, "bash");
        assert!((decoded.cpu_percent - 1.5).abs() < f32::EPSILON);
    }

    #[test]
    fn resources_payload_serde_roundtrip() {
        let payload = ResourcesPayload {
            cpu_model: "AMD Ryzen 9".to_string(),
            core_count: 16,
            cores: vec![CpuCoreUsage { index: 0, usage: 25.5 }],
            ram_used_mb: 8192.0,
            ram_total_mb: 32768.0,
            swap_used_mb: 0.0,
            swap_total_mb: 8192.0,
        };
        let json = serde_json::to_string(&payload).unwrap();
        let decoded: ResourcesPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.core_count, 16);
        assert_eq!(decoded.cores.len(), 1);
        assert_eq!(decoded.cores[0].index, 0);
    }

    #[test]
    fn gpu_payload_serde_roundtrip() {
        let payload = GpuPayload {
            vendor: "nvidia".to_string(),
            name: "RTX 4090".to_string(),
            driver_version: "545.0".to_string(),
            compute_version: "12.3".to_string(),
            usage_percent: 85.0,
            vram_used_mb: 8192,
            vram_total_mb: 24576,
            temperature_c: 72.0,
            power_draw_w: 280.0,
            power_limit_w: 350.0,
            core_clock_mhz: 2520,
            mem_clock_mhz: 10501,
            processes: vec![GpuProcess {
                pid: 1234,
                name: "firefox".to_string(),
                vram_mb: 512,
                proc_type: "Render".to_string(),
            }],
        };
        let json = serde_json::to_string(&payload).unwrap();
        let decoded: GpuPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.vendor, "nvidia");
        assert_eq!(decoded.processes.len(), 1);
        assert_eq!(decoded.processes[0].pid, 1234);
    }

    #[test]
    fn process_details_serde_roundtrip() {
        let details = ProcessDetails {
            pid: 100,
            cmdline: "/usr/bin/bash".to_string(),
            cwd: "/home/user".to_string(),
            fd_count: 10,
            env_count: 42,
            threads: vec![ThreadInfo { tid: 100, state: "S".to_string() }],
            ppid: 1,
            start_time: "120s ago".to_string(),
            cpu_time_s: 3.14,
        };
        let json = serde_json::to_string(&details).unwrap();
        let decoded: ProcessDetails = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.pid, 100);
        assert_eq!(decoded.threads.len(), 1);
        assert_eq!(decoded.threads[0].tid, 100);
    }

    #[test]
    fn network_interface_serde_roundtrip() {
        let iface = NetworkInterface {
            name: "eth0".to_string(),
            is_up: true,
            ip: "192.168.1.1".to_string(),
            link_speed_mbps: 1000,
            rx_bytes_per_sec: 1024.0,
            tx_bytes_per_sec: 512.0,
            rx_total_mb: 1024.0,
            tx_total_mb: 256.0,
            connections: vec![NetworkConnection {
                proto: "TCP".to_string(),
                local_port: 8080,
                remote_addr: "1.2.3.4:443".to_string(),
                state: "ESTABLISHED".to_string(),
            }],
        };
        let json = serde_json::to_string(&iface).unwrap();
        let decoded: NetworkInterface = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.name, "eth0");
        assert!(decoded.is_up);
        assert_eq!(decoded.connections.len(), 1);
    }

    #[test]
    fn disk_entry_serde_roundtrip() {
        let disk = DiskEntry {
            mount: "/".to_string(),
            device: "/dev/sda1".to_string(),
            fs_type: "ext4".to_string(),
            used_bytes: 100_000_000,
            total_bytes: 500_000_000,
            read_bytes_per_sec: 0.0,
            write_bytes_per_sec: 0.0,
            inodes_used: 50000,
            inodes_total: 1000000,
        };
        let json = serde_json::to_string(&disk).unwrap();
        let decoded: DiskEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.mount, "/");
        assert_eq!(decoded.used_bytes, 100_000_000);
    }
}
