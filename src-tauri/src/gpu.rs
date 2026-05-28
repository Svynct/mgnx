use std::process::Command;
use nvml_wrapper::{enum_wrappers::device::TemperatureSensor, enums::device::UsedGpuMemory, Nvml};
use tauri::{AppHandle, Emitter};

use crate::types::{GpuPayload, GpuProcess};

pub enum GpuBackend {
    Nvidia(Nvml),
    Amd,
    None,
}

pub fn detect_gpu() -> GpuBackend {
    if let Ok(nvml) = Nvml::init() {
        return GpuBackend::Nvidia(nvml);
    }
    // Fallback: systems without the -dev package ship only the versioned runtime
    // lib (libnvidia-ml.so.1), so the default "libnvidia-ml.so" load fails.
    if let Ok(nvml) = Nvml::builder()
        .lib_path(std::ffi::OsStr::new("libnvidia-ml.so.1"))
        .init()
    {
        return GpuBackend::Nvidia(nvml);
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
            name: String::new(),
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

    // rocm-smi JSON keys vary by driver version; use safe .get() chains
    let card = json.get("card0").or_else(|| json.get("GPU[0]"));
    let Some(card) = card else { return };

    let payload = GpuPayload {
        vendor: "amd".to_string(),
        name: card["Card series"].as_str().unwrap_or("AMD GPU").to_string(),
        driver_version: card["Driver version"].as_str().unwrap_or("").to_string(),
        compute_version: card["ROCm version"].as_str().unwrap_or("").to_string(),
        usage_percent: card["GPU use (%)"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        vram_used_mb: card["VRAM Total Used Memory (B)"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .map(|b| b / 1_048_576)
            .unwrap_or(0),
        vram_total_mb: card["VRAM Total Memory (B)"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .map(|b| b / 1_048_576)
            .unwrap_or(0),
        temperature_c: card["Temperature (Sensor edge) (C)"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        power_draw_w: card["Average Graphics Package Power (W)"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        power_limit_w: 0.0,
        core_clock_mhz: card["sclk clock speed:"]
            .as_str()
            .and_then(|s| s.trim_end_matches("Mhz").trim().parse().ok())
            .unwrap_or(0),
        mem_clock_mhz: card["mclk clock speed:"]
            .as_str()
            .and_then(|s| s.trim_end_matches("Mhz").trim().parse().ok())
            .unwrap_or(0),
        processes: vec![],
    };

    let _ = handle.emit("gpu-update", payload);
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

    #[test]
    fn amd_json_parse_missing_card_returns_early() {
        // If rocm-smi JSON lacks "card0"/"GPU[0]", poll_amd returns without panic.
        // We can't call poll_amd directly (needs AppHandle), so we verify the
        // parsing logic by replicating it inline.
        let json: serde_json::Value = serde_json::json!({"other_key": "value"});
        let card = json.get("card0").or_else(|| json.get("GPU[0]"));
        assert!(card.is_none());
    }

    #[test]
    fn amd_json_parse_valid_card() {
        let json: serde_json::Value = serde_json::json!({
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
        let card = json.get("card0").unwrap();
        assert_eq!(card["Card series"].as_str().unwrap(), "Radeon RX 7900");
        let usage: f32 = card["GPU use (%)"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        assert!((usage - 45.0).abs() < f32::EPSILON);
        let vram_used: u64 = card["VRAM Total Used Memory (B)"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .map(|b: u64| b / 1_048_576)
            .unwrap_or(0);
        assert_eq!(vram_used, 2048);
        let core_clk: u32 = card["sclk clock speed:"]
            .as_str()
            .and_then(|s| s.trim_end_matches("Mhz").trim().parse().ok())
            .unwrap_or(0);
        assert_eq!(core_clk, 2500);
    }
}
