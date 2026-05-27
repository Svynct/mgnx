use std::thread;
use std::time::Duration;
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, ProcessRefreshKind, RefreshKind, System, Users};
use tauri::{AppHandle, Emitter};

use crate::types::{CpuCoreUsage, ProcessEntry, ResourcesPayload};

pub struct SystemPoller {
    pub handle: AppHandle,
    pub gpu_backend: crate::gpu::GpuBackend,
}

impl SystemPoller {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            gpu_backend: crate::gpu::detect_gpu(),
            handle,
        }
    }

    pub fn start(self) {
        thread::spawn(move || {
            let mut sys = System::new_with_specifics(
                RefreshKind::new()
                    .with_cpu(CpuRefreshKind::everything())
                    .with_memory(MemoryRefreshKind::everything())
                    .with_processes(ProcessRefreshKind::everything()),
            );
            let mut users = Users::new_with_refreshed_list();

            loop {
                sys.refresh_all();
                users.refresh_list();

                self.emit_processes(&sys, &users);
                self.emit_resources(&sys);

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
        let _ = self.handle.emit("processes-update", entries);
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

        let _ = self.handle.emit("resources-update", payload);
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
}
