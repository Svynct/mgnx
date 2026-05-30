//! Pure parsing / validation / formatting logic, separated from I/O (file reads,
//! syscalls, NVML, Tauri emit) so it can be unit-tested in isolation. The thin I/O
//! wrappers live in poller.rs / commands.rs / gpu.rs and call into here.

use std::path::Path;

use crate::types::{DriveTemp, GpuPayload, NetworkConnection, ThermalPayload};

// ── process signal / priority validation ────────────────────────────────────

/// Linux pids fit in an i32; a u32 above i32::MAX would wrap to a negative value
/// and `kill(-1, …)` would signal every process, so reject it explicitly.
pub fn pid_to_raw(pid: u32) -> Result<i32, String> {
    i32::try_from(pid).map_err(|_| format!("invalid pid {pid}: exceeds i32::MAX"))
}

/// nice values run -20..=19; anything else is rejected before the syscall.
pub fn validate_priority(priority: i32) -> Result<(), String> {
    if (-20..=19).contains(&priority) {
        Ok(())
    } else {
        Err(format!("priority {priority} out of range -20..19"))
    }
}

// ── /proc/<pid> parsing for process details ──────────────────────────────────

/// Returns the 1-indexed field from a /proc/<pid>/stat line. comm (field 1) can
/// contain spaces inside parens, so fields are read after the closing ')'.
pub fn stat_field(stat: &str, index: usize) -> Option<String> {
    let after_comm = stat.find(')')? + 2;
    let fields: Vec<&str> = stat[after_comm..].split_whitespace().collect();
    let adjusted = index.checked_sub(2)?;
    fields.get(adjusted).map(|s| s.to_string())
}

/// Extracts the thread state token from a /proc/<pid>/task/<tid>/status body.
pub fn thread_state(status: &str) -> Option<String> {
    status
        .lines()
        .find(|l| l.starts_with("State:"))?
        .split_whitespace()
        .nth(1)
        .map(|s| s.to_string())
}

/// /proc/<pid>/cmdline is NUL-separated; turn it into a readable command string.
pub fn clean_cmdline(raw: &str) -> String {
    raw.replace('\0', " ").trim().to_string()
}

/// /proc/<pid>/environ is NUL-separated; count the non-empty entries.
pub fn count_env(environ: &str) -> usize {
    environ.split('\0').filter(|e| !e.is_empty()).count()
}

/// CPU seconds consumed = (utime + stime) ticks / ticks-per-second.
pub fn cpu_time_secs(utime: u64, stime: u64, clk_tck: f64) -> f64 {
    (utime + stime) as f64 / clk_tck
}

/// Human-readable "N[s|m|h|d] ago" from system uptime and the process start time (in clock ticks).
pub fn format_start_time(uptime_s: f64, start_ticks: u64, clk_tck: f64) -> String {
    let secs = (uptime_s - (start_ticks as f64 / clk_tck)).max(0.0) as u64;
    match secs {
        s if s < 120     => format!("{}s ago", s),
        s if s < 7_200   => format!("{}m ago", s / 60),
        s if s < 172_800 => format!("{}h ago", s / 3_600),
        s                => format!("{}d ago", s / 86_400),
    }
}

/// First whitespace-separated number from /proc/uptime.
pub fn parse_uptime(content: &str) -> f64 {
    content
        .split_whitespace()
        .next()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0)
}

// ── memory ────────────────────────────────────────────────────────────────────

/// Proportional Set Size in MB from a /proc/<pid>/smaps_rollup body. PSS splits
/// shared pages across sharers, so summing it never exceeds physical RAM.
pub fn pss_mb(smaps_rollup: &str) -> Option<f64> {
    for line in smaps_rollup.lines() {
        if let Some(rest) = line.strip_prefix("Pss:") {
            let kb: f64 = rest.split_whitespace().next()?.parse().ok()?;
            return Some(kb / 1024.0);
        }
    }
    None
}

