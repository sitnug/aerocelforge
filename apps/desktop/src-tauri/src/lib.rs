use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::{Disks, System};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCapability {
    id: String,
    name: String,
    available: bool,
    version: Option<String>,
    executable_path: Option<String>,
    mode: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemProfile {
    operating_system: String,
    architecture: String,
    memory_gb: f64,
    available_disk_gb: f64,
    on_battery: Option<bool>,
    capabilities: Vec<ToolCapability>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    file_name: String,
    name: String,
    revision: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRequest {
    app_version: String,
    project_name: Option<String>,
    recent_errors: Vec<String>,
}

fn first_version_line(path: &Path, arguments: &[&str]) -> Option<String> {
    let mut child = Command::new(path)
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started_at.elapsed() < Duration::from_secs(2) => {
                thread::sleep(Duration::from_millis(20));
            }
            Ok(None) => {
                let _ = child.kill();
                break;
            }
            Err(_) => {
                let _ = child.kill();
                break;
            }
        }
    }
    let output = child.wait_with_output().ok()?;
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(160).collect())
}

fn redact_diagnostic_text(input: &str) -> String {
    let mut sanitized = input.replace("PRIVATE KEY", "[REDACTED]");
    for variable in ["HOME", "USER", "LOGNAME"] {
        if let Ok(value) = std::env::var(variable) {
            if !value.is_empty() {
                sanitized = sanitized.replace(&value, "[REDACTED]");
            }
        }
    }
    sanitized
        .lines()
        .map(|line| {
            let lowercase = line.to_ascii_lowercase();
            if [
                "authorization: bearer ",
                "access_token=",
                "api_key=",
                "password=",
                "secret=",
                "token=",
            ]
            .iter()
            .any(|marker| lowercase.contains(marker))
            {
                "[REDACTED SECRET ASSIGNMENT]".to_string()
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(2_000)
        .collect()
}

fn detect_tool(
    id: &str,
    name: &str,
    executable: &str,
    arguments: &[&str],
    mode: &str,
) -> ToolCapability {
    match which::which(executable) {
        Ok(path) => ToolCapability {
            id: id.to_string(),
            name: name.to_string(),
            available: true,
            version: first_version_line(&path, arguments),
            executable_path: Some(path.to_string_lossy().into_owned()),
            mode: mode.to_string(),
            reason: "Executable detected; run the verification case before engineering use"
                .to_string(),
        },
        Err(_) => ToolCapability {
            id: id.to_string(),
            name: name.to_string(),
            available: false,
            version: None,
            executable_path: None,
            mode: mode.to_string(),
            reason: "Executable was not found on the current PATH".to_string(),
        },
    }
}

fn safe_file_name(file_name: &str, extension: &str) -> Result<String, String> {
    if file_name.is_empty() || file_name.len() > 96 {
        return Err("Project file name must contain 1–96 characters".to_string());
    }
    let base = file_name.strip_suffix(extension).unwrap_or(file_name);
    if base.is_empty()
        || base.starts_with('.')
        || !base.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ' ')
        })
    {
        return Err("Project file name contains unsupported characters".to_string());
    }
    Ok(format!("{base}{extension}"))
}

fn safe_import_file_name(file_name: &str) -> Result<String, String> {
    if file_name.is_empty()
        || file_name.len() > 180
        || file_name.starts_with('.')
        || file_name.contains("..")
        || !file_name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ' ')
        })
    {
        return Err("Import file name contains unsupported characters".to_string());
    }
    Ok(file_name.to_string())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
}

fn managed_directory(app: &tauri::AppHandle, child: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not resolve application data directory: {error}"))?;
    let directory = root.join(child);
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Could not create {} directory: {error}",
            directory.display()
        )
    })?;
    Ok(directory)
}

