use crate::types::{ProcessDetails, ThreadInfo};
use nix::sys::signal::{kill, Signal};
use nix::unistd::Pid;
use std::fs;
use tauri::command;

#[command]
pub fn process_kill(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(pid as i32), Signal::SIGKILL)
        .map_err(|e| format!("SIGKILL pid {pid}: {e}"))
}

#[command]
pub fn process_term(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(pid as i32), Signal::SIGTERM)
        .map_err(|e| format!("SIGTERM pid {pid}: {e}"))
}

#[command]
pub fn process_suspend(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(pid as i32), Signal::SIGSTOP)
        .map_err(|e| format!("SIGSTOP pid {pid}: {e}"))
}

#[command]
pub fn process_resume(pid: u32) -> Result<(), String> {
    kill(Pid::from_raw(pid as i32), Signal::SIGCONT)
        .map_err(|e| format!("SIGCONT pid {pid}: {e}"))
}

#[command]
pub fn process_renice(pid: u32, priority: i32) -> Result<(), String> {
    if !(-20..=19).contains(&priority) {
        return Err(format!("priority {priority} out of range -20..19"));
    }
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
pub fn process_details(pid: u32) -> Result<ProcessDetails, String> {
    let base = format!("/proc/{pid}");

    let cmdline = fs::read_to_string(format!("{base}/cmdline"))
        .map(|s| s.replace('\0', " ").trim().to_string())
        .unwrap_or_default();

    let cwd = fs::read_link(format!("{base}/cwd"))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let fd_count = fs::read_dir(format!("{base}/fd"))
        .map(|d| d.count())
        .unwrap_or(0);

    let env_count = fs::read_to_string(format!("{base}/environ"))
        .map(|s| s.split('\0').filter(|e| !e.is_empty()).count())
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
    let cpu_time_s = (utime + stime) as f64 / clk_tck;

    let uptime_s: f64 = fs::read_to_string("/proc/uptime")
        .ok()
        .and_then(|s| s.split_whitespace().next().and_then(|v| v.parse().ok()))
        .unwrap_or(0.0);
    let start_secs_ago = uptime_s - (start_time_ticks as f64 / clk_tck);
    let start_time = format!("{:.0}s ago", start_secs_ago.max(0.0));

    let threads = read_threads(&base);

    Ok(ProcessDetails { pid, cmdline, cwd, fd_count, env_count, threads, ppid, start_time, cpu_time_s })
}

fn read_stat_field(base: &str, index: usize) -> Option<String> {
    let stat = fs::read_to_string(format!("{base}/stat")).ok()?;
    // fields after comm (index 1) can contain spaces inside parens — find closing ')'
    let after_comm = stat.find(')')? + 2;
    let fields: Vec<&str> = stat[after_comm..].split_whitespace().collect();
    // stat fields are 1-indexed; 0=pid, 1=comm, 2=state starts after_comm[0]
    let adjusted = index.checked_sub(2)?;
    fields.get(adjusted).map(|s| s.to_string())
}

fn read_threads(base: &str) -> Vec<ThreadInfo> {
    let Ok(task_dir) = fs::read_dir(format!("{base}/task")) else { return vec![] };
    task_dir
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let tid: u32 = e.file_name().to_string_lossy().parse().ok()?;
            let status = fs::read_to_string(format!("{base}/task/{tid}/status")).ok()?;
            let state = status.lines()
                .find(|l| l.starts_with("State:"))?
                .split_whitespace().nth(1)?
                .to_string();
            Some(ThreadInfo { tid, state })
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
        // PID u32::MAX will not exist; all signal commands must return Err, not panic.
        assert!(process_kill(u32::MAX).is_err());
        assert!(process_term(u32::MAX).is_err());
        assert!(process_suspend(u32::MAX).is_err());
        assert!(process_resume(u32::MAX).is_err());
    }

    #[test]
    fn error_messages_include_pid() {
        let err = process_kill(u32::MAX).unwrap_err();
        assert!(err.contains(&u32::MAX.to_string()), "error should include pid: {err}");
    }
}