/// Reads scaling_cur_freq content (a single integer in kHz) and returns the value
/// in MHz. Returns None when the input is empty or malformed.
pub fn parse_cpu_freq_mhz(content: &str) -> Option<u32> {
    let khz: u64 = content.trim().parse().ok()?;
    Some((khz / 1000) as u32)
}

/// Parses a single-line uint sysfs file body. Strips whitespace. Returns None
/// on malformed input.
pub fn parse_sysfs_uint(content: &str) -> Option<u64> {
    content.trim().parse().ok()
}

/// Computes battery time remaining in seconds. Units must match (µWh + µW,
/// or µAh + µA). Returns None when status is neither Charging nor
/// Discharging, the rate is 0, or charging with current >= full.
pub fn battery_time_remaining_secs(
    status: &str,
    now: u64,
    full: u64,
    rate: u64,
) -> Option<u32> {
    if rate == 0 {
        return None;
    }
    let hours = match status {
        "Discharging" => now as f64 / rate as f64,
        "Charging" => {
            if full <= now { return None; }
            (full - now) as f64 / rate as f64
        }
        _ => return None,
    };
    Some((hours * 3600.0) as u32)
}

/// Extracts (read_bytes, write_bytes) from a /proc/<pid>/io body. These are
/// post-page-cache I/O — what actually hit the block layer. Returns None when
/// either field is missing or unparseable.
pub fn parse_pid_io(content: &str) -> Option<(u64, u64)> {
    let mut read_bytes: Option<u64> = None;
    let mut write_bytes: Option<u64> = None;
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("read_bytes:") {
            read_bytes = rest.trim().parse().ok();
        } else if let Some(rest) = line.strip_prefix("write_bytes:") {
            write_bytes = rest.trim().parse().ok();
        }
    }
    match (read_bytes, write_bytes) {
        (Some(r), Some(w)) => Some((r, w)),
        _ => None,
    }
}

// ── /proc/net/tcp connection parsing ──────────────────────────────────────────

/// Local port from a "hexip:hexport" column.
pub fn parse_hex_port(addr: &str) -> Option<u16> {
    addr.split(':').nth(1).and_then(|p| u16::from_str_radix(p, 16).ok())
}

/// "hexip:hexport" → "a.b.c.d:port" (IPv4) or "[ipv6]:port".
pub fn format_hex_addr(addr: &str) -> Option<String> {
    let parts: Vec<&str> = addr.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let port = u16::from_str_radix(parts[1], 16).ok()?;
    let ip_hex = parts[0];
    if ip_hex.len() == 8 {
        let n = u32::from_str_radix(ip_hex, 16).ok()?;
        let b = n.to_le_bytes();
        Some(format!("{}.{}.{}.{}:{}", b[0], b[1], b[2], b[3], port))
    } else if ip_hex.len() == 32 {
        // /proc/net/tcp6: four LE 32-bit words → reassemble into 8 × u16 groups.
        let groups: Option<Vec<u32>> = (0..4)
            .map(|i| u32::from_str_radix(&ip_hex[i * 8..(i + 1) * 8], 16).ok())
            .collect();
        let words = groups?;
        let g: Vec<u16> = words.iter().flat_map(|w| {
            let b = w.to_le_bytes();
            [u16::from_be_bytes([b[0], b[1]]), u16::from_be_bytes([b[2], b[3]])]
        }).collect();
        Some(format!("[{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}:{:x}]:{}",
            g[0], g[1], g[2], g[3], g[4], g[5], g[6], g[7], port))
    } else {
        None
    }
}

/// TCP state hex code → name. None for unknown codes.
pub fn state_name(hex: &str) -> Option<&'static str> {
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

/// Parses one /proc/net/tcp data line into a connection, or None if malformed.
pub fn connection_line(proto: &str, line: &str) -> Option<NetworkConnection> {
    let cols: Vec<&str> = line.split_whitespace().collect();
    if cols.len() < 4 {
        return None;
    }
    Some(NetworkConnection {
        proto: proto.to_string(),
        local_port: parse_hex_port(cols[1])?,
        remote_addr: format_hex_addr(cols[2])?,
        state: state_name(cols[3])?.to_string(),
    })
}

