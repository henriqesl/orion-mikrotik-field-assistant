use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let parent_pid = std::process::id().to_string();
            let sidecar = app.shell().sidecar("orion-backend")?.args([
                "--port",
                "8765",
                "--parent-pid",
                &parent_pid,
            ]);
            let (_events, child) = sidecar.spawn()?;
            let backend = app.state::<BackendProcess>();
            *backend.0.lock().expect("backend process lock poisoned") = Some(child);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build ORION Field")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                let backend = app.state::<BackendProcess>();
                if let Some(child) = backend
                    .0
                    .lock()
                    .expect("backend process lock poisoned")
                    .take()
                {
                    let _ = child.kill();
                };
            }
        });
}
