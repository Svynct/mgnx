use nix::sys::signal::{kill, Signal};
use nix::unistd::Pid;
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
