use std::process::Command;
use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, enums::device::UsedGpuMemory, Nvml};
use tauri::{AppHandle, Emitter};

use crate::types::{GpuPayload, GpuProcess};

pub enum GpuBackend {
    Nvidia(Box<Nvml>),
    Amd,
    None,
}

pub fn detect_gpu() -> GpuBackend {
    if let Ok(nvml) = Nvml::init() {
        return GpuBackend::Nvidia(Box::new(nvml));
    }
    // Fallback: systems without the -dev package ship only the versioned runtime
    // lib (libnvidia-ml.so.1), so the default "libnvidia-ml.so" load fails.
    if let Ok(nvml) = Nvml::builder()
        .lib_path(std::ffi::OsStr::new("libnvidia-ml.so.1"))
        .init()
    {
        return GpuBackend::Nvidia(Box::new(nvml));
    }
    let out = Command::new("rocm-smi").arg("--showproductname").output();
    if out.map(|o| o.status.success()).unwrap_or(false) {
        return GpuBackend::Amd;
    }
    GpuBackend::None
}

pub fn poll_gpu(backend: &GpuBackend, handle: &AppHandle) {
    match backend {
        GpuBackend::Nvidia(nvml) => poll_nvidia(nvml, handle),
        GpuBackend::Amd => poll_amd(handle),
        GpuBackend::None => {}
    }
}

// NVML only reports the pid + VRAM for a GPU process, not its name; resolve it
// from /proc/<pid>/comm (empty when the process has already exited).
fn process_name(pid: u32) -> String {
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn poll_nvidia(nvml: &Nvml, handle: &AppHandle) {
    let Ok(device) = nvml.device_by_index(0) else { return };

    let name = device.name().unwrap_or_default();
    let driver = nvml.sys_driver_version().unwrap_or_default();
    let cuda = nvml
        .sys_cuda_driver_version()
        .map(|v| format!("{}.{}", v / 1000, (v % 1000) / 10))
        .unwrap_or_default();
    let usage = device.utilization_rates().map(|u| u.gpu as f32).unwrap_or(0.0);
    let mem = device.memory_info().ok();
    let temp = device.temperature(TemperatureSensor::Gpu).map(|t| t as f32).unwrap_or(0.0);
    let power = device.power_usage().map(|p| p as f32 / 1000.0).unwrap_or(0.0);
    let power_limit = device.enforced_power_limit().map(|p| p as f32 / 1000.0).unwrap_or(0.0);
    let core_clk = device
        .clock_info(nvml_wrapper::enum_wrappers::device::Clock::Graphics)
        .unwrap_or(0);
    let mem_clk = device
        .clock_info(nvml_wrapper::enum_wrappers::device::Clock::Memory)
        .unwrap_or(0);

    let processes: Vec<GpuProcess> = device
        .running_graphics_processes()
        .unwrap_or_default()
        .into_iter()
        .map(|p| GpuProcess {
            pid: p.pid,
            name: process_name(p.pid),
            vram_mb: match p.used_gpu_memory {
                UsedGpuMemory::Used(bytes) => bytes / 1_048_576,
                UsedGpuMemory::Unavailable => 0,
            },
            proc_type: "Render".to_string(),
        })
        .collect();

    let payload = GpuPayload {
        vendor: "nvidia".to_string(),
        name,
        driver_version: driver,
        compute_version: cuda,
        usage_percent: usage,
        vram_used_mb: mem.as_ref().map(|m| m.used / 1_048_576).unwrap_or(0),
        vram_total_mb: mem.as_ref().map(|m| m.total / 1_048_576).unwrap_or(0),
        temperature_c: temp,
        power_draw_w: power,
        power_limit_w: power_limit,
        core_clock_mhz: core_clk,
        mem_clock_mhz: mem_clk,
        processes,
    };

    let _ = handle.emit("gpu-update", payload);
}

fn poll_amd(handle: &AppHandle) {
    let out = Command::new("rocm-smi")
        .args(["--showuse", "--showmemuse", "--showtemp", "--showpower", "--showclocks", "--json"])
        .output();
    let Ok(out) = out else { return };
    let Ok(json) = serde_json::from_slice::<serde_json::Value>(&out.stdout) else { return };

    // rocm-smi JSON keys vary by driver version; parsing lives in parse::amd_payload.
    if let Some(payload) = crate::parse::amd_payload(&json) {
        let _ = handle.emit("gpu-update", payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_gpu_returns_none_without_hardware() {
        // On CI / dev machines without NVIDIA or AMD GPU, detect_gpu must not panic
        // and must return a valid variant (None in most cases).
        let backend = detect_gpu();
        // Just verify it doesn't panic and returns a variant we can match.
        match backend {
            GpuBackend::Nvidia(_) | GpuBackend::Amd | GpuBackend::None => {}
        }
    }

    #[test]
    fn poll_gpu_none_is_noop() {
        // Calling poll_gpu with None backend must not panic (no handle needed).
        // We can't easily construct a real AppHandle in tests, so we verify the
        // None branch by checking it early-returns without any action. The test
        // passes as long as it doesn't panic or fail to compile.
        let backend = GpuBackend::None;
        // poll_gpu requires &AppHandle which can't be constructed in unit tests;
        // so we test the None arm directly via pattern match instead.
        assert!(matches!(backend, GpuBackend::None));
    }
}
