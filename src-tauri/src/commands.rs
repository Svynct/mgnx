use crate::parse;
use crate::types::{ProcessDetails, ThreadInfo};
use nix::sys::signal::{kill, Signal};
use nix::unistd::Pid;
use std::fs;
use tauri::command;

#[command]
pub fn process_kill(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(parse::pid_to_raw(pid)?), Signal::SIGKILL)
        .map_err(|e| format!("SIGKILL pid {pid}: {e}"))
}

#[command]
pub fn process_term(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(parse::pid_to_raw(pid)?), Signal::SIGTERM)
        .map_err(|e| format!("SIGTERM pid {pid}: {e}"))
}

#[command]
pub fn process_suspend(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(parse::pid_to_raw(pid)?), Signal::SIGSTOP)
        .map_err(|e| format!("SIGSTOP pid {pid}: {e}"))
}

#[command]
pub fn process_resume(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(parse::pid_to_raw(pid)?), Signal::SIGCONT)
        .map_err(|e| format!("SIGCONT pid {pid}: {e}"))
}

#[command]
pub fn process_renice(pid: u32, priority: i32) -> Result<(), String> {
    parse::validate_priority(priority)?;
    // SAFETY: setpriority is a standard POSIX syscall with no memory unsafety beyond errno read.
    let ret = unsafe { libc::setpriority(libc::PRIO_PROCESS, pid, priority) };
    if ret == 0 {
        Ok(())
    } else {
        let errno = unsafe { *libc::__errno_location() };
        Err(format!("setpriority pid {pid} to {priority} failed: errno {errno}"))
    }
}

#[command]
pub fn get_config() -> crate::config::AppConfig {
    crate::config::load()
}

#[command]
pub fn process_details(pid: u32) -> Result<ProcessDetails, String> {
    let base = format!("/proc/{pid}");

    let cmdline = fs::read_to_string(format!("{base}/cmdline"))
        .map(|s| parse::clean_cmdline(&s))
        .unwrap_or_default();

    let cwd = fs::read_link(format!("{base}/cwd"))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let fd_count = fs::read_dir(format!("{base}/fd"))
        .map(|d| d.count())
        .unwrap_or(0);

    let env_count = fs::read_to_string(format!("{base}/environ"))
        .map(|s| parse::count_env(&s))
        .unwrap_or(0);

    let ppid = read_stat_field(&base, 3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0u32);

    let start_time_ticks: u64 = read_stat_field(&base, 21)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let utime: u64 = read_stat_field(&base, 13).and_then(|s| s.parse().ok()).unwrap_or(0);
    let stime: u64 = read_stat_field(&base, 14).and_then(|s| s.parse().ok()).unwrap_or(0);
    let clk_tck = unsafe { libc::sysconf(libc::_SC_CLK_TCK) } as f64;
    let cpu_time_s = parse::cpu_time_secs(utime, stime, clk_tck);

    let uptime_s = fs::read_to_string("/proc/uptime")
        .map(|s| parse::parse_uptime(&s))
        .unwrap_or(0.0);
    let start_time = parse::format_start_time(uptime_s, start_time_ticks, clk_tck);

    let threads = read_threads(&base);

    Ok(ProcessDetails { pid, cmdline, cwd, fd_count, env_count, threads, ppid, start_time, cpu_time_s })
}

fn read_stat_field(base: &str, index: usize) -> Option<String> {
    let stat = fs::read_to_string(format!("{base}/stat")).ok()?;
    parse::stat_field(&stat, index)
}

fn read_threads(base: &str) -> Vec<ThreadInfo> {
    let Ok(task_dir) = fs::read_dir(format!("{base}/task")) else { return vec![] };
    task_dir
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let tid: u32 = e.file_name().to_string_lossy().parse().ok()?;
            let status = fs::read_to_string(format!("{base}/task/{tid}/status")).ok()?;
            Some(ThreadInfo { tid, state: parse::thread_state(&status)? })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_renice_rejects_out_of_range() {
        assert!(process_renice(1, -21).is_err());
        assert!(process_renice(1, 20).is_err());
        let err = process_renice(1, -21).unwrap_err();
        assert!(err.contains("-21"), "error should mention the bad value: {err}");
    }

    #[test]
    fn process_renice_accepts_boundary_values() {
        // -20 and 19 are valid boundaries; they'll fail on PID 0 or non-owned PIDs in tests
        // but the validation itself must not return early with a range error.
        let err_min = process_renice(u32::MAX, -20).unwrap_err();
        let err_max = process_renice(u32::MAX, 19).unwrap_err();
        // Must not be a range-validation error — must be a syscall error.
        assert!(!err_min.contains("out of range"), "boundary -20 should pass validation: {err_min}");
        assert!(!err_max.contains("out of range"), "boundary 19 should pass validation: {err_max}");
    }

    #[test]
    fn signal_commands_fail_on_invalid_pid() {
        // 9999999 exceeds Linux max PID (4194304) so it won't exist; must return Err not panic.
        // u32::MAX is intentionally avoided — it wraps to -1 as i32, which kill(-1, sig)
        // interprets as "signal all processes", which would kill the test runner's session.
        const BOGUS_PID: u32 = 9_999_999;
        assert!(process_kill(BOGUS_PID).is_err());
        assert!(process_term(BOGUS_PID).is_err());
        assert!(process_suspend(BOGUS_PID).is_err());
        assert!(process_resume(BOGUS_PID).is_err());
    }

    #[test]
    fn error_messages_include_pid() {
        const BOGUS_PID: u32 = 9_999_999;
        let err = process_kill(BOGUS_PID).unwrap_err();
        assert!(err.contains(&BOGUS_PID.to_string()), "error should include pid: {err}");
    }
}
