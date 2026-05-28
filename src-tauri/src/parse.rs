//! Pure parsing / validation / formatting logic, separated from I/O (file reads,
//! syscalls, NVML, Tauri emit) so it can be unit-tested in isolation. The thin I/O
//! wrappers live in poller.rs / commands.rs / gpu.rs and call into here.

use crate::types::{GpuPayload, NetworkConnection};

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

/// Human "Ns ago" from system uptime and the process start time (in clock ticks).
pub fn format_start_time(uptime_s: f64, start_ticks: u64, clk_tck: f64) -> String {
    let start_secs_ago = uptime_s - (start_ticks as f64 / clk_tck);
    format!("{:.0}s ago", start_secs_ago.max(0.0))
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
    } else {
        Some(format!("[ipv6]:{}", port))
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
    fn format_start_time_clamps_to_zero() {
        // uptime 100s, started at 9000 ticks @ 100 ticks/s => 90s ago.
        assert_eq!(format_start_time(100.0, 9000, 100.0), "10s ago");
        // start in the "future" clamps to 0.
        assert_eq!(format_start_time(10.0, 9000, 100.0), "0s ago");
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
        assert!(format_hex_addr("00000000000000000000000001000000:0050").unwrap().starts_with("[ipv6]:"));
        assert_eq!(format_hex_addr("nocolon"), None);
        assert_eq!(format_hex_addr("0100007F:ZZZZ"), None);
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
}
