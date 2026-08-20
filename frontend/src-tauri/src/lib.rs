use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct BackendProcess(Mutex<Option<CommandChild>>);

#[tauri::command]
fn save_diagnostic_file(path: PathBuf, contents: Vec<u8>) -> Result<(), String> {
    let is_zip = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"));
    if !is_zip {
        return Err("O diagnóstico deve ser salvo como arquivo .zip.".to_string());
    }
    std::fs::write(path, contents)
        .map_err(|error| format!("Não foi possível salvar o diagnóstico: {error}"))
}

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
        .invoke_handler(tauri::generate_handler![save_diagnostic_file])
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
