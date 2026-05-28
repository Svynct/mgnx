pub mod types;
pub mod parse;
pub mod poller;
pub mod gpu;
pub mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::process_kill,
            commands::process_term,
            commands::process_suspend,
            commands::process_resume,
            commands::process_renice,
            commands::process_details,
        ])
        .setup(|app| {
            // The poller broadcasts `gpu-available` every tick (the frontend
            // listener isn't ready at setup time, so a one-shot emit is missed).
            poller::SystemPoller::new(app.handle().clone()).start();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
