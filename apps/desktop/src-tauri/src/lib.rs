//! LocalCode AI desktop shell.
//!
//! The agent engine is a Node.js process (the same `localcode` CLI used on the
//! command line). This shell starts it with `serve --port 0` and a random
//! access token, reads the `LOCALCODE_READY {...}` line it prints, and hands
//! the port + token to the web UI through the `backend_info` command. The
//! engine exits when this process exits (its stdin closes).

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent};

#[derive(Clone, Serialize, Deserialize)]
struct BackendInfo {
    port: u16,
    token: String,
}

#[derive(Default)]
struct BackendStatus {
    info: Option<BackendInfo>,
    error: Option<String>,
}

#[derive(Default)]
struct Backend {
    status: Mutex<BackendStatus>,
    ready: Condvar,
    child: Mutex<Option<Child>>,
}

impl Backend {
    fn fail(&self, message: String) {
        let mut s = self.status.lock().unwrap();
        if s.info.is_none() {
            s.error = Some(message);
        }
        self.ready.notify_all();
    }
}

const MIN_NODE_MAJOR: u32 = 22;
const MIN_NODE_MINOR: u32 = 13;

fn node_version(node: &Path) -> Option<(u32, u32)> {
    let out = Command::new(node).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut parts = text.trim().trim_start_matches('v').split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    Some((major, minor))
}

/// GUI apps (especially on macOS) do not inherit the shell PATH, so look in the
/// usual install locations as well.
fn find_node() -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("LOCALCODE_NODE") {
        candidates.push(PathBuf::from(p));
    }
    let exe = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            candidates.push(dir.join(exe));
        }
    }
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from) {
        for dir in [".volta/bin", ".local/bin", ".bun/bin"] {
            candidates.push(home.join(dir).join(exe));
        }
        // nvm / fnm installs: prefer the newest version directory.
        for base in [home.join(".nvm/versions/node"), home.join(".local/share/fnm/node-versions")] {
            if let Ok(entries) = std::fs::read_dir(&base) {
                let mut dirs: Vec<PathBuf> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
                dirs.sort();
                for d in dirs.into_iter().rev() {
                    candidates.push(d.join("bin").join(exe));
                    candidates.push(d.join("installation/bin").join(exe));
                }
            }
        }
    }
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node", "C:\\Program Files\\nodejs\\node.exe"] {
        candidates.push(PathBuf::from(p));
    }
    let mut too_old: Option<String> = None;
    for c in candidates {
        if !c.is_file() {
            continue;
        }
        match node_version(&c) {
            Some((major, minor)) if major > MIN_NODE_MAJOR || (major == MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR) => return Ok(c),
            Some((major, minor)) => too_old = Some(format!("{} is v{}.{}", c.display(), major, minor)),
            None => {}
        }
    }
    Err(match too_old {
        Some(v) => format!("LocalCode needs Node.js {MIN_NODE_MAJOR}.{MIN_NODE_MINOR} or newer, but {v}. Install Node.js 22 LTS from https://nodejs.org and restart LocalCode."),
        None => format!(
            "Node.js {MIN_NODE_MAJOR}.{MIN_NODE_MINOR}+ was not found. Install Node.js 22 LTS from https://nodejs.org (or set LOCALCODE_NODE to its path) and restart LocalCode."
        ),
    })
}

fn find_engine_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("LOCALCODE_SERVER_SCRIPT") {
        return Ok(PathBuf::from(p));
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("resources/engine/localcode.mjs");
        if bundled.is_file() {
            return Ok(bundled);
        }
    }
    // Development: use the CLI build in the monorepo.
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../cli/dist/localcode.mjs");
    if dev.is_file() {
        return Ok(dev);
    }
    Err("The LocalCode engine (localcode.mjs) was not found. Build it with `npm run build` in the repository.".into())
}

fn random_token() -> String {
    let bytes: [u8; 24] = rand::random();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn start_engine(app: &tauri::AppHandle, backend: Arc<Backend>) {
    let node = match find_node() {
        Ok(n) => n,
        Err(e) => return backend.fail(e),
    };
    let script = match find_engine_script(app) {
        Ok(s) => s,
        Err(e) => return backend.fail(e),
    };
    let token = random_token();
    let mut cmd = Command::new(&node);
    cmd.arg(&script)
        .args(["serve", "--port", "0", "--no-ui", "--exit-with-stdin", "--token", &token])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if cfg!(debug_assertions) {
        // The dev UI is served by Vite.
        cmd.args(["--origin", "http://localhost:1420,http://127.0.0.1:1420"]);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return backend.fail(format!("Failed to start the LocalCode engine with {}: {e}", node.display())),
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *backend.child.lock().unwrap() = Some(child);

    if let Some(out) = stdout {
        let b = backend.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(json) = line.strip_prefix("LOCALCODE_READY ") {
                    match serde_json::from_str::<BackendInfo>(json) {
                        Ok(info) => {
                            b.status.lock().unwrap().info = Some(info);
                            b.ready.notify_all();
                        }
                        Err(e) => b.fail(format!("Engine sent an invalid ready message: {e}")),
                    }
                } else {
                    println!("[engine] {line}");
                }
            }
            b.fail("The LocalCode engine exited unexpectedly. Check the log output for details.".into());
        });
    }
    if let Some(err) = stderr {
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                eprintln!("[engine] {line}");
            }
        });
    }
}

fn stop_engine(backend: &Backend) {
    if let Some(mut child) = backend.child.lock().unwrap().take() {
        // Closing stdin asks the engine to shut down cleanly; kill if it does not.
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.flush();
            drop(stdin);
        }
        for _ in 0..20 {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
async fn backend_info(backend: tauri::State<'_, Arc<Backend>>) -> Result<BackendInfo, String> {
    let b = backend.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = b.status.lock().unwrap();
        let (guard, _) = b
            .ready
            .wait_timeout_while(guard, Duration::from_secs(90), |s| s.info.is_none() && s.error.is_none())
            .unwrap();
        match (&guard.info, &guard.error) {
            (Some(info), _) => Ok(info.clone()),
            (None, Some(err)) => Err(err.clone()),
            (None, None) => Err("The LocalCode engine did not start within 90 seconds.".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    let backend = Arc::new(Backend::default());
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(backend.clone())
        .invoke_handler(tauri::generate_handler![backend_info])
        .setup(move |app| {
            start_engine(app.handle(), backend.clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the LocalCode window");
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            let backend = handle.state::<Arc<Backend>>();
            stop_engine(&backend);
        }
    });
}