// ── /proc/diskstats ───────────────────────────────────────────────────────────

/// Parses /proc/diskstats content into a map of device → (sectors_read, sectors_written).
/// Only real block devices are included (skips loop, dm, ram, sr).
pub fn parse_diskstats(content: &str) -> std::collections::HashMap<String, (u64, u64)> {
    let mut map = std::collections::HashMap::new();
    for line in content.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 10 { continue; }
        let dev = cols[2];
        // Skip pseudo-devices: loop*, dm-*, ram*, sr*
        if dev.starts_with("loop") || dev.starts_with("dm-")
            || dev.starts_with("ram") || dev.starts_with("sr") { continue; }
        let reads: u64 = cols[5].parse().unwrap_or(0);
        let writes: u64 = cols[9].parse().unwrap_or(0);
        map.insert(dev.to_string(), (reads, writes));
    }
    map
}

// ── AMD rocm-smi JSON ─────────────────────────────────────────────────────────

fn str_field<T: std::str::FromStr>(card: &serde_json::Value, key: &str) -> Option<T> {
    card[key].as_str().and_then(|s| s.parse().ok())
}

fn clock_field(card: &serde_json::Value, key: &str) -> u32 {
    card[key]
        .as_str()
        .and_then(|s| s.trim_end_matches("Mhz").trim().parse().ok())
        .unwrap_or(0)
}

/// Builds a GpuPayload from rocm-smi --json output, or None when no card is found.
/// Key names vary by driver version, so every field is read defensively.
pub fn amd_payload(json: &serde_json::Value) -> Option<GpuPayload> {
    let card = json.get("card0").or_else(|| json.get("GPU[0]"))?;
    Some(GpuPayload {
        vendor: "amd".to_string(),
        name: card["Card series"].as_str().unwrap_or("AMD GPU").to_string(),
        driver_version: card["Driver version"].as_str().unwrap_or("").to_string(),
        compute_version: card["ROCm version"].as_str().unwrap_or("").to_string(),
        usage_percent: str_field(card, "GPU use (%)").unwrap_or(0.0),
        vram_used_mb: str_field::<u64>(card, "VRAM Total Used Memory (B)").map(|b| b / 1_048_576).unwrap_or(0),
        vram_total_mb: str_field::<u64>(card, "VRAM Total Memory (B)").map(|b| b / 1_048_576).unwrap_or(0),
        temperature_c: str_field(card, "Temperature (Sensor edge) (C)").unwrap_or(0.0),
        power_draw_w: str_field(card, "Average Graphics Package Power (W)").unwrap_or(0.0),
        power_limit_w: 0.0,
        core_clock_mhz: clock_field(card, "sclk clock speed:"),
        mem_clock_mhz: clock_field(card, "mclk clock speed:"),
        processes: vec![],
    })
}

// ── /sys/class/hwmon temperature sensors ────────────────────────────────────

pub fn read_thermal() -> ThermalPayload {
    ThermalPayload {
        cpu_temp_c: read_cpu_temp(),
        drives: read_drive_temps(),
    }
}

fn read_cpu_temp() -> Option<f32> {
    let hwmon_dir = std::fs::read_dir("/sys/class/hwmon").ok()?;
    for entry in hwmon_dir.flatten() {
        let path = entry.path();
        let Some(chip) = hwmon_chip_name(&path) else { continue };
        if chip == "k10temp" || chip == "coretemp" {
            if let Some(temp) = read_hwmon_temp1(&path) {
                return Some(temp);
            }
        }
    }
    None
}

