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
  assert.match(cargo, /tauri-plugin-process/);
  assert.match(cargo, /tauri-plugin-window-state/);
  assert.match(cargo, /tray-icon/);
});

test("deep links register the Cavoti scheme on desktop and Android", () => {
  const config = JSON.parse(read("apps/tauri/src-tauri/tauri.conf.json"));
  const cargo = read("apps/tauri/src-tauri/Cargo.toml");
  const manifest = read(
    "apps/tauri/src-tauri/gen/android/app/src/main/AndroidManifest.xml",
  );

  assert.deepEqual(config.plugins["deep-link"].desktop.schemes, ["cavoti"]);
  assert.deepEqual(config.plugins["deep-link"].mobile, [
    { scheme: ["cavoti"], host: "open" },
  ]);
  assert.match(
    cargo,
    /tauri-plugin-single-instance\s*=\s*\{\s*version\s*=\s*"2",\s*features\s*=\s*\["deep-link"\]\s*\}/,
  );
  assert.match(manifest, /android\.intent\.action\.VIEW/);
  assert.match(manifest, /android\.intent\.category\.BROWSABLE/);
  assert.match(manifest, /android:scheme="cavoti"/);
  assert.match(manifest, /android:host="open"/);
});

test("deep-link handling is normalized before it crosses the host boundary", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const parser = read("apps/tauri/src-tauri/src/navigation.rs");
  const protocol = read("web/src/bridge/protocol.ts");

  assert.match(native, /on_open_url/);
  assert.match(native, /get_current/);
  assert.match(native, /host-navigation/);
  assert.match(native, /show_main_window/);
  assert.match(parser, /cavoti/);
  assert.match(parser, /open/);
  for (const route of ["overview", "usage", "plans", "status", "settings"]) {
    assert.match(parser, new RegExp(`\\b${route}\\b`));
  }
  assert.match(parser, /query/);
  assert.match(parser, /fragment/);
  assert.match(
    protocol,
    /target: "overview" \| "usage" \| "plans" \| "status" \| "settings"/,
  );
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
  assert.match(native, /CavotiAndroidResult/);
  assert.match(native, /CavotiAndroidResult\.postMessage\(JSON\.stringify\(payload\)\)/);
  assert.match(native, /invoke\('auth_collection_result', \{\{ payload: JSON\.stringify\(payload\) \}\}\)/);
  assert.doesNotMatch(native, /postAuthCollectionResult/);
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

test("desktop auth command bounds raw JSON before deserialization", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const auth = read("apps/tauri/src-tauri/src/auth.rs");

  assert.match(auth, /MAX_AUTH_PAYLOAD_BYTES/);
  assert.match(native, /payload: String/);
  assert.match(native, /payload\.as_bytes\(\)\.len\(\)/);
  assert.match(native, /serde_json::from_str::<AuthCollectionPayload>/);
});

test("auth probe matches the optional endpoint contract", () => {
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
  ]) {
    assert.match(auth, new RegExp(`\\b${endpoint}\\b`));
  }
  assert.match(auth, /page_size=100/);
  assert.match(auth, /model_source=requested/);
  assert.match(auth, /include_group_stats=true/);
  assert.match(auth, /mode: 'same-origin'/);
  assert.doesNotMatch(auth, /get\.geojs\.io|const geo|error: null|error: ['"](?:timeout|request)/);
});

