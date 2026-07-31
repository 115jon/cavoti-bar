import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("repository uses the root application layout", () => {
  for (const requiredPath of ["package.json", "src", "public", "src-tauri"]) {
    assert.equal(fs.existsSync(path.join(root, requiredPath)), true, requiredPath);
  }
  for (const legacyPath of [
    "web/package.json",
    "web/vite.config.ts",
    "web/index.html",
    "apps/tauri/package.json",
    "apps/tauri/src-tauri/tauri.conf.json",
  ]) {
    assert.equal(fs.existsSync(path.join(root, legacyPath)), false, legacyPath);
  }

  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const native = read("src-tauri/src/lib.rs");
  assert.equal(config.build.beforeDevCommand, "bun run dev:tauri");
  assert.equal(config.build.beforeBuildCommand, "bun run build:tauri");
  assert.match(native, /include_bytes!\(\s*"\.\.\/\.\.\/public\/favicon\.png"/);
});

test("Tauri shell is configured as the Cavoti product", () => {
  const config = read("src-tauri/tauri.conf.json");
  const cargo = read("src-tauri/Cargo.toml");
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
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const cargo = read("src-tauri/Cargo.toml");
  const manifest = read(
    "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
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
  const native = read("src-tauri/src/lib.rs");
  const parser = read("src-tauri/src/navigation.rs");
  const protocol = read("src/bridge/protocol.ts");

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
    read("src-tauri/capabilities/auth.json"),
  );
  const permission = read("src-tauri/permissions/auth.toml");
  const config = read("src-tauri/tauri.conf.json");

  assert.deepEqual(capability.windows, ["auth"]);
  assert.deepEqual(capability.remote.urls, ["https://cavoti.com/*"]);
  assert.deepEqual(capability.permissions, ["auth-collection-result"]);
  assert.match(permission, /auth_collection_result/);
  assert.match(config, /"capabilities"\s*:\s*\[[\s\S]*"default"[\s\S]*"desktop-capability"[\s\S]*"auth"/);
  assert.doesNotMatch(read("src-tauri/capabilities/default.json"), /"auth"/);
});

test("auth collection validates origin, phases, terminal results, and payload bounds", () => {
  const native = read("src-tauri/src/lib.rs");
  const auth = read("src-tauri/src/auth.rs");

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
  const native = read("src-tauri/src/auth.rs");

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
  const auth = read("src-tauri/src/auth.rs");
  const native = read("src-tauri/src/lib.rs");

  assert.match(native, /\.invoke_key\(\)/);
  assert.match(auth, /__TAURI_INVOKE_KEY__:\s*invokeKey/);
  assert.match(auth, /typeof invokeKey !== ['"]string['"]/);
  assert.match(auth, /invoke key unavailable/i);
  assert.doesNotMatch(auth, /fetch\([^\n]*ipc/);
});

test("desktop auth command bounds raw JSON before deserialization", () => {
  const native = read("src-tauri/src/lib.rs");
  const auth = read("src-tauri/src/auth.rs");

  assert.match(auth, /MAX_AUTH_PAYLOAD_BYTES/);
  assert.match(native, /payload: String/);
  assert.match(native, /payload\.as_bytes\(\)\.len\(\)/);
  assert.match(native, /serde_json::from_str::<AuthCollectionPayload>/);
});

test("auth probe matches the optional endpoint contract", () => {
  const auth = read("src-tauri/src/auth.rs");

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
  const native = read("src-tauri/src/lib.rs");
  const activity = read(
    "src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );
  const gateTest = read(
    "src-tauri/gen/android/app/src/test/java/com/cavoti/bar/SessionResultGateTest.kt",
  );
  const bridge = read("src/bridge/host.ts");

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
  assert.doesNotMatch(activity, /CavotiAndroidController|ControllerBridge/);
  assert.match(activity, /LegacyResultBridge/);
  assert.match(activity, /addJavascriptInterface\(LegacyResultBridge\(this\), "CavotiAndroidResult"\)/);
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
  const native = read("src-tauri/src/lib.rs");

  assert.match(native, /async fn open_auth_window/);
  assert.match(native, /async fn host_command/);
  assert.doesNotMatch(native, /\nfn open_auth_window/);
  assert.doesNotMatch(native, /\nfn host_command/);
});

test("manual connect restores and explicitly navigates the visible auth window", () => {
  const native = read("src-tauri/src/lib.rs");
  assert.match(native, /window\.show\(\)/);
  assert.match(native, /window\.unminimize\(\)/);
  assert.match(native, /window\.navigate\(login_url\.clone\(\)/);
  assert.match(native, /window\.set_focus\(\)/);
  assert.match(native, /else \{\s*let _ = window\.hide\(\);/);
  assert.match(native, /async fn open_auth_window[\s\S]{0,220}is_foreground\(\)/);
});

test("Android has no secondary auth activity or split embedding path", () => {
  const manifest = read(
    "src-tauri/gen/android/app/src/main/AndroidManifest.xml",
  );
  const activity = read(
    "src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );
  const native = read("src-tauri/src/lib.rs");

  assert.doesNotMatch(manifest, /AuthActivity|SplitInitializer|PROPERTY_ACTIVITY_EMBEDDING_SPLITS_ENABLED/);
  assert.match(native, /#\[cfg\(not\(target_os = "android"\)\)\]\s*async fn open_auth_window/);
  assert.doesNotMatch(activity, /getCookieHeader|auth_token/);
});

test("settings persist through the Tauri store and drive native refresh behavior", () => {
  const native = read("src-tauri/src/lib.rs");
  const cargo = read("src-tauri/Cargo.toml");
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
  const native = read("src-tauri/src/lib.rs");
  const host = read("src-tauri/src/host.rs");
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
  const native = read("src-tauri/src/lib.rs");
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
  const native = read("src-tauri/src/lib.rs");
  const notifications = read("src-tauri/src/notifications.rs");
  const quota = read("src-tauri/src/quota.rs");
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
  const host = read("src/bridge/host.ts");
  const native = read("src-tauri/src/lib.rs");
  const mainCapability = read("src-tauri/capabilities/default.json");
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
  assert.match(read("src-tauri/tauri.conf.json"), /"withGlobalTauri": true/);
  assert.match(mainCapability, /"host-command"/);
  assert.match(read("src-tauri/permissions/main.toml"), /host_command/);
  assert.match(read("src-tauri/tauri.conf.json"), /http:\/\/ipc\.localhost/);
});

test("Tauri advertises mobile capabilities and gates desktop-only permissions", () => {
  const native = read("src-tauri/src/lib.rs");
  const mainCapability = JSON.parse(
    read("src-tauri/capabilities/default.json"),
  );
  const desktopCapability = JSON.parse(
    read("src-tauri/capabilities/desktop.json"),
  );

  assert.match(native, /type": "capabilities"/);
  assert.match(native, /titlebar_controls/);
  assert.match(native, /window_settings/);
  assert.deepEqual(mainCapability.permissions.includes("core:tray:default"), false);
  assert.deepEqual(desktopCapability.permissions.includes("core:tray:default"), true);
});

test("foreground lifecycle pauses collection and resumes one bounded probe", () => {
  const native = read("src-tauri/src/lib.rs");
  const auth = read("src-tauri/src/auth.rs");
  const lifecycle = read("src-tauri/src/lifecycle.rs");
  const app = read("src/App.tsx");

  assert.match(native, /"lifecycle"/);
  assert.match(native, /__cavotiAuthAbort/);
  assert.match(native, /foreground_refresh_started/);
  assert.match(native, /abort_current_android_collection\(app, state\)/);
  assert.match(native, /AUTH_COLLECTION_TIMEOUT/);
  assert.match(native, /is_foreground/);
  assert.match(auth, /try_begin_collection/);
  assert.match(lifecycle, /pause/);
  assert.match(lifecycle, /resume/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /action: "lifecycle"/);
});

test("Tauri builds the shared renderer without changing the renderer output", () => {
  const packageJson = read("package.json");
  const vite = read("vite.config.ts");
  const config = read("src-tauri/tauri.conf.json");
  assert.match(packageJson, /"build:tauri"/);
  assert.match(vite, /mode === "tauri"/);
  assert.match(vite, /outDir: tauri \? "dist"/);
  assert.match(config, /"frontendDist": "\.\.\/dist"/);
});

test("Tauri development and release scripts stop stale binaries before launching", () => {
  const dev = read("scripts/tauri-dev.ps1");
  const build = read("scripts/build-tauri-release.ps1");
  const run = read("scripts/run-tauri-release.ps1");
  const packageJson = JSON.parse(read("package.json"));

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
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const packageJson = JSON.parse(read("package.json"));
  const installer = read("installer/InstallerLogic.cs");
  const project = read("installer/CavotiBarSetup.csproj");
  const updates = read("src-tauri/src/updates.rs");
  const native = read("src-tauri/src/lib.rs");
  const build = read("scripts/build-tauri-installer.ps1");
  const workflow = read(".github/workflows/windows-release.yml");
  const gitignore = read(".gitignore");

  assert.equal(config.bundle.active, false);
  assert.deepEqual(config.bundle.targets, []);
  assert.doesNotMatch(JSON.stringify(config.bundle), /nsis|msi/i);
  assert.match(project, /AssemblyName>Cavoti Bar Setup<\/AssemblyName>/);
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
  assert.match(build, /Cavoti Bar Setup\.exe/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /latest\.json/);
  assert.match(workflow, /gh release upload/);
  assert.doesNotMatch(workflow, /gh release create/);
  assert.match(packageJson.scripts["build:installer"], /build-tauri-installer\.ps1/);
  assert.match(gitignore, /^\.env$/m);
});

test("Cavoti packages a signed Android APK without repository keystores", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const script = read("scripts/build-tauri-android-release.ps1");
  const envExample = read(".env.example");
  const gitignore = read(".gitignore");
  const notifications = read("src-tauri/src/notifications.rs");
  const app = read("src/App.tsx");
  const indexHtml = read("index.html");
  const indexCss = read("src/index.css");
  const appShell = read("src/components/app/AppShell.tsx");
  const native = read("src-tauri/src/lib.rs");
  const androidGradle = read("src-tauri/gen/android/app/build.gradle.kts");
  const androidManifest = read("src-tauri/gen/android/app/src/main/AndroidManifest.xml");
  const activity = read(
    "src-tauri/gen/android/app/src/main/java/com/cavoti/bar/MainActivity.kt",
  );

  assert.equal(config.identifier, "com.cavoti.bar");
  assert.equal(
    Object.prototype.hasOwnProperty.call(config.bundle.android, "versionCode"),
    false,
  );
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
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /release_tag/);
  assert.match(workflow, /refs\/tags\/\$\{\{\s*inputs\.release_tag/);
  assert.match(workflow, /tauri\.conf\.json/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY:/);
  assert.match(workflow, /Build custom Cavoti installer[\s\S]*TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /gh release upload/);
  assert.doesNotMatch(workflow, /gh release create/);
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

test("Windows release artifacts use branded filenames without changing internal identity", () => {
  const processScript = read("scripts/tauri-process.ps1");
  const releaseScript = read("scripts/build-tauri-release.ps1");
  const installerScript = read("scripts/build-tauri-installer.ps1");
  const installer = read("installer/InstallerLogic.cs");
  const deepLinks = read("installer/DeepLinkRegistration.cs");
  const project = read("installer/CavotiBarSetup.csproj");

  assert.match(processScript, /Cavoti Bar\.exe/);
  assert.match(processScript, /cavoti_bar/);
  assert.match(releaseScript, /Get-RawReleaseExecutable/);
  assert.match(releaseScript, /Get-ReleaseExecutable/);
  assert.match(releaseScript, /Copy-Item/);
  assert.match(installerScript, /brandedExecutableName/);
  assert.match(installerScript, /Cavoti Bar Setup\.exe/);
  assert.match(installer, /DisplayName = "Cavoti Bar"/);
  assert.match(installer, /ExecutableName = "Cavoti Bar\.exe"/);
  assert.match(installer, /LegacyProcessName = "cavoti_bar"/);
  assert.match(installer, /ProcessStartArguments/);
  assert.match(installer, /CreateShortcut[\s\S]*ProcessStartArguments/);
  assert.match(deepLinks, /InstallerLogic\.ExecutableName/);
  assert.match(project, /AssemblyName>Cavoti Bar Setup<\/AssemblyName>/);
});

test("GitHub Actions validate changes and publish signed desktop and Android releases", () => {
  const validation = read(".github/workflows/ci.yml");
  const windowsRelease = read(".github/workflows/windows-release.yml");
  const androidRelease = read(".github/workflows/android-release.yml");
  const androidScript = read("scripts/build-tauri-android-release.ps1");

  assert.match(validation, /bun install --frozen-lockfile/);
  assert.match(validation, /bun run typecheck/);
  assert.match(validation, /bun run test/);
  assert.match(validation, /cargo test/);
  assert.match(windowsRelease, /name: Cavoti Windows Release/);
  assert.match(windowsRelease, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(windowsRelease, /Cavoti Bar Setup\.exe/);
  assert.match(androidRelease, /name: Cavoti Android Release/);
  assert.match(androidRelease, /workflow_dispatch/);
  assert.match(androidRelease, /CAVOTI_ANDROID_KEYSTORE_BASE64/);
  assert.match(androidRelease, /CAVOTI_ANDROID_KEY_ALIAS/);
  assert.match(androidRelease, /Cavoti Bar\.apk/);
  assert.match(androidRelease, /gh release upload/);
  assert.match(androidRelease, /gh release edit[\s\S]*--draft=false[\s\S]*--latest/);
  assert.match(androidScript, /Cavoti Bar\.apk/);
});

test("repository documentation and secret provisioning are conventional", () => {
  const readme = read("README.md");
  const agents = read("AGENTS.md");
  const provision = read("scripts/configure-github-secrets.ps1");

  assert.match(readme, /^# Cavoti Bar/m);
  assert.match(readme, /^## Architecture/m);
  assert.match(readme, /^## Development/m);
  assert.match(readme, /^## Release builds/m);
  assert.doesNotMatch(readme, /\.env/i);
  assert.match(agents, /src-tauri\//);
  assert.match(agents, /src\//);
  assert.match(agents, /public\//);
  assert.doesNotMatch(agents, /apps\/tauri|web\//);
  assert.match(agents, /installer\//);
  assert.match(agents, /cavoti_bar/);
  assert.match(provision, /secret set/);
  assert.match(provision, /secret set[\s\S]*--env \$Environment/);
  assert.match(provision, /CAVOTI_ANDROID_KEYSTORE_BASE64/);
  assert.match(provision, /CAVOTI_UPDATE_ENDPOINT/);
  assert.match(provision, /IsNullOrWhiteSpace\(\$keyPassword\)/);
  assert.doesNotMatch(provision, /Require-CavotiValue "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"/);
  assert.doesNotMatch(provision, /Write-(Host|Output).*PASSWORD/i);
});

test("Release Please owns semantic versioning and typed version propagation", () => {
  const config = JSON.parse(read("release-please-config.json"));
  const manifest = JSON.parse(read(".release-please-manifest.json"));
  const packageJson = JSON.parse(read("package.json"));
  const rootPackage = config.packages["."];

  assert.equal(
    config.$schema,
    "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  );
  assert.equal(
    config["bootstrap-sha"],
    "de81eb90bab976ab500232a275b2b4ef845bcf91",
  );
  assert.equal(rootPackage["release-type"], "node");
  assert.equal(rootPackage.draft, true);
  assert.equal(rootPackage["force-tag-creation"], true);
  assert.equal(rootPackage["include-component-in-tag"], false);
  assert.equal(rootPackage["include-v-in-tag"], true);
  assert.deepEqual(rootPackage["extra-files"], [
    {
      type: "json",
      path: "src-tauri/tauri.conf.json",
      jsonpath: "$.version",
    },
    {
      type: "toml",
      path: "src-tauri/Cargo.toml",
      jsonpath: "$.package.version",
    },
    {
      type: "xml",
      path: "installer/CavotiBarSetup.csproj",
      xpath: "/Project/PropertyGroup/Version",
    },
  ]);
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest, { ".": packageJson.version });
});

test("Release Please creates draft releases and dispatches validated Windows packaging without a PAT", () => {
  const workflow = read(".github/workflows/release-please.yml");

  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /googleapis\/release-please-action@8b8fd2cc23b2e18957157a9d923d75aa0c6f6ad5/,
  );
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /issues:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /release_created/);
  assert.match(workflow, /tag_name/);
  assert.equal(workflow.includes("^v[0-9]+\\.[0-9]+\\.[0-9]+$"), true);
  assert.match(workflow, /isDraft/);
  assert.match(workflow, /gh run list[\s\S]*ci\.yml/);
  assert.match(workflow, /conclusion[\s\S]*success/);
  assert.match(workflow, /for attempt in/);
  assert.match(workflow, /gh workflow run windows-release\.yml/);
  assert.match(workflow, /--ref main/);
  assert.match(workflow, /release_tag/);
  assert.match(workflow, /github\.token/);
  assert.doesNotMatch(workflow, /secrets\.|PAT/);
});

test("Windows packaging validates the exact draft tag before exposing signing secrets", () => {
  const workflow = read(".github/workflows/windows-release.yml");
  const validationIndex = workflow.indexOf(
    "Validate release tag, remote tag, versions, and draft release",
  );
  const signingSecretIndex = workflow.indexOf("TAURI_SIGNING_PRIVATE_KEY:");

  assert.match(
    workflow,
    /workflow_dispatch:[\s\S]*release_tag:[\s\S]*required:\s*true[\s\S]*type:\s*string/,
  );
  assert.match(workflow, /concurrency:[\s\S]*inputs\.release_tag/);
  assert.match(workflow, /group:\s*cavoti-release-/);
  assert.match(workflow, /environment:\s*release/);
  assert.match(
    workflow,
    /ref:\s*refs\/tags\/\$\{\{\s*inputs\.release_tag\s*\}\}[\s\S]*persist-credentials:\s*false/,
  );
  assert.match(workflow, /git ls-remote[\s\S]*refs\/tags\/\$env:RELEASE_TAG/);
  assert.match(workflow, /rev-parse[\s\S]*HEAD/);
  assert.match(workflow, /merge-base --is-ancestor[\s\S]*origin\/main/);
  assert.match(workflow, /gh run list[\s\S]*ci\.yml[\s\S]*success/);
  assert.match(workflow, /minor[^\n]*-ge 1000/);
  assert.match(workflow, /patch[^\n]*-ge 1000/);
  assert.match(workflow, /versionCode[^\n]*\+ 1/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /tauri\.conf\.json/);
  assert.match(workflow, /Cargo\.toml/);
  assert.match(workflow, /CavotiBarSetup\.csproj/);
  assert.match(workflow, /isDraft/);
  assert.match(workflow, /gh release upload[\s\S]*--clobber/);
  assert.match(workflow, /Cavoti Bar Setup\.exe/);
  assert.match(workflow, /Cavoti Bar Setup\.exe\.sig/);
  assert.match(workflow, /latest\.json/);
  assert.match(workflow, /gh workflow run android-release\.yml/);
  assert.match(
    workflow,
    /gh workflow run android-release\.yml[\s\S]*LASTEXITCODE[\s\S]*throw/,
  );
  assert.equal(validationIndex >= 0, true);
  assert.equal(signingSecretIndex > validationIndex, true);
  assert.doesNotMatch(workflow, /gh release create/);
});

test("Android packaging validates the exact draft tag, uploads idempotently, and publishes atomically", () => {
  const workflow = read(".github/workflows/android-release.yml");
  const validationIndex = workflow.indexOf(
    "Validate release tag, remote tag, versions, and draft release",
  );
  const signingSecretIndex = workflow.indexOf(
    "CAVOTI_ANDROID_KEYSTORE_BASE64:",
  );

  assert.match(
    workflow,
    /workflow_dispatch:[\s\S]*release_tag:[\s\S]*required:\s*true[\s\S]*type:\s*string/,
  );
  assert.match(workflow, /concurrency:[\s\S]*inputs\.release_tag/);
  assert.match(workflow, /group:\s*cavoti-release-/);
  assert.match(workflow, /environment:\s*release/);
  assert.match(workflow, /permissions:[\s\S]*actions:\s*read/);
  assert.match(
    workflow,
    /ref:\s*refs\/tags\/\$\{\{\s*inputs\.release_tag\s*\}\}[\s\S]*persist-credentials:\s*false/,
  );
  assert.match(workflow, /git ls-remote[\s\S]*refs\/tags\/\$env:RELEASE_TAG/);
  assert.match(workflow, /rev-parse[\s\S]*HEAD/);
  assert.match(workflow, /merge-base --is-ancestor[\s\S]*origin\/main/);
  assert.match(workflow, /gh run list[\s\S]*ci\.yml[\s\S]*success/);
  assert.match(workflow, /minor[^\n]*-ge 1000/);
  assert.match(workflow, /patch[^\n]*-ge 1000/);
  assert.match(workflow, /versionCode[^\n]*\+ 1/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /tauri\.conf\.json/);
  assert.match(workflow, /Cargo\.toml/);
  assert.match(workflow, /CavotiBarSetup\.csproj/);
  assert.match(workflow, /isDraft/);
  assert.match(
    workflow,
    /name: cavoti-bar-android-\$\{\{ inputs\.release_tag \}\}/,
  );
  assert.match(workflow, /gh release upload[\s\S]*--clobber/);
  for (const asset of [
    "Cavoti Bar Setup.exe",
    "Cavoti Bar Setup.exe.sig",
    "latest.json",
    "Cavoti Bar.apk",
  ]) {
    assert.match(workflow, new RegExp(asset.replace(/[.]/g, "\\.")));
  }
  assert.match(workflow, /gh release edit[\s\S]*--draft=false[\s\S]*--latest/);
  assert.match(
    workflow,
    /gh release edit[\s\S]*LASTEXITCODE[\s\S]*throw/,
  );
  assert.equal(validationIndex >= 0, true);
  assert.equal(signingSecretIndex > validationIndex, true);
});

test("Android packaging derives and validates the APK version code and name", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const script = read("scripts/build-tauri-android-release.ps1");

  assert.equal(
    Object.prototype.hasOwnProperty.call(config.bundle.android, "versionCode"),
    false,
  );
  assert.match(script, /semantic.*version|semver/i);
  assert.match(script, /major\s*\*\s*1000000/);
  assert.match(script, /minor\s*\*\s*1000/);
  assert.match(script, /patch/);
  assert.match(script, /derivedVersionCode[\s\S]*\+ 1/);
  assert.match(script, /--config/);
  assert.match(script, /minor[^\n]*-ge 1000/);
  assert.match(script, /patch[^\n]*-ge 1000/);
  assert.match(script, /2100000000/);
  assert.match(script, /PSObject\.Properties\.Name[\s\S]*versionCode/);
  assert.match(script, /versionCode/);
  assert.match(script, /versionName/);
  assert.match(script, /expectedVersionCode/);
  assert.match(script, /expectedVersionName/);
});

test("release workflows fail closed around native tools and stale optional secrets", () => {
  const androidWorkflow = read(".github/workflows/android-release.yml");
  const provision = read("scripts/configure-github-secrets.ps1");

  assert.match(
    androidWorkflow,
    /sdkmanager[\s\S]*LASTEXITCODE[\s\S]*throw/,
  );
  assert.match(provision, /secret delete TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
});

test("Release documentation describes the draft chain, recovery, validation, and optional password", () => {
  const readme = read("README.md");
  const agents = read("AGENTS.md");

  for (const document of [readme, agents]) {
    assert.match(document, /Release Please/);
    assert.match(document, /draft/i);
    assert.match(document, /rerun|re-run|recovery/i);
    assert.match(document, /semantic/i);
    assert.match(document, /atomic/i);
  }
  assert.match(
    readme,
    /TAURI_SIGNING_PRIVATE_KEY_PASSWORD[\s\S]{0,120}optional/i,
  );
  assert.match(
    agents,
    /TAURI_SIGNING_PRIVATE_KEY_PASSWORD[\s\S]{0,120}optional/i,
  );
});