fn read_drive_temps() -> Vec<DriveTemp> {
    let Ok(hwmon_dir) = std::fs::read_dir("/sys/class/hwmon") else { return vec![] };
    let mut drives = Vec::new();
    for entry in hwmon_dir.flatten() {
        let path = entry.path();
        let Some(chip) = hwmon_chip_name(&path) else { continue };
        if chip == "nvme" || chip == "drivetemp" {
            let name = resolve_drive_name(&path, &chip);
            let temp_c = read_hwmon_temp1(&path);
            drives.push(DriveTemp { name, temp_c });
        }
    }
    drives
}

fn hwmon_chip_name(hwmon_path: &Path) -> Option<String> {
    std::fs::read_to_string(hwmon_path.join("name"))
        .ok()
        .map(|s| s.trim().to_string())
}

fn read_hwmon_temp1(hwmon_path: &Path) -> Option<f32> {
    let raw = std::fs::read_to_string(hwmon_path.join("temp1_input")).ok()?;
    raw.trim().parse::<i32>().ok().map(|millideg| millideg as f32 / 1000.0)
}

fn resolve_drive_name(hwmon_path: &Path, chip: &str) -> String {
    if chip == "nvme" {
        if let Ok(real) = std::fs::canonicalize(hwmon_path) {
            if let Some(node) = nvme_node_from_path(&real) {
                let model_path = format!("/sys/class/nvme/{node}/model");
                if let Ok(model) = std::fs::read_to_string(&model_path) {
                    return model.trim().to_string();
                }
                return node;
            }
        }
    } else if chip == "drivetemp" {
        if let Ok(real) = std::fs::canonicalize(hwmon_path.join("device")) {
            if let Some(dev_name) = real.file_name().and_then(|n| n.to_str()) {
                let model_path = format!("/sys/block/{dev_name}/device/model");
                if let Ok(model) = std::fs::read_to_string(&model_path) {
                    return model.trim().to_string();
                }
                return dev_name.to_string();
            }
        }
    }
    chip.to_string()
}

