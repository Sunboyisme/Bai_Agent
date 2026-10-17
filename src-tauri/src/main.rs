#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend_port;
mod window_layout;

use serde::Serialize;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(not(debug_assertions))]
use std::process::Stdio;
use std::{
    path::PathBuf,
    process::{Child, Command},
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_notification::NotificationExt;

struct Backend {
    child: Mutex<Option<Child>>,
    data_dir: OnceLock<PathBuf>,
    url: OnceLock<String>,
}
#[derive(Serialize)]
struct Connection {
    url: String,
    token: String,
}

#[tauri::command]
fn backend_config(state: tauri::State<'_, Backend>) -> Result<Connection, String> {
    let data_dir = state.data_dir.get().ok_or("本机服务正在启动，请稍候。")?;
    let token = std::fs::read_to_string(data_dir.join("auth-token"))
        .map_err(|_| "本机服务正在启动，请稍候。")?;
    Ok(Connection {
        url: state.url.get().ok_or("本机服务正在启动，请稍候。")?.clone(),
        token: token.trim().into(),
    })
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn ensure_window_visible(window: tauri::WebviewWindow) -> Result<(), String> {
    window_layout::ensure_visible(&window).map_err(|error| error.to_string())
}

#[tauri::command]
fn restore_window_layout(window: tauri::WebviewWindow) -> Result<(), String> {
    window_layout::fit_main_window(&window).map_err(|error| error.to_string())
}

fn open_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window_layout::ensure_visible(&window);
        let _ = window.set_focus();
    }
}

fn main() {
    let preferred_port: u16 = std::env::var("BAI_BACKEND_PORT")
        .unwrap_or_else(|_| "8766".into())
        .parse()
        .expect("BAI_BACKEND_PORT 必须是有效端口");
    assert!(preferred_port >= 1024, "BAI_BACKEND_PORT 必须大于等于 1024");
    let backend = Backend {
        child: Mutex::new(None),
        data_dir: OnceLock::new(),
        url: OnceLock::new(),
    };
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            open_main(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .manage(backend)
        .invoke_handler(tauri::generate_handler![
            backend_config,
            quit_app,
            ensure_window_visible,
            restore_window_layout
        ])
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                window_layout::fit_main_window(&window)?;
                window.show()?;
            }
            let data_dir = if let Some(folder) = std::env::var_os("BAI_DATA_DIR") {
                PathBuf::from(folder)
            } else {
                #[cfg(debug_assertions)]
                let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap()
                    .join(".local-data")
                    .join("dev");
                #[cfg(not(debug_assertions))]
                let folder = app.path().app_local_data_dir()?;
                folder
            };
            std::fs::create_dir_all(&data_dir)?;
            let _ = app.state::<Backend>().data_dir.set(data_dir.clone());
            let client = reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(1))
                .no_proxy()
                .build()?;
            let mut selected_port = backend_port::select_backend_port(preferred_port, |port| {
                let url = format!("http://127.0.0.1:{port}/api/v1");
                let online = client
                    .get(format!("{url}/health"))
                    .send()
                    .ok()
                    .and_then(|r| r.json::<serde_json::Value>().ok())
                    .is_some_and(|v| v["service"] == "bai-agent");
                if !online {
                    return false;
                }
                let token =
                    std::fs::read_to_string(data_dir.join("auth-token")).unwrap_or_default();
                !token.trim().is_empty()
                    && client
                        .get(format!("{url}/settings"))
                        .bearer_auth(token.trim())
                        .send()
                        .is_ok_and(|r| r.status().is_success())
            })?;
            let port = selected_port.port;
            let backend_url = format!("http://127.0.0.1:{port}/api/v1");
            let _ = app.state::<Backend>().url.set(backend_url.clone());
            if selected_port.needs_spawn() {
                #[cfg(debug_assertions)]
                let mut command = {
                    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .parent()
                        .unwrap()
                        .to_path_buf();
                    let mut value = Command::new(root.join("backend/.venv/Scripts/python.exe"));
                    value
                        .args(["-m", "uvicorn", "app.main:app"])
                        .current_dir(root.join("backend"));
                    value
                };
                #[cfg(not(debug_assertions))]
                let mut command = {
                    let folder = app.path().resource_dir()?.join("backend");
                    let mut value = Command::new(folder.join("bai-backend.exe"));
                    value.current_dir(folder);
                    let log = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(data_dir.join("backend.log"))?;
                    value
                        .stdout(Stdio::from(log.try_clone()?))
                        .stderr(Stdio::from(log));
                    value
                };
                command
                    .args([
                        "--host",
                        "127.0.0.1",
                        "--port",
                        &port.to_string(),
                        "--no-access-log",
                    ])
                    .env("BAI_DATA_DIR", &data_dir);
                #[cfg(windows)]
                command.creation_flags(0x08000000);
                selected_port.release();
                let child = command.spawn()?;
                *app.state::<Backend>().child.lock().unwrap() = Some(child);
            }
            let show = MenuItem::with_id(app, "show", "打开XiaoXi", true, None::<&str>)?;
            let exit = MenuItem::with_id(
                app,
                "quit",
                "退出XiaoXi（暂停本机提醒）",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show, &exit])?;
            let icon = app.default_window_icon().cloned().ok_or("应用图标缺失")?;
            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("XiaoXi · 个人助手")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => open_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                        open_main(tray.app_handle());
                    }
                })
                .build(app)?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let client = reqwest::blocking::Client::builder()
                    .timeout(Duration::from_secs(3))
                    .build()
                    .unwrap();
                loop {
                    std::thread::sleep(Duration::from_secs(3));
                    let Ok(token) = std::fs::read_to_string(data_dir.join("auth-token")) else {
                        continue;
                    };
                    let Ok(response) = client
                        .get(format!("{backend_url}/notifications?pending_only=true"))
                        .bearer_auth(token.trim())
                        .send()
                    else {
                        continue;
                    };
                    let Ok(notes) = response.json::<Vec<serde_json::Value>>() else {
                        continue;
                    };
                    if notes.is_empty() {
                        continue;
                    }
                    for note in &notes {
                        let _ = handle
                            .notification()
                            .builder()
                            .title(note["title"].as_str().unwrap_or("XiaoXi提醒你"))
                            .body(note["body"].as_str().unwrap_or(""))
                            .show();
                    }
                    let window_ready = if let Some(window) = handle.get_webview_window("reminder") {
                        let shown = window.show().is_ok();
                        let _ = window.set_focus();
                        shown
                    } else {
                        WebviewWindowBuilder::new(
                            &handle,
                            "reminder",
                            WebviewUrl::App("index.html?view=reminder".into()),
                        )
                        .title("XiaoXi提醒你")
                        .inner_size(420.0, 320.0)
                        .resizable(false)
                        .always_on_top(true)
                        .center()
                        .build()
                        .is_ok()
                    };
                    if window_ready {
                        for note in &notes {
                            if let Some(id) = note["id"].as_str() {
                                let _ = client
                                    .post(format!("{backend_url}/notifications/{id}/ack"))
                                    .bearer_auth(token.trim())
                                    .send();
                            }
                        }
                    }
                    let _ = handle.emit("bai-reminder", ());
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("XiaoXi桌面应用启动失败");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(mut child) = handle.state::<Backend>().child.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