#[tauri::command]
fn system_profile() -> SystemProfile {
    let system = System::new_all();
    let disks = Disks::new_with_refreshed_list();
    let available_disk_bytes = disks
        .list()
        .iter()
        .map(|disk| disk.available_space())
        .max()
        .unwrap_or(0);
    let capabilities = vec![
        detect_tool("python", "Python", "python3", &["--version"], "native_mac"),
        detect_tool("ssh", "OpenSSH", "ssh", &["-V"], "remote_linux"),
        detect_tool("docker", "Docker", "docker", &["--version"], "local_linux"),
        detect_tool("colima", "Colima", "colima", &["version"], "local_linux"),
        detect_tool("limactl", "Lima", "limactl", &["--version"], "local_linux"),
        detect_tool("orb", "OrbStack", "orb", &["version"], "local_linux"),
        detect_tool("openvsp", "OpenVSP", "vsp", &["--help"], "native_mac"),
        detect_tool("vspaero", "VSPAERO", "vspaero", &[], "native_mac"),
        detect_tool("openfoam", "OpenFOAM", "foamVersion", &[], "local_linux"),
        detect_tool("su2", "SU2", "SU2_CFD", &["--help"], "local_linux"),
        detect_tool("jsbsim", "JSBSim", "JSBSim", &["--version"], "native_mac"),
        detect_tool("px4", "PX4 SITL", "px4", &["--version"], "local_linux"),
        detect_tool("gazebo", "Gazebo", "gz", &["--version"], "local_linux"),
        detect_tool("ffmpeg", "FFmpeg", "ffmpeg", &["-version"], "native_mac"),
    ];
    SystemProfile {
        operating_system: System::long_os_version()
            .unwrap_or_else(|| std::env::consts::OS.to_string()),
        architecture: std::env::consts::ARCH.to_string(),
        memory_gb: system.total_memory() as f64 / 1_073_741_824.0,
        available_disk_gb: available_disk_bytes as f64 / 1_073_741_824.0,
        on_battery: None,
        capabilities,
    }
}

#[tauri::command]
fn save_project(
    app: tauri::AppHandle,
    file_name: String,
    project: Value,
) -> Result<String, String> {
    let version = project
        .get("schemaVersion")
        .and_then(Value::as_str)
        .ok_or_else(|| "Project does not contain a string schemaVersion".to_string())?;
    if version != "1.0.0" {
        return Err(format!("Unsupported project schema version: {version}"));
    }
    let file_name = safe_file_name(&file_name, ".aerocel.json")?;
    let directory = managed_directory(&app, "projects")?;
    let target = directory.join(file_name);
    let temporary = target.with_extension("aerocel.json.tmp");
    let bytes = serde_json::to_vec_pretty(&project)
        .map_err(|error| format!("Could not serialize project: {error}"))?;
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write temporary project: {error}"))?;
    fs::rename(&temporary, &target)
        .map_err(|error| format!("Could not atomically save project: {error}"))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_project(app: tauri::AppHandle, file_name: String) -> Result<Value, String> {
    let file_name = safe_file_name(&file_name, ".aerocel.json")?;
    let path = managed_directory(&app, "projects")?.join(file_name);
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read project {}: {error}", path.display()))?;
    serde_json::from_str(&content).map_err(|error| format!("Project JSON is invalid: {error}"))
}

#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<ProjectSummary>, String> {
    let directory = managed_directory(&app, "projects")?;
    let mut projects = Vec::new();
    for entry in
        fs::read_dir(directory).map_err(|error| format!("Could not list projects: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Could not inspect a project entry: {error}"))?;
        let path = entry.path();
        if !path.is_file() || !path.to_string_lossy().ends_with(".aerocel.json") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&content) else {
            continue;
        };
        projects.push(ProjectSummary {
            file_name: entry.file_name().to_string_lossy().into_owned(),
            name: value
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Unnamed project")
                .to_string(),
            revision: value
                .get("revision")
                .and_then(Value::as_str)
                .unwrap_or("Unknown")
                .to_string(),
            updated_at: value
                .get("updatedAt")
                .and_then(Value::as_str)
                .unwrap_or("Unknown")
                .to_string(),
        });
    }
    projects.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(projects)
}

