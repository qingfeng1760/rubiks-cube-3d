// 3D 魔方桌面版（Tauri v2 壳）
// - 网页资源在编译期内嵌（tauri.conf.json 的 frontendDist → webdist/）
// - 窗口在 Rust 里程序化创建：可指定 WebView2 数据目录，实现"数据跟着文件夹走"的便携版
// - --smoke：自动化冒烟自检模式（结果写 smoke-result.json / smoke.png，退出码 0/1）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::{webview::PageLoadEvent, WebviewUrl, WebviewWindowBuilder};

/// exe 所在目录（便携数据与自检结果都落在这里）
fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 自检结果上报：写入 JSON 后按结果以 0/1 退出
#[tauri::command]
fn smoke_report(ok: bool, json: String) {
    let _ = fs::write(exe_dir().join("smoke-result.json"), json);
    std::process::exit(if ok { 0 } else { 1 });
}

/// 自检截图：把页面渲染帧（data:image/png;base64,...）存成 smoke.png
#[tauri::command]
fn smoke_shot(data_url: String) {
    use base64::Engine;
    if let Some(idx) = data_url.find(',') {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&data_url[idx + 1..]) {
            let _ = fs::write(exe_dir().join("smoke.png"), bytes);
        }
    }
}

fn main() {
    let smoke = std::env::args().any(|a| a == "--smoke");
    let data_dir = exe_dir().join("data");
    let _ = fs::create_dir_all(&data_dir);
    // 便携数据双保险：环境变量 + builder 的 data_directory
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data_dir);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![smoke_report, smoke_shot])
        .setup(move |app| {
            let mut wb =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("3D 魔方")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(360.0, 480.0)
                    .center()
                    .data_directory(data_dir.clone());
            if smoke {
                wb = wb.on_page_load(|window, payload| {
                    if matches!(payload.event(), PageLoadEvent::Finished) {
                        let _ = window.eval(include_str!("smoke.js"));
                    }
                });
            }
            wb.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("3D 魔方启动失败");
}