test("startup and refresh route Android auth through the MainActivity session adapter", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const activity = read(
    "apps/tauri/src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );
  const gateTest = read(
    "apps/tauri/src-tauri/gen/android/app/src/test/java/com/cavoti/bar/SessionResultGateTest.kt",
  );
  const bridge = read("web/src/bridge/host.ts");

  assert.match(native, /start_android_session_probe/);
  assert.match(native, /emit_bootstrap[\s\S]*start_android_session_probe/);
  assert.match(native, /"refresh"[\s\S]*start_android_session_probe/);
  assert.match(native, /"connect"[\s\S]*start_android_session_probe/);
  assert.match(native, /dispatch_android_start_probe/);
  assert.match(native, /dispatch_android_abort_probe/);
  assert.match(native, /dispatch_android_hide_session/);
  assert.match(native, /dispatch_android_prepare_for_login/);
  assert.match(native, /ANDROID_JVM/);
  assert.match(native, /nativeActivityReady/);
  assert.doesNotMatch(native, /CavotiAndroidController/);
  assert.match(native, /nativeSubmitAuthResult/);
  assert.match(native, /nativeAbortAuthCollection/);
  assert.match(native, /collection_id\.is_empty\(\)/);
  assert.match(native, /nativeSessionDocumentReady/);
  assert.match(native, /replace_collection_with_request/);
  assert.match(native, /ANDROID_APP_HANDLE/);
  assert.match(native, /ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING/);
  assert.match(native, /swap\(false, Ordering::AcqRel\)/);
  assert.match(native, /android_probe_start_guard/);
  assert.match(native, /android_probe_start_guard[\s\S]*replace_collection_with_request/);
  assert.doesNotMatch(native, /nativeSubmitAuthResult[\s\S]{0,900}async_runtime::spawn/);
  assert.doesNotMatch(native, /android-auth-result/);
  assert.doesNotMatch(native, /activity_name\("AuthActivity"\)/);
  assert.doesNotMatch(native, /start_native_refresh|native_auth/);
  assert.match(activity, /class WebViewSessionAdapter/);
  assert.match(activity, /onWebViewCreate/);
  assert.match(activity, /CavotiAndroidResult/);
  assert.match(activity, /nativeActivityReady/);
  assert.match(activity, /dispatchStartProbe/);
  assert.match(activity, /dispatchAbortProbe/);
  assert.match(activity, /dispatchHideSession/);
  assert.match(activity, /dispatchPrepareForLogin/);
  assert.doesNotMatch(activity, /CavotiAndroidController|ControllerBridge|JavascriptInterface/);
  assert.doesNotMatch(activity, /addJavascriptInterface/);
  assert.match(activity, /WebViewCompat\.addWebMessageListener/);
  assert.match(activity, /WebViewFeature\.isFeatureSupported\([\s\S]*WebViewFeature\.WEB_MESSAGE_LISTENER/);
  assert.match(activity, /authCollectionBridgeUnavailable/);
  assert.match(native, /android_auth_bridge_unavailable/);
  assert.match(activity, /https:\/\/cavoti\.com/);
  assert.match(activity, /isMainFrame/);
  assert.match(activity, /sourceOrigin/);
  assert.doesNotMatch(activity, /sessionWebView\.addJavascriptInterface\(resultBridge/);
  assert.doesNotMatch(activity, /class ResultBridge/);
  assert.doesNotMatch(activity, /sessionWebView\.addJavascriptInterface\(this/);
  assert.doesNotMatch(activity, /mainWebView\.evaluateJavascript/);
  assert.match(activity, /activity\.submitAuthResult/);
  assert.match(activity, /private fun sanitizePayload/);
  assert.match(activity, /allowedTopLevel/);
  assert.match(activity, /allowedEndpointFields/);
  assert.match(activity, /MAX_COLLECTION_ID_BYTES/);
  assert.match(activity, /MAX_PHASE_BYTES/);
  assert.match(activity, /MAX_SESSION_STATE_BYTES/);
  assert.match(activity, /sanitizedPayload/);
  assert.doesNotMatch(activity, /submitAuthResult\(payload\)/);
  assert.match(activity, /class SessionResultGate/);
  assert.match(activity, /activeCollectionId/);
  assert.match(activity, /acceptedCore/);
  assert.match(activity, /acceptedEnrichment/);
  assert.match(activity, /setSessionVisible\(false\)/);
  assert.match(activity, /setSessionVisible\(show\)/);
  assert.match(activity, /MAX_RESULT_BYTES = 512 \* 1024/);
  assert.match(activity, /"pricing"/);
  assert.match(activity, /nativeSubmitAuthResult/);
  assert.match(activity, /abortNativeCollection/);
  assert.match(activity, /nativeAbortAuthCollection/);
  assert.match(activity, /prepareForLogin/);
  assert.match(activity, /sessionDocumentReady/);
  assert.match(activity, /onDestroy\(\)[\s\S]*abortNativeCollection\(\)[\s\S]*destroy\(\)/);
  assert.match(activity, /pendingNativeCollectionId/);
  assert.doesNotMatch(activity, /abortAuthCollection\(""\)/);
  assert.match(gateTest, /ignoresWrongIdAndDuplicateCoreResultsWithoutAbortingActiveCollection/);
  assert.match(gateTest, /acceptsOnlyTerminalEnrichmentAndIgnoresLateResults/);
  assert.match(gateTest, /acceptsTerminalEnrichmentWithoutCoreForScopedProbes/);
  assert.match(activity, /Decision\.Ignored/);
  assert.match(activity, /Decision\.Invalid/);
  assert.match(gateTest, /clearsACollectionAfterTerminalCoreFailure/);
  assert.match(gateTest, /abortClearsTheActiveCollection/);
  assert.match(gateTest, /preservesTerminalGenerationUntilAnewProbeBegins/);
  assert.match(gateTest, /rejectsStaleNativeCommandsAfterASecondProbeBegins/);
  assert.match(activity, /onPostMessage/);
  assert.match(activity, /abortProbe/);
  assert.match(activity, /!show && current\.path == "\/login"/);
  assert.match(activity, /shouldProbeCurrentDocument[\s\S]*sessionWebView\.evaluateJavascript\(script, null\)/);
  assert.match(activity, /current == null \|\| current\.host != "cavoti\.com"[\s\S]*sessionWebView\.loadUrl\(LOGIN_URL\)/);
  assert.doesNotMatch(bridge, /__cavotiAndroidAuthResult|android-auth-result/);
  assert.doesNotMatch(bridge, /getCookieHeader|sessionCookie/);
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
  assert.match(native, /else \{\s*let _ = window\.hide\(\);/);
  assert.match(native, /async fn open_auth_window[\s\S]{0,220}is_foreground\(\)/);
});

test("Android has no secondary auth activity or split embedding path", () => {
  const manifest = read(
    "apps/tauri/src-tauri/gen/android/app/src/main/AndroidManifest.xml",
  );
  const activity = read(
    "apps/tauri/src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );
  const native = read("apps/tauri/src-tauri/src/lib.rs");

  assert.doesNotMatch(manifest, /AuthActivity|SplitInitializer|PROPERTY_ACTIVITY_EMBEDDING_SPLITS_ENABLED/);
  assert.match(native, /#\[cfg\(not\(target_os = "android"\)\)\]\s*async fn open_auth_window/);
  assert.doesNotMatch(activity, /getCookieHeader|auth_token/);
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

test("desktop host actions use fixed opener destinations and the process restart API", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const host = read("apps/tauri/src-tauri/src/host.rs");
  assert.match(native, /resolve_external_command/);
  assert.match(native, /\.opener\(\)[\s\S]{0,40}\.open_url\(/);
  assert.match(native, /app\.request_restart\(\)/);
  assert.match(native, /\.plugin\(tauri_plugin_process::init\(\)\)/);
  assert.match(host, /https:\/\/cavoti\.com\/usage/);
  assert.match(host, /https:\/\/cavoti\.com\/monitor/);
  assert.match(host, /IpAddr/);
  assert.match(host, /iplocation\.net\/ip-lookup/);
  assert.match(host, /IP address is invalid/);
  assert.doesNotMatch(native, /ProcessStartInfo|std::process::Command/);
});

test("window state restores desktop geometry with an off-screen fallback", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  assert.match(native, /tauri_plugin_window_state::Builder::default\(\)/);
  assert.match(native, /StateFlags::SIZE/);
  assert.match(native, /StateFlags::POSITION/);
  assert.match(native, /StateFlags::MAXIMIZED/);
  assert.match(native, /skip_initial_state\("main"\)/);
  assert.match(native, /restore_main_window_state/);
  assert.match(native, /available_monitors\(\)/);
  assert.match(native, /intersection_width >= 32/);
  assert.match(native, /window\.unmaximize\(\)/);
  assert.match(native, /set_position\(PhysicalPosition::new/);
});

test("native notifications use normalized quota state without forwarding raw payloads", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const notifications = read("apps/tauri/src-tauri/src/notifications.rs");
  const quota = read("apps/tauri/src-tauri/src/quota.rs");
  assert.match(native, /notify_connection_state/);
  assert.match(native, /notify_quota_alerts/);
  assert.match(notifications, /NotificationExt/);
  assert.match(notifications, /create_channel/);
  assert.match(notifications, /Channel::builder\("cavoti-monitor"/);
  assert.match(notifications, /channel_ready/);
  assert.match(notifications, /Cavoti quota alert/);
  assert.match(notifications, /Usage monitoring is active/);
  assert.match(quota, /initialized/);
  assert.match(quota, /reset_at/);
  assert.match(quota, /notified/);
  assert.doesNotMatch(notifications, /AuthRawResults|auth_token|Authorization/);
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

test("Tauri advertises mobile capabilities and gates desktop-only permissions", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const mainCapability = JSON.parse(
    read("apps/tauri/src-tauri/capabilities/default.json"),
  );
  const desktopCapability = JSON.parse(
    read("apps/tauri/src-tauri/capabilities/desktop.json"),
  );

  assert.match(native, /type": "capabilities"/);
  assert.match(native, /titlebar_controls/);
  assert.match(native, /window_settings/);
  assert.deepEqual(mainCapability.permissions.includes("core:tray:default"), false);
  assert.deepEqual(desktopCapability.permissions.includes("core:tray:default"), true);
});

test("foreground lifecycle pauses collection and resumes one bounded probe", () => {
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const auth = read("apps/tauri/src-tauri/src/auth.rs");
  const lifecycle = read("apps/tauri/src-tauri/src/lifecycle.rs");
  const app = read("web/src/App.tsx");

  assert.match(native, /"lifecycle"/);
  assert.match(native, /__cavotiAuthAbort/);
  assert.match(native, /foreground_refresh_started/);
  assert.match(native, /abort_auth_collection\(app, state\)/);
  assert.match(native, /AUTH_COLLECTION_TIMEOUT/);
  assert.match(native, /is_foreground/);
  assert.match(auth, /try_begin_collection/);
  assert.match(lifecycle, /pause/);
  assert.match(lifecycle, /resume/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /action: "lifecycle"/);
});

test("Tauri builds the shared renderer without changing the web output", () => {
  const packageJson = read("web/package.json");
  const vite = read("web/vite.config.ts");
  const config = read("apps/tauri/src-tauri/tauri.conf.json");
  assert.match(packageJson, /"build:tauri"/);
  assert.match(vite, /mode === "tauri"/);
  assert.match(vite, /apps\/tauri\/dist/);
  assert.match(config, /"frontendDist": "\.\.\/dist"/);
});

test("Tauri development and release scripts stop stale binaries before launching", () => {
  const dev = read("scripts/tauri-dev.ps1");
  const build = read("scripts/build-tauri-release.ps1");
  const run = read("scripts/run-tauri-release.ps1");
  const packageJson = JSON.parse(read("apps/tauri/package.json"));

  assert.match(dev, /Stop-CavotiProcesses/);
  assert.match(dev, /run\", \"tauri\", \"dev/);
  assert.match(build, /Stop-CavotiProcesses/);
  assert.match(build, /build\", \"--no-bundle/);
  assert.match(build, /Get-ReleaseExecutable/);
  assert.match(run, /Stop-CavotiProcesses/);
  assert.match(run, /Start-Process/);
  assert.match(packageJson.scripts.dev, /tauri-dev\.ps1/);
  assert.match(packageJson.scripts.release, /run-tauri-release\.ps1/);
});

test("Cavoti packages a signed custom bootstrapper installer and updater", () => {
  const config = JSON.parse(read("apps/tauri/src-tauri/tauri.conf.json"));
  const packageJson = JSON.parse(read("apps/tauri/package.json"));
  const installer = read("installer/InstallerLogic.cs");
  const project = read("installer/CavotiBarSetup.csproj");
  const updates = read("apps/tauri/src-tauri/src/updates.rs");
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const build = read("scripts/build-tauri-installer.ps1");
  const workflow = read(".github/workflows/windows-release.yml");
  const gitignore = read(".gitignore");

  assert.equal(config.bundle.active, false);
  assert.deepEqual(config.bundle.targets, []);
  assert.doesNotMatch(JSON.stringify(config.bundle), /nsis|msi/i);
  assert.match(project, /CavotiBarSetup/);
  assert.match(project, /ApplicationIcon.*icons\\icon\.ico/);
  assert.match(project, /Company>115jon<\/Company>/);
  assert.match(project, /Product>Cavoti Bar Setup<\/Product>/);
  assert.equal(config.bundle.publisher, "115jon");
  assert.match(installer, /payload\.zip/);
  assert.match(installer, /StatePath/);
  assert.match(installer, /UpdatePath/);
  assert.match(installer, /RootIconPath/);
  assert.match(installer, /DeepLinkRegistration/);
  assert.equal(config.plugins.updater.windows.installMode, "passive");
  assert.match(config.plugins.updater.endpoints[0], /latest\.json$/);
  assert.match(config.plugins.updater.pubkey, /^[A-Za-z0-9+/=]+$/);
  assert.match(updates, /check_for_update/);
  assert.match(updates, /install_update/);
  assert.match(updates, /download_and_install/);
  assert.match(native, /tauri_plugin_updater::Builder/);
  assert.match(native, /updates::spawn_startup_check/);
  assert.match(native, /"install-update" =>/);
  assert.match(build, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(build, /Import-CavotiEnv/);
  assert.match(build, /run\", \"tauri\", \"build/);
  assert.match(build, /CavotiBarSetup\.exe/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /latest\.json/);
  assert.match(workflow, /gh release create/);
  assert.match(packageJson.scripts["build:installer"], /build-tauri-installer\.ps1/);
  assert.match(gitignore, /^\.env$/m);
});

test("Cavoti packages a signed Android APK without repository keystores", () => {
  const config = JSON.parse(read("apps/tauri/src-tauri/tauri.conf.json"));
  const script = read("scripts/build-tauri-android-release.ps1");
  const envExample = read(".env.example");
  const gitignore = read(".gitignore");
  const notifications = read("apps/tauri/src-tauri/src/notifications.rs");
  const app = read("web/src/App.tsx");
  const indexHtml = read("web/index.html");
  const indexCss = read("web/src/index.css");
  const appShell = read("web/src/components/app/AppShell.tsx");
  const native = read("apps/tauri/src-tauri/src/lib.rs");
  const androidGradle = read("apps/tauri/src-tauri/gen/android/app/build.gradle.kts");
  const androidManifest = read("apps/tauri/src-tauri/gen/android/app/src/main/AndroidManifest.xml");
  const activity = read(
    "apps/tauri/src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );

  assert.equal(config.identifier, "com.cavoti.bar");
  assert.ok(config.bundle.android.versionCode > 1000);
  assert.match(script, /tauri.*android.*build.*--apk/);
  assert.match(script, /\[string\]\$DeviceSerial\s*=\s*""/);
  assert.match(script, /Import-CavotiAndroidEnv[\s\S]*DeviceSerial[\s\S]*ANDROID_DEVICE_SERIAL/);
  assert.match(script, /PSBoundParameters\.ContainsKey\("DeviceSerial"\)/);
  assert.match(script, /Remove-Item[\s\S]*apkOutputDirectory/);
  assert.match(script, /apks\.Count -ne 1/);
  assert.match(script, /keystore\.properties/);
  assert.match(script, /apksigner/);
  assert.match(script, /adb\.Source -s \$DeviceSerial install -r/);
  assert.match(script, /CAVOTI_ANDROID_KEYSTORE_FILE/);
  assert.doesNotMatch(script, /create\("release"\)/);
  assert.match(envExample, /CAVOTI_ANDROID_KEYSTORE_FILE/);
  assert.match(gitignore, /\*\.jks/);
  assert.match(gitignore, /gen\/android\/keystore\.properties/);
  assert.match(notifications, /channel_id\("cavoti-monitor"\)/);
  assert.match(app, /createChannel/);
  assert.match(app, /id: "cavoti-monitor"/);
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(indexCss, /safe-area-inset-top/);
  assert.match(appShell, /h-\[100dvh\]/);
  assert.match(appShell, /var\(--safe-area-bottom\)/);
  assert.match(native, /get_webview_window\("main"\)/);
  assert.match(native, /emit_to\("main", "host-event"/);
  assert.match(native, /latest_snapshot/);
  assert.match(native, /emit_latest_snapshot/);
  assert.match(native, /without an active probe; starting recovery probe/);
  assert.match(native, /has_cached_snapshot/);
  assert.match(native, /aborted && !has_cached_snapshot\(&state\)/);
  assert.match(native, /ensure_permission\(app\)/);
  assert.match(native, /notifications\.initialize\(app\.handle\(\)\)/);
  assert.match(native, /android_auth_collection_result/);
  assert.match(androidGradle, /name\.endsWith\("Release"\)/);
  assert.match(androidGradle, /"package"/);
  assert.match(native, /if terminal/);
  assert.match(native, /raw\.phase == "enrichment" && raw\.session_state == "authenticated"[\s\S]*cache_snapshot/);
  assert.match(native, /Stale auth collection result/);
  assert.doesNotMatch(native, /activity_name\("AuthActivity"\)/);
  assert.match(activity, /CookieManager\.getInstance\(\)/);
  assert.match(activity, /setAcceptCookie\(true\)/);
  assert.match(activity, /domStorageEnabled = true/);
  assert.match(activity, /setSessionVisible\(false\)/);
  assert.match(activity, /setSessionVisible\(show\)/);
  assert.match(androidGradle, /androidx\.webkit:webkit/);
  assert.doesNotMatch(androidGradle, /androidx\.window:window|androidx\.startup:startup-runtime/);
  assert.doesNotMatch(androidManifest, /AuthActivity|SplitInitializer|PROPERTY_ACTIVITY_EMBEDDING_SPLITS_ENABLED/);
});

test("Windows release signing is tag-scoped and version-checked before secrets", () => {
  const workflow = read(".github/workflows/windows-release.yml");
  assert.doesNotMatch(workflow, /workflow_dispatch/);
  assert.match(workflow, /RELEASE_REF/);
  assert.match(workflow, /refs\/tags\/v/);
  assert.match(workflow, /tauri\.conf\.json/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY:/);
  assert.match(workflow, /Build custom Cavoti installer[\s\S]*TAURI_SIGNING_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /github\.ref_name.*release create/);
});

test("Android release signing restores pre-existing keystore properties", () => {
  const script = read("scripts/build-tauri-android-release.ps1");
  assert.match(script, /keystorePropertiesExisted/);
  assert.match(script, /ReadAllBytes/);
  assert.match(script, /WriteAllBytes/);
  assert.match(script, /keystorePropertiesExisted[\s\S]*finally/);
  assert.match(script, /Remove-Item[\s\S]*keystorePropertiesFile/);
});

test("installer signing consumes exported environment secrets", () => {
  const script = read("scripts/build-tauri-installer.ps1");
  assert.match(script, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.match(script, /signArguments = @\("run", "tauri", "signer", "sign", \$installerOutput\)/);
  assert.doesNotMatch(script, /signer", "sign", "-k"/);
  assert.doesNotMatch(script, /signArguments.*-p/);
});