#[tauri::command]
fn write_report(app: tauri::AppHandle, file_name: String, html: String) -> Result<String, String> {
    if html.len() > 20_000_000 {
        return Err("Report exceeds the 20 MB local export limit".to_string());
    }
    let file_name = safe_file_name(&file_name, ".html")?;
    let path = managed_directory(&app, "reports")?.join(file_name);
    fs::write(&path, html).map_err(|error| format!("Could not write report: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn archive_geometry_source(
    app: tauri::AppHandle,
    file_name: String,
    source_sha256: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    const MAX_SOURCE_BYTES: usize = 25 * 1024 * 1024;
    if bytes.is_empty() || bytes.len() > MAX_SOURCE_BYTES {
        return Err("Geometry source must contain 1 byte to 25 MB".to_string());
    }
    if !valid_sha256(&source_sha256) {
        return Err("Geometry source SHA-256 is invalid".to_string());
    }
    let actual_sha256 = format!("{:x}", Sha256::digest(&bytes));
    if actual_sha256 != source_sha256 {
        return Err("Geometry source content does not match its SHA-256".to_string());
    }
    let file_name = safe_import_file_name(&file_name)?;
    let directory = managed_directory(&app, "imports")?.join(&source_sha256);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create geometry archive directory: {error}"))?;
    let target = directory.join(&file_name);
    let temporary = directory.join(format!("{file_name}.tmp"));
    fs::write(&temporary, bytes)
        .map_err(|error| format!("Could not write geometry archive: {error}"))?;
    fs::rename(&temporary, &target)
        .map_err(|error| format!("Could not atomically archive geometry source: {error}"))?;
    Ok(format!("managed-import://{source_sha256}/{file_name}"))
}

#[tauri::command]
fn load_geometry_source(
    app: tauri::AppHandle,
    file_name: String,
    source_sha256: String,
) -> Result<Vec<u8>, String> {
    if !valid_sha256(&source_sha256) {
        return Err("Geometry source SHA-256 is invalid".to_string());
    }
    let file_name = safe_import_file_name(&file_name)?;
    let path = managed_directory(&app, "imports")?
        .join(&source_sha256)
        .join(file_name);
    let bytes = fs::read(&path).map_err(|error| {
        format!(
            "Could not read archived geometry {}: {error}",
            path.display()
        )
    })?;
    if bytes.is_empty() || bytes.len() > 25 * 1024 * 1024 {
        return Err("Archived geometry source is empty or exceeds 25 MB".to_string());
    }
    let actual_sha256 = format!("{:x}", Sha256::digest(&bytes));
    if actual_sha256 != source_sha256 {
        return Err("Archived geometry source failed its SHA-256 integrity check".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
fn create_diagnostic_bundle(
    app: tauri::AppHandle,
    request: DiagnosticRequest,
) -> Result<String, String> {
    let profile = system_profile();
    let sanitized_errors: Vec<String> = request
        .recent_errors
        .iter()
        .take(50)
        .map(|entry| redact_diagnostic_text(entry))
        .collect();
    let payload = serde_json::json!({
        "appVersion": request.app_version,
        "projectName": request.project_name,
        "generatedAtUnixSeconds": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default(),
        "system": profile,
        "recentErrors": sanitized_errors,
        "notice": "Secrets, project geometry, result fields, and SSH private keys are intentionally excluded."
    });
    let path = managed_directory(&app, "diagnostics")?.join("aerocel-diagnostics.json");
    let bytes = serde_json::to_vec_pretty(&payload)
        .map_err(|error| format!("Could not serialize diagnostics: {error}"))?;
    fs::write(&path, bytes).map_err(|error| format!("Could not write diagnostics: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            system_profile,
            save_project,
            load_project,
            list_projects,
            write_report,
            archive_geometry_source,
            load_geometry_source,
            create_diagnostic_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aerocel Forge");
}

#[cfg(test)]
mod tests {
    use super::{redact_diagnostic_text, safe_file_name, safe_import_file_name, valid_sha256};

    #[test]
    fn project_file_names_reject_traversal() {
        assert!(safe_file_name("../escape", ".aerocel.json").is_err());
        assert!(safe_file_name("Kestrel Baseline", ".aerocel.json").is_ok());
    }

    #[test]
    fn diagnostics_redact_common_secret_shapes() {
        let input = "token=abc123\nnormal convergence warning";
        let redacted = redact_diagnostic_text(input);
        assert!(!redacted.contains("abc123"));
        assert!(redacted.contains("normal convergence warning"));
    }

    #[test]
    fn import_names_and_hashes_reject_traversal() {
        assert!(safe_import_file_name("../wing.stl").is_err());
        assert!(safe_import_file_name("wing.stl").is_ok());
        assert!(valid_sha256(&"a".repeat(64)));
        assert!(!valid_sha256(&"A".repeat(64)));
    }
}