// Walks path components to find the nvme controller node (e.g. "nvme0").
// Skips namespaces like "nvme0n1" (suffix contains non-digit chars).
fn nvme_node_from_path(path: &Path) -> Option<String> {
    path.components()
        .filter_map(|c| c.as_os_str().to_str())
        .find(|s| {
            s.starts_with("nvme") && s.len() > 4 && s[4..].chars().all(|c| c.is_ascii_digit())
        })
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pid_to_raw_accepts_normal_pids_and_rejects_overflow() {
        assert_eq!(pid_to_raw(1234), Ok(1234));
        assert_eq!(pid_to_raw(0), Ok(0));
        let err = pid_to_raw(u32::MAX).unwrap_err();
        assert!(err.contains(&u32::MAX.to_string()));
        assert!(err.contains("i32::MAX"));
    }

    #[test]
    fn validate_priority_range() {
        assert!(validate_priority(-20).is_ok());
        assert!(validate_priority(19).is_ok());
        assert!(validate_priority(0).is_ok());
        assert!(validate_priority(-21).unwrap_err().contains("-21"));
        assert!(validate_priority(20).unwrap_err().contains("out of range"));
    }

    #[test]
    fn stat_field_reads_fields_after_comm_with_spaces() {
        // pid 1, comm "(my proc)" with spaces, state R, ppid 0, then more fields.
        let stat = "1 (my proc) R 0 1 1 0 -1 4194560 100 0 0 0 5 7";
        assert_eq!(stat_field(stat, 3).as_deref(), Some("0")); // ppid
        // field 13 = utime (5), 14 = stime (7) per the after-comm indexing
        assert_eq!(stat_field(stat, 13).as_deref(), Some("5"));
        assert_eq!(stat_field(stat, 14).as_deref(), Some("7"));
    }

    #[test]
    fn stat_field_returns_none_when_malformed() {
        assert_eq!(stat_field("no paren here", 3), None);
        assert_eq!(stat_field("1 (x) R", 1), None); // index < 2 underflows
    }

    #[test]
    fn thread_state_extracts_state_token() {
        let status = "Name:\tbash\nState:\tS (sleeping)\nTgid:\t10\n";
        assert_eq!(thread_state(status).as_deref(), Some("S"));
        assert_eq!(thread_state("Name:\tx\n"), None);
    }

    #[test]
    fn clean_cmdline_replaces_nuls_and_trims() {
        assert_eq!(clean_cmdline("ls\0-la\0/home\0"), "ls -la /home");
        assert_eq!(clean_cmdline(""), "");
    }

    #[test]
    fn count_env_ignores_empty_entries() {
        assert_eq!(count_env("A=1\0B=2\0\0"), 2);
        assert_eq!(count_env(""), 0);
    }

    #[test]
    fn cpu_time_secs_divides_by_clock_ticks() {
        assert!((cpu_time_secs(50, 50, 100.0) - 1.0).abs() < f64::EPSILON);
        assert!((cpu_time_secs(0, 0, 100.0)).abs() < f64::EPSILON);
    }

    #[test]
    fn format_start_time_clamps_to_zero_and_formats_tiers() {
        // uptime 100s, started 90 ticks ago @ 100 ticks/s => 10s ago.
        assert_eq!(format_start_time(100.0, 9000, 100.0), "10s ago");
        // start in the "future" clamps to 0s.
        assert_eq!(format_start_time(10.0, 9000, 100.0), "0s ago");
        // 3600s < 7200 threshold => minutes tier => 60m ago.
        assert_eq!(format_start_time(3600.0, 0, 1.0), "60m ago");
        // 7200s = first hour entry => 2h ago.
        assert_eq!(format_start_time(7200.0, 0, 1.0), "2h ago");
        // 172800s = exactly 2d threshold => 2d ago.
        assert_eq!(format_start_time(172_800.0, 0, 1.0), "2d ago");
        // 130s => 2m ago (>=120).
        assert_eq!(format_start_time(130.0, 0, 1.0), "2m ago");
    }

    #[test]
    fn parse_uptime_takes_first_number() {
        assert!((parse_uptime("1234.56 9999.00") - 1234.56).abs() < 1e-9);
        assert_eq!(parse_uptime("garbage"), 0.0);
    }

    #[test]
    fn pss_mb_parses_pss_line() {
        let rollup = "Rss:  20480 kB\nPss:  10240 kB\nShared_Clean: 0 kB\n";
        assert!((pss_mb(rollup).unwrap() - 10.0).abs() < f64::EPSILON); // 10240 kB = 10 MB
        assert_eq!(pss_mb("Rss: 100 kB\n"), None);
        assert_eq!(pss_mb("Pss: notanumber kB"), None);
    }

    #[test]
    fn parse_hex_port_decodes() {
        assert_eq!(parse_hex_port("0100007F:0050"), Some(80));
        assert_eq!(parse_hex_port("0100007F:1F90"), Some(8080));
        assert_eq!(parse_hex_port("no_colon"), None);
        assert_eq!(parse_hex_port(":ZZZZ"), None);
    }

    #[test]
    fn format_hex_addr_ipv4_and_ipv6() {
        assert_eq!(format_hex_addr("0100007F:0050").as_deref(), Some("127.0.0.1:80"));
        // Loopback IPv6 ::1 in /proc/net/tcp6 little-endian 32-bit word format.
        // ::1 = 00000000 00000000 00000000 01000000 (each word LE)
        let ipv6 = format_hex_addr("00000000000000000000000001000000:0050").unwrap();
        assert!(ipv6.ends_with(":80"), "expected port 80, got {ipv6}");
        assert!(ipv6.starts_with('['), "expected IPv6 brackets, got {ipv6}");
        // malformed inputs
        assert_eq!(format_hex_addr("nocolon"), None);
        assert_eq!(format_hex_addr("0100007F:ZZZZ"), None);
        // short non-8 non-32 hex string returns None
        assert_eq!(format_hex_addr("ABCD:0050"), None);
    }

    #[test]
    fn state_name_maps_known_and_rejects_unknown() {
        assert_eq!(state_name("01"), Some("ESTABLISHED"));
        assert_eq!(state_name("0A"), Some("LISTEN"));
        assert_eq!(state_name("FF"), None);
    }

    #[test]
    fn connection_line_parses_or_rejects() {
        let line = "0: 0100007F:0050 0100007F:1F90 01 00 0 0";
        let conn = connection_line("TCP", line).unwrap();
        assert_eq!(conn.proto, "TCP");
        assert_eq!(conn.local_port, 80);
        assert_eq!(conn.remote_addr, "127.0.0.1:8080");
        assert_eq!(conn.state, "ESTABLISHED");
        assert!(connection_line("TCP", "too few").is_none());
        assert!(connection_line("TCP", "0: 0100007F:0050 0100007F:1F90 FF").is_none()); // bad state
    }

    #[test]
    fn parse_diskstats_extracts_sectors() {
        let content = "\
   8   0 sda 1000 0 2000 0 500 0 1000 0 0 0 0\n\
   8   1 sda1 800 0 1600 0 400 0 800 0 0 0 0\n\
   7   0 loop0 10 0 20 0 5 0 10 0 0 0 0\n\
  11   0 sr0 0 0 0 0 0 0 0 0 0 0 0\n";
        let map = parse_diskstats(content);
        assert_eq!(map.get("sda"), Some(&(2000, 1000)));
        assert_eq!(map.get("sda1"), Some(&(1600, 800)));
        // loop and sr devices are filtered out
        assert!(!map.contains_key("loop0"));
        assert!(!map.contains_key("sr0"));
    }

    #[test]
    fn amd_payload_parses_valid_card() {
        let json = serde_json::json!({
            "card0": {
                "Card series": "Radeon RX 7900",
                "Driver version": "6.2.0",
                "ROCm version": "6.0",
                "GPU use (%)": "45",
                "VRAM Total Used Memory (B)": "2147483648",
                "VRAM Total Memory (B)": "17179869184",
                "Temperature (Sensor edge) (C)": "72.0",
                "Average Graphics Package Power (W)": "180.5",
                "sclk clock speed:": "2500Mhz",
                "mclk clock speed:": "1000Mhz"
            }
        });
        let p = amd_payload(&json).unwrap();
        assert_eq!(p.name, "Radeon RX 7900");
        assert!((p.usage_percent - 45.0).abs() < f32::EPSILON);
        assert_eq!(p.vram_used_mb, 2048);
        assert_eq!(p.vram_total_mb, 16384);
        assert_eq!(p.core_clock_mhz, 2500);
        assert_eq!(p.mem_clock_mhz, 1000);
        assert_eq!(p.vendor, "amd");
    }

    #[test]
    fn amd_payload_handles_gpu0_key_and_missing_fields() {
        let json = serde_json::json!({ "GPU[0]": { "Card series": "RX 580" } });
        let p = amd_payload(&json).unwrap();
        assert_eq!(p.name, "RX 580");
        assert_eq!(p.usage_percent, 0.0); // missing field defaults
        assert_eq!(p.vram_total_mb, 0);
    }

    #[test]
    fn amd_payload_none_without_card() {
        let json = serde_json::json!({ "other": 1 });
        assert!(amd_payload(&json).is_none());
    }

    #[test]
    fn read_hwmon_temp1_parses_millidegrees() {
        let dir = std::env::temp_dir().join(format!("mgnx_hwmon_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("temp1_input"), "45000\n").unwrap();
        let result = read_hwmon_temp1(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert!((result.unwrap() - 45.0).abs() < 0.001);
    }

    #[test]
    fn read_hwmon_temp1_returns_none_on_missing() {
        let dir = std::path::PathBuf::from("/tmp/mgnx_hwmon_nonexistent_xyz");
        assert!(read_hwmon_temp1(&dir).is_none());
    }

    #[test]
    fn nvme_node_from_path_extracts_controller() {
        let path = std::path::PathBuf::from("/sys/devices/pci0000:00/nvme/nvme0/hwmon5");
        assert_eq!(nvme_node_from_path(&path), Some("nvme0".to_string()));
    }

    #[test]
    fn parse_pid_io_extracts_read_and_write_bytes() {
        let content = "rchar: 4428\nwchar: 0\nsyscr: 9\nsyscw: 0\nread_bytes: 12345\nwrite_bytes: 67890\ncancelled_write_bytes: 0\n";
        assert_eq!(parse_pid_io(content), Some((12345, 67890)));
    }

    #[test]
    fn parse_pid_io_returns_none_when_read_bytes_missing() {
        let content = "rchar: 4428\nwrite_bytes: 67890\n";
        assert_eq!(parse_pid_io(content), None);
    }

    #[test]
    fn parse_pid_io_returns_none_when_write_bytes_missing() {
        let content = "rchar: 4428\nread_bytes: 12345\n";
        assert_eq!(parse_pid_io(content), None);
    }

    #[test]
    fn parse_pid_io_returns_none_on_malformed_value() {
        let content = "read_bytes: abc\nwrite_bytes: 0\n";
        assert_eq!(parse_pid_io(content), None);
    }

    #[test]
    fn parse_pid_io_ignores_unrelated_lines() {
        let content = "garbage\nread_bytes: 7\nmore garbage\nwrite_bytes: 11\n";
        assert_eq!(parse_pid_io(content), Some((7, 11)));
    }

    #[test]
    fn parse_cpu_freq_mhz_converts_khz_to_mhz() {
        assert_eq!(parse_cpu_freq_mhz("1764477\n"), Some(1764));
    }

    #[test]
    fn parse_cpu_freq_mhz_handles_no_trailing_newline() {
        assert_eq!(parse_cpu_freq_mhz("2400000"), Some(2400));
    }

    #[test]
    fn parse_cpu_freq_mhz_returns_none_on_empty() {
        assert_eq!(parse_cpu_freq_mhz(""), None);
    }

    #[test]
    fn parse_cpu_freq_mhz_returns_none_on_garbage() {
        assert_eq!(parse_cpu_freq_mhz("not a number"), None);
    }

    #[test]
    fn parse_cpu_freq_mhz_tolerates_whitespace() {
        assert_eq!(parse_cpu_freq_mhz("  3200000  \n"), Some(3200));
    }

    #[test]
    fn parse_sysfs_uint_handles_normal_value() {
        assert_eq!(parse_sysfs_uint("76\n"), Some(76));
    }

    #[test]
    fn parse_sysfs_uint_strips_whitespace() {
        assert_eq!(parse_sysfs_uint("  42  "), Some(42));
    }

    #[test]
    fn parse_sysfs_uint_returns_none_on_garbage() {
        assert_eq!(parse_sysfs_uint("nope"), None);
    }

    #[test]
    fn battery_time_remaining_secs_discharging() {
        let out = battery_time_remaining_secs("Discharging", 30_000_000, 60_000_000, 10_000_000);
        assert_eq!(out, Some(10800));
    }

    #[test]
    fn battery_time_remaining_secs_charging() {
        let out = battery_time_remaining_secs("Charging", 30_000_000, 60_000_000, 10_000_000);
        assert_eq!(out, Some(10800));
    }

    #[test]
    fn battery_time_remaining_secs_full_returns_none() {
        assert_eq!(battery_time_remaining_secs("Full", 60, 60, 0), None);
    }

    #[test]
    fn battery_time_remaining_secs_zero_rate_returns_none() {
        assert_eq!(battery_time_remaining_secs("Discharging", 60, 60, 0), None);
    }

    #[test]
    fn battery_time_remaining_secs_already_full_when_charging() {
        assert_eq!(battery_time_remaining_secs("Charging", 70, 60, 10), None);
    }
}
