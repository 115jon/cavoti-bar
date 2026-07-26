import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Tauri shell is configured as the Cavoti product", () => {
  const config = read("apps/tauri/src-tauri/tauri.conf.json");
  const cargo = read("apps/tauri/src-tauri/Cargo.toml");
  assert.match(config, /"productName": "Cavoti Bar"/);
  assert.match(config, /"identifier": "com\.cavoti\.bar"/);
  assert.match(cargo, /tauri-plugin-autostart/);
  assert.match(cargo, /tauri-plugin-deep-link/);
  assert.match(cargo, /tauri-plugin-notification/);
  assert.match(cargo, /tauri-plugin-single-instance/);
  assert.match(cargo, /tauri-plugin-store/);
  assert.match(cargo, /tray-icon/);
});

test("Tauri keeps remote auth in a separate, narrowly scoped capability", () => {
  const capability = JSON.parse(
    read("apps/tauri/src-tauri/capabilities/auth.json"),
  );
  const permission = read("apps/tauri/src-tauri/permissions/auth.toml");
  const config = read("apps/tauri/src-tauri/tauri.conf.json");

  assert.deepEqual(capability.windows, ["auth"]);
  assert.deepEqual(capability.remote.urls, ["https://cavoti.com/*"]);
  assert.deepEqual(capability.permissions, ["auth-collection-result"]);
  assert.match(permission, /auth_collection_result/);
  assert.match(config, /"capabilities"\s*:\s*\[[\s\S]*"default"[\s\S]*"desktop-capability"[\s\S]*"auth"/);
  assert.doesNotMatch(read("apps/tauri/src-tauri/capabilities/default.json"), /"auth"/);
});

test("auth collection validates origin, phases, terminal results, and payload bounds", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const auth = read("apps/tauri/src-tauri/src/auth.rs");

  assert.match(native, /auth_collection_result/);
  assert.match(native, /AUTH_WINDOW_LABEL/);
  assert.match(native, /is_cavoti_origin/);
  assert.match(native, /window\.label\(\)\s*==\s*AUTH_WINDOW_LABEL/);
  assert.match(native, /window\.navigate\(login_url\.clone\(\)\)/);
  assert.match(native, /raw\.phase == "enrichment"/);
  assert.match(native, /window\.hide\(\)/);
  assert.match(native, /start_dragging\(\)/);
  assert.match(native, /TrayIconBuilder::new\(\)[\s\S]*\.icon\(/);
  assert.match(native, /\.icon\(/);
  assert.match(auth, /MAX_AUTH_RESULT_BYTES/);
  assert.match(auth, /collection_id/);
  assert.match(auth, /phase/);
  assert.match(auth, /complete/);
  assert.match(auth, /stale|Stale/i);
  assert.match(auth, /timeout|Timeout/);
});

test("auth probe never sends tokens or unbounded page data across the bridge", () => {
  const native = read("apps/tauri/src-tauri/src/auth.rs");

  assert.match(native, /localStorage\.getItem\('auth_token'\)/);
  assert.match(native, /Authorization/);
  assert.match(native, /MAX_AUTH_RESULT_BYTES/);
  assert.match(native, /auth-results-internal/);
  assert.doesNotMatch(native, /emit_event\([^)]*auth-results-internal/);
  assert.match(native, /\.slice\(0,\s*\{max_bytes\}\)/);
  assert.match(native, /const send = \(phase, complete, sessionState, results\)/);
  assert.match(native, /send\('enrichment', true, sessionState, results\)/);
  assert.doesNotMatch(native, /authToken[^\n]*results/);
  assert.match(native, /window\.ipc\.postMessage/);
  assert.doesNotMatch(native, /internals\.ipc/);
  assert.doesNotMatch(native, /__TAURI_INTERNALS__\?\.invoke/);
});

test("auth probe uses Tauri's runtime invoke key on postMessage", () => {
  const auth = read("apps/tauri/src-tauri/src/auth.rs");
  const native = read("apps/tauri/src-tauri/src/lib.rs");

  assert.match(native, /\.invoke_key\(\)/);
  assert.match(auth, /__TAURI_INVOKE_KEY__:\s*invokeKey/);
  assert.match(auth, /typeof invokeKey !== ['"]string['"]/);
  assert.match(auth, /invoke key unavailable/i);
  assert.doesNotMatch(auth, /fetch\([^\n]*ipc/);
});

test("auth probe matches the WPF optional endpoint contract", () => {
  const auth = read("apps/tauri/src-tauri/src/auth.rs");

  for (const endpoint of [
    "usage",
    "errors",
    "keys",
    "quota",
    "banner",
    "announcements",
    "status",
    "groups",
    "geo",
  ]) {
    assert.match(auth, new RegExp(`\\b${endpoint}\\b`));
  }
  assert.match(auth, /page_size=100/);
  assert.match(auth, /model_source=requested/);
  assert.match(auth, /include_group_stats=true/);
  assert.match(auth, /mode: 'same-origin'/);
  assert.match(auth, /get\.geojs\.io\/v1\/ip\/geo/);
});

test("startup auth restore is hidden, persistent, and terminally hides the window", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");

  assert.match(native, /start_auth_session_probe/);
  assert.match(native, /visible\(show\)/);
  assert.match(native, /AuthProbeRequest::default\(\),\n\s+false/);
  assert.match(native, /data_directory\(/);
  assert.match(native, /startup_probe_started/);
  assert.match(native, /window\.hide\(\)/);
  assert.doesNotMatch(native, /raw\.phase == "enrichment"[\s\S]{0,160}window\.close\(\)/);
});

test("auth window creation is reached through an async command path", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");

  assert.match(native, /async fn open_auth_window/);
  assert.match(native, /async fn host_command/);
  assert.doesNotMatch(native, /\nfn open_auth_window/);
  assert.doesNotMatch(native, /\nfn host_command/);
});

test("manual connect restores and explicitly navigates the visible auth window", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  assert.match(native, /window\.show\(\)/);
  assert.match(native, /window\.unminimize\(\)/);
  assert.match(native, /window\.navigate\(login_url\.clone\(\)/);
  assert.match(native, /window\.set_focus\(\)/);
});

test("settings persist through the Tauri store and drive native refresh behavior", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const cargo = read("apps/tauri/src-tauri/Cargo.toml");
  assert.match(cargo, /tauri-plugin-store/);
  assert.match(native, /use tauri_plugin_store::StoreExt/);
  assert.match(native, /app\.store\(SETTINGS_STORE\)/);
  assert.match(native, /store[\s\S]{0,80}\.save\(\)/);
  assert.match(native, /start_refresh_scheduler/);
  assert.match(native, /refresh_interval_seconds/);
  assert.match(native, /current_settings\(state\.inner\(\)\)\.close_to_tray/);
  assert.match(native, /autolaunch\(\)/);
});

test("Tauri host uses typed command and event boundaries", () => {
  const host = read("web/src/bridge/host.ts");
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const mainCapability = read("apps/tauri/src-tauri/capabilities/default.json");
  assert.match(host, /@tauri-apps\/api\/core/);
  assert.match(host, /@tauri-apps\/api\/event/);
  assert.match(host, /chrome\?:[\s\S]*webview/);
  assert.match(native, /host_command/);
  assert.match(native, /host-event/);
  assert.match(native, /auth-required/);
  assert.match(native, /auth_collection_result/);
  assert.match(native, /"loading"/);
  assert.match(host, /unlistenEvents/);
  assert.match(host, /unlistenCommands/);
  assert.match(read("apps/tauri/src-tauri/tauri.conf.json"), /"withGlobalTauri": true/);
  assert.match(mainCapability, /"host-command"/);
  assert.match(read("apps/tauri/src-tauri/permissions/main.toml"), /host_command/);
  assert.match(read("apps/tauri/src-tauri/tauri.conf.json"), /http:\/\/ipc\.localhost/);
});

test("Tauri builds the shared renderer without changing the WPF output", () => {
  const packageJson = read("web/package.json");
  const vite = read("web/vite.config.ts");
  const config = read("apps/tauri/src-tauri/tauri.conf.json");
  assert.match(packageJson, /"build:tauri"/);
  assert.match(vite, /mode === "tauri"/);
  assert.match(vite, /apps\/tauri\/dist/);
  assert.match(config, /"frontendDist": "\.\.\/dist"/);
});
