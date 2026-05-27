pub mod types;
pub mod poller;
pub mod gpu;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            use tauri::Emitter;
            let poller = poller::SystemPoller::new(app.handle().clone());
            let gpu_available = !matches!(poller.gpu_backend, gpu::GpuBackend::None);
            poller.start();
            app.emit("gpu-available", gpu_available)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
