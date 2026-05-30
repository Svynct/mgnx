pub mod types;
pub mod parse;
pub mod poller;
pub mod gpu;
pub mod commands;
pub mod config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's dmabuf renderer crashes on some NVIDIA + Wayland setups
    // (Gdk "Error 71 (Protocol error) dispatching to Wayland display"), so the
    // window opens and instantly closes. Disable it unless the user overrode it.
    // Must be set before the WebView/GTK initializes — i.e. before the run loop.
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
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
