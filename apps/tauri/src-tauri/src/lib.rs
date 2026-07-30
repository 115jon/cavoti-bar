use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    webview::PageLoadEvent, AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

mod auth;
mod host;
mod lifecycle;
mod navigation;
mod notifications;
mod quota;
mod snapshot;
mod updates;
use auth::{
    is_allowed_auth_navigation, is_cavoti_origin, AuthAcceptError, AuthAdapter, AuthAdapterEvent,
    AuthCollectionPayload, AuthRawResults, AUTH_COLLECTION_TIMEOUT, AUTH_WINDOW_LABEL,
    MAX_AUTH_PAYLOAD_BYTES,
};
use host::{resolve_external_command, ExternalCommand};
use lifecycle::{parse_command, LifecycleCommand, LifecycleState};
use navigation::{parse_route, HostRoute};
use notifications::NativeNotifications;
use snapshot::normalize_core_snapshot;

#[cfg(target_os = "android")]
use jni::{
    objects::{GlobalRef, JClass, JObject, JString, JValue},
    JNIEnv, JavaVM,
};

#[derive(Clone, Default)]
struct AuthState {
    adapter: Arc<Mutex<AuthAdapter>>,
    startup_probe_started: Arc<AtomicBool>,
    settings: Arc<Mutex<HostSettings>>,
    refresh_scheduler_started: Arc<AtomicBool>,
    automatic_refresh_suspended: Arc<AtomicBool>,
    foreground_refresh_started: Arc<AtomicBool>,
    lifecycle: Arc<LifecycleState>,
    notifications: Arc<NativeNotifications>,
    navigation: Arc<Mutex<NavigationState>>,
    latest_snapshot: Arc<Mutex<Option<Value>>>,
    latest_raw_results: Arc<Mutex<Option<auth::AuthRawResults>>>,
    latest_probe_request: Arc<Mutex<auth::AuthProbeRequest>>,
    settings_update_guard: Arc<Mutex<()>>,
    #[cfg(target_os = "android")]
    android_auth_bridge_unavailable: Arc<AtomicBool>,
    #[cfg(target_os = "android")]
    android_probe_start_guard: Arc<Mutex<()>>,
    auth_window_visible: Arc<AtomicBool>,
}

#[cfg(target_os = "android")]
static ANDROID_APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
#[cfg(target_os = "android")]
static ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "android")]
static ANDROID_JVM: OnceLock<JavaVM> = OnceLock::new();
#[cfg(target_os = "android")]
static ANDROID_ACTIVITY_CLASS_LOADER: OnceLock<GlobalRef> = OnceLock::new();

#[derive(Default)]
struct NavigationState {
    ready: bool,
    pending: Option<HostRoute>,
}

impl NavigationState {
    fn set_ready_and_take(&mut self) -> Option<HostRoute> {
        self.ready = true;
        self.pending.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_origin_requires_https_cavoti_default_port() {
        assert!(is_cavoti_origin("https://cavoti.com/login"));
        assert!(!is_cavoti_origin("http://cavoti.com/login"));
        assert!(!is_cavoti_origin("https://evil.example/login"));
        assert!(!is_cavoti_origin("https://cavoti.com:444/login"));
        assert!(is_allowed_auth_navigation(
            "https://accounts.google.com/oauth"
        ));
        assert!(is_allowed_auth_navigation(
            "https://accounts.youtube.com/accounts/SetSID"
        ));
        assert!(!is_allowed_auth_navigation("https://evil.example/login"));
    }

    #[test]
    fn refresh_interval_preserves_manual_only_and_clamps_active_ranges() {
        assert_eq!(normalize_refresh_interval(0), 0);
        assert_eq!(normalize_refresh_interval(1), 15);
        assert_eq!(normalize_refresh_interval(60), 60);
        assert_eq!(normalize_refresh_interval(901), 900);
    }

    #[test]
    fn collection_rejects_stale_ids_and_requires_terminal_enrichment() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        let stale = AuthCollectionPayload::test_core("stale", 200);
        assert!(matches!(adapter.accept(stale), Err(AuthAcceptError::Stale)));

        let core = AuthCollectionPayload::test_core(&collection_id, 200);
        assert!(matches!(
            adapter.accept(core),
            Ok(AuthAdapterEvent::RawResults(_))
        ));
        let terminal = AuthCollectionPayload::test_enrichment(&collection_id);
        assert!(matches!(
            adapter.accept(terminal),
            Ok(AuthAdapterEvent::RawResults(_))
        ));
        assert!(adapter.active_collection_id().is_none());
    }

    #[test]
    fn collection_rejects_non_terminal_core_failure_without_required_results() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        let mut payload = AuthCollectionPayload::test_core(&collection_id, 200);
        payload.complete = true;
        payload.results.clear();
        assert!(matches!(
            adapter.accept(payload),
            Err(AuthAcceptError::Invalid(_))
        ));
    }

    #[test]
    fn collection_rejects_oversized_result_and_abort_clears_active_id() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        let mut payload = AuthCollectionPayload::test_core(&collection_id, 200);
        payload.results.get_mut("me").expect("test result").text =
            "x".repeat(auth::MAX_AUTH_RESULT_BYTES + 1);
        assert!(matches!(
            adapter.accept(payload),
            Err(AuthAcceptError::Invalid("result too large"))
        ));
        assert!(adapter.abort(&collection_id));
        assert!(adapter.active_collection_id().is_none());
    }

    #[test]
    fn lifecycle_transitions_are_idempotent() {
        let lifecycle = LifecycleState::default();
        assert!(lifecycle.is_foreground());
        assert!(lifecycle.pause());
        assert!(!lifecycle.pause());
        assert!(!lifecycle.is_foreground());
        assert!(lifecycle.resume());
        assert!(!lifecycle.resume());
        assert!(lifecycle.is_foreground());
    }

    #[test]
    fn core_results_normalize_to_the_shared_snapshot_envelope() {
        let raw = AuthRawResults {
            collection_id: "test".into(),
            phase: "core".into(),
            session_state: "authenticated".into(),
            scope: auth::AuthProbeScope::Full,
            results: [
                (
                    "me".into(),
                    auth::AuthEndpointResult {
                        status: 200,
                        ok: true,
                        text: r#"{"data":{"username":"daddy","status":"active"}}"#.into(),
                        timed_out: false,
                    },
                ),
                (
                    "subscriptions".into(),
                    auth::AuthEndpointResult {
                        status: 200,
                        ok: true,
                        text: r#"{"data":[{"plan_name":"usage_quota","billing_kind":"usage_quota","status":"active","daily_usage_usd":12,"daily_limit_usd":100,"weekly_limit_usd":100,"monthly_usage_usd":25,"monthly_window_start":"2026-07-26T00:00:00Z","expires_at":"2026-07-30T00:00:00Z","daily_window_start":"2026-07-26T00:00:00Z"}]}"#.into(),
                        timed_out: false,
                    },
                ),
                (
                    "stats".into(),
                    auth::AuthEndpointResult {
                        status: 200,
                        ok: true,
                        text: r#"{"data":{"total_requests":3,"total_tokens":90,"endpoints":[{"endpoint":"chat","requests":3,"total_tokens":90}]}}"#.into(),
                        timed_out: false,
                    },
                ),
                (
                    "models".into(),
                    auth::AuthEndpointResult {
                        status: 200,
                        ok: true,
                        text: r#"{"data":{"models":[{"model":"gpt","requests":3,"total_tokens":90}]}}"#.into(),
                        timed_out: false,
                    },
                ),
                (
                    "snapshot".into(),
                    auth::AuthEndpointResult {
                        status: 200,
                        ok: true,
                        text: r#"{"data":{"trend":[{"date":"2026-07-25","requests":3,"total_tokens":90}],"groups":[{"group_name":"Default","requests":3,"total_tokens":90}]}}"#.into(),
                        timed_out: false,
                    },
                ),
            ]
            .into_iter()
            .collect(),
        };

        let snapshot = snapshot::normalize_core_snapshot(&raw).expect("valid core snapshot");
        assert_eq!(snapshot["version"], 1);
        assert_eq!(snapshot["account"]["displayName"], "daddy");
        assert_eq!(snapshot["stats"]["requests"].as_f64(), Some(3.0));
        assert_eq!(snapshot["models"][0]["name"], "gpt");
        assert_eq!(snapshot["dailyTrend"][0]["date"], "2026-07-25");
        assert_eq!(snapshot["subscriptions"][0]["name"], "Usage plan");
        assert!(snapshot["capturedAt"].as_str().is_some());
        assert_eq!(
            snapshot["subscriptions"][0]["usage"]["fiveHour"]["resetAt"],
            "2026-07-26T05:00:00Z"
        );
        assert_eq!(
            snapshot["subscriptions"][0]["usage"]["monthly"]["limit"],
            500.0
        );
        assert_eq!(
            snapshot["subscriptions"][0]["usage"]["monthly"]["resetAt"],
            "2026-07-30T00:00:00Z"
        );
    }

    #[test]
    fn optional_results_normalize_to_wpf_usage_and_status_fields() {
        let mut results = AuthCollectionPayload::test_core("test", 200).results;
        results.get_mut("me").expect("me").text =
            r#"{"data":{"username":"daddy","status":"active"}}"#.into();
        results
            .get_mut("subscriptions")
            .expect("subscriptions")
            .text = r#"{"data":[]}"#.into();
        results.get_mut("stats").expect("stats").text = r#"{"data":{}}"#.into();
        results.get_mut("models").expect("models").text = r#"{"data":{}}"#.into();
        results.get_mut("snapshot").expect("snapshot").text = r#"{"data":{}}"#.into();
        let optional = [
            (
                "usage",
                r#"{"data":{"items":[{"id":7,"request_id":"req-7","api_key":{"name":"prod"},"model":"gpt","reasoning_effort":"high","inbound_endpoint":"chat","group":{"name":"Default"},"input_tokens":2,"output_tokens":3,"cache_creation_5m_tokens":1,"cache_creation_1h_tokens":3,"cache_read_tokens":5,"actual_cost":0.4,"total_cost":0.6,"first_token_ms":12,"duration_ms":80,"ip_address":"8.8.8.8","user_agent":"client","created_at":"2026-07-26T00:00:00Z"}],"page":2,"page_size":100,"total":101,"pages":2}}"#,
            ),
            (
                "errors",
                r#"{"data":{"items":[{"id":8,"created_at":"2026-07-26T00:00:00Z","model":"gpt","inbound_endpoint":"chat","status_code":429,"category":"rate","platform":"api","message":"slow down","key_name":"prod","key_deleted":true}],"page":1,"page_size":100,"total":1,"pages":1}}"#,
            ),
            (
                "keys",
                r#"{"data":{"items":[{"id":1,"name":"prod","status":"active","quota":0,"quota_used":12.5,"window_5h_start":"2026-07-26T00:00:00Z","rate_limit_5h":0,"usage_5h":12.5,"group":{"name":"Default","rate_multiplier":1.2,"rpm_limit":30}},{"id":2,"name":"old","status":"inactive"}]}}"#,
            ),
            (
                "quota",
                r#"{"data":{"cards":[{"label":"Daily quota","reset_at":"2026-07-27T00:00:00Z"}]}}"#,
            ),
            (
                "banner",
                r#"{"data":{"enabled":true,"title":"Notice","message":"Read this"}}"#,
            ),
            (
                "announcements",
                r#"{"data":[{"title":"Update","message":"New API"}]}"#,
            ),
            (
                "status",
                r#"{"data":{"items":[{"name":"Cavoti","provider":"openai","primary_model":"gpt","primary_status":"operational","primary_latency_ms":42,"availability_7d":99.5,"timeline":[{"checked_at":"2026-07-26T00:00:00Z"}]}]}}"#,
            ),
            ("groups", r#"{"data":[{"id":3,"name":"Default"}]}"#),
            (
                "pricing",
                r#"{"data":{"platforms":[{"platform":"openai","groups":[{"id":3,"name":"Default"}],"models":[{"name":"gpt","platform":"openai","source":"override","group_prices":[{"group_id":3,"pricing":{"billing_mode":"token","input_price":0.00000008,"output_price":0.0000004,"cache_write_price":null,"cache_read_price":0.000000008,"point_price":4,"intervals":[]}}]}]}]}}"#,
            ),
            (
                "geo",
                r#"{"8.8.8.8":{"city":"Mountain View","region":"CA","country":"United States","country_code":"US","organization_name":"Google","timezone":"America/Los_Angeles"}}"#,
            ),
        ];
        for (name, text) in optional {
            results.insert(
                name.into(),
                auth::AuthEndpointResult {
                    status: 200,
                    ok: true,
                    text: text.into(),
                    timed_out: false,
                },
            );
        }

        let snapshot = snapshot::normalize_core_snapshot(&AuthRawResults {
            collection_id: "test".into(),
            phase: "enrichment".into(),
            session_state: "authenticated".into(),
            scope: auth::AuthProbeScope::Full,
            results,
        })
        .expect("valid enriched snapshot");

        assert_eq!(snapshot["usageLogs"][0]["totalTokens"], 14.0);
        assert_eq!(snapshot["usageLogs"][0]["cacheCreationTokens"], 4.0);
        assert_eq!(snapshot["usageLogs"][0]["location"]["countryCode"], "US");
        assert_eq!(snapshot["usagePageInfo"]["page"], 2.0);
        assert_eq!(snapshot["errors"][0]["statusCode"], 429.0);
        assert_eq!(snapshot["keys"]["total"], 2);
        assert_eq!(snapshot["keys"]["active"], 1);
        assert_eq!(snapshot["quotaResetCards"][0]["label"], "Daily quota");
        assert_eq!(snapshot["banner"]["title"], "Notice");
        assert_eq!(snapshot["announcements"][0]["title"], "Update");
        assert_eq!(snapshot["channelMonitors"][0]["latencyMs"], 42.0);
        assert_eq!(snapshot["apiKeys"][0]["name"], "prod");
        assert_eq!(snapshot["apiKeys"][0]["quota"], 0.0);
        assert_eq!(snapshot["apiKeys"][0]["reset5hAt"], "2026-07-26T05:00:00Z");
        assert_eq!(snapshot["apiKeys"][0]["rpmLimit"], 30.0);
        assert_eq!(snapshot["modelPricing"][0]["inputPrice"], 0.00000008);
        assert_eq!(snapshot["modelPricing"][0]["groupName"], "Default");
        assert_eq!(snapshot["groupOptions"][0]["id"], 3.0);
    }

    #[test]
    fn authenticated_enrichment_without_timeouts_is_live() {
        let raw = AuthRawResults {
            collection_id: "collection".into(),
            phase: "enrichment".into(),
            session_state: "authenticated".into(),
            results: [(
                "quota".into(),
                auth::AuthEndpointResult {
                    status: 200,
                    ok: true,
                    text: "{}".into(),
                    timed_out: false,
                },
            )]
            .into_iter()
            .collect(),
        };

        assert_eq!(raw_results_state(&raw).0, "live");
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HostCommand {
    action: String,
    value: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
struct HostSettings {
    topmost: bool,
    maximized: bool,
    refresh_interval_seconds: u32,
    show_freshness_seconds: bool,
    update_ready: bool,
    close_to_tray: bool,
    launch_at_startup: bool,
    startup_error: Option<String>,
    quota_thresholds: Vec<u8>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HostCapabilities {
    platform: &'static str,
    titlebar_controls: bool,
    tray: bool,
    startup: bool,
    topmost: bool,
    window_settings: bool,
}

fn host_capabilities() -> HostCapabilities {
    #[cfg(mobile)]
    {
        return HostCapabilities {
            platform: "mobile",
            titlebar_controls: false,
            tray: false,
            startup: false,
            topmost: false,
            window_settings: false,
        };
    }

    #[cfg(not(mobile))]
    HostCapabilities {
        platform: "desktop",
        titlebar_controls: true,
        tray: true,
        startup: true,
        topmost: true,
        window_settings: true,
    }
}

impl Default for HostSettings {
    fn default() -> Self {
        Self {
            topmost: false,
            maximized: false,
            refresh_interval_seconds: 60,
            show_freshness_seconds: false,
            update_ready: false,
            close_to_tray: true,
            launch_at_startup: false,
            startup_error: None,
            quota_thresholds: Vec::new(),
        }
    }
}

const SETTINGS_STORE: &str = "settings.json";
const SETTINGS_KEY: &str = "host";
const SETTINGS_LOG: &str = "settings.log";

fn log_settings<R: Runtime>(app: &AppHandle<R>, message: impl AsRef<str>) {
    let Ok(directory) = app.path().app_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&directory).is_err() {
        return;
    }
    let path = directory.join(SETTINGS_LOG);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let _ = writeln!(file, "{} {}", timestamp, message.as_ref());
}

fn load_settings(app: &AppHandle) -> HostSettings {
    let resolved_path = tauri_plugin_store::resolve_store_path(app, SETTINGS_STORE)
        .map(|path| path.display().to_string())
        .unwrap_or_else(|error| format!("<unresolved: {error}>"));
    eprintln!("[cavoti-settings] store path={resolved_path}");
    let mut settings: HostSettings = match app.store(SETTINGS_STORE) {
        Ok(store) => store
            .get(SETTINGS_KEY)
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default(),
        Err(error) => {
            eprintln!("[cavoti-settings] store load failed: {error}");
            HostSettings::default()
        }
    };
    settings.refresh_interval_seconds =
        normalize_refresh_interval(settings.refresh_interval_seconds);
    log_settings(
        app,
        format!(
            "load showFreshnessSeconds={} closeToTray={} interval={}",
            settings.show_freshness_seconds,
            settings.close_to_tray,
            settings.refresh_interval_seconds
        ),
    );
    settings
}

fn normalize_refresh_interval(seconds: u32) -> u32 {
    if seconds == 0 {
        0
    } else {
        seconds.clamp(15, 900)
    }
}

fn save_settings(app: &AppHandle, settings: &HostSettings) -> Result<(), String> {
    log_settings(
        app,
        format!(
            "save begin showFreshnessSeconds={} closeToTray={} interval={}",
            settings.show_freshness_seconds,
            settings.close_to_tray,
            settings.refresh_interval_seconds
        ),
    );
    let store = app.store(SETTINGS_STORE).map_err(|error| {
        log_settings(app, format!("save store-open-error={error}"));
        format!("Settings store could not open: {error}")
    })?;
    store.set(
        SETTINGS_KEY.to_owned(),
        serde_json::to_value(settings).map_err(|error| error.to_string())?,
    );
    store.save().map_err(|error| {
        log_settings(app, format!("save error={error}"));
        format!("Settings could not be saved: {error}")
    })?;
    log_settings(app, "save success");
    Ok(())
}

fn current_settings(state: &AuthState) -> HostSettings {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

fn emit_settings<R: Runtime>(app: &AppHandle<R>, state: &AuthState) -> Result<(), String> {
    let settings = current_settings(state);
    log_settings(
        app,
        format!(
            "emit showFreshnessSeconds={} closeToTray={} interval={}",
            settings.show_freshness_seconds,
            settings.close_to_tray,
            settings.refresh_interval_seconds
        ),
    );
    emit_event(
        app,
        json!({
            "protocol": 1,
            "type": "settings",
            "settings": settings,
        }),
    )
}

fn emit_capabilities<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    emit_event(
        app,
        json!({
            "protocol": 1,
            "type": "capabilities",
            "capabilities": host_capabilities(),
        }),
    )
}

fn emit_lifecycle<R: Runtime>(app: &AppHandle<R>, state: &str) -> Result<(), String> {
    emit_event(
        app,
        json!({
            "protocol": 1,
            "type": "lifecycle",
            "state": state,
        }),
    )
}

fn emit_event<R: Runtime>(app: &AppHandle<R>, event: Value) -> Result<(), String> {
    app.emit_to("main", "host-event", event)
        .map_err(|error| error.to_string())
}

fn cache_snapshot(state: &AuthState, snapshot: &Value) {
    if let Ok(mut latest) = state.latest_snapshot.lock() {
        *latest = Some(snapshot.clone());
    }
}

fn merge_raw_results(state: &AuthState, raw: &auth::AuthRawResults) -> auth::AuthRawResults {
    let previous = state
        .latest_raw_results
        .lock()
        .ok()
        .and_then(|latest| latest.clone());
    let mut merged = match (&raw.scope, raw.phase.as_str(), previous) {
        (auth::AuthProbeScope::Full, "core", _) => raw.clone(),
        (_, _, Some(previous)) => previous,
        (_, _, None) => raw.clone(),
    };
    merged.collection_id = raw.collection_id.clone();
    merged.phase = raw.phase.clone();
    merged.session_state = raw.session_state.clone();
    merged.scope = raw.scope.clone();
    merged.results.extend(raw.results.clone());
    if let Ok(mut latest) = state.latest_raw_results.lock() {
        *latest = Some(merged.clone());
    }
    merged
}

fn remember_probe_request(state: &AuthState, request: &auth::AuthProbeRequest) {
    if let Ok(mut latest) = state.latest_probe_request.lock() {
        *latest = request.clone();
    }
}

fn current_probe_request(state: &AuthState) -> auth::AuthProbeRequest {
    state
        .latest_probe_request
        .lock()
        .ok()
        .map(|request| request.clone())
        .unwrap_or_default()
}

fn emit_latest_snapshot<R: Runtime>(app: &AppHandle<R>, state: &AuthState) -> Result<(), String> {
    let snapshot = state
        .latest_snapshot
        .lock()
        .ok()
        .and_then(|latest| latest.clone());
    if let Some(snapshot) = snapshot {
        emit_event(
            app,
            json!({
                "protocol": 1,
                "type": "snapshot",
                "complete": true,
                "snapshot": snapshot,
            }),
        )?;
    }
    Ok(())
}

fn has_cached_snapshot(state: &AuthState) -> bool {
    state
        .latest_snapshot
        .lock()
        .ok()
        .is_some_and(|latest| latest.is_some())
}

fn emit_bridge_state<R: Runtime>(
    app: &AppHandle<R>,
    state: &str,
    status: u16,
    message: &str,
) -> Result<(), String> {
    if let Some(host_state) = app.try_state::<AuthState>() {
        host_state.notifications.notify_connection_state(app, state);
    }
    emit_event(
        app,
        json!({
            "protocol": 1,
            "type": "bridge-state",
            "state": state,
            "status": status,
            "message": message,
        }),
    )
}

fn emit_navigation<R: Runtime>(app: &AppHandle<R>, route: HostRoute) -> Result<(), String> {
    emit_event(
        app,
        json!({
            "protocol": 1,
            "type": "host-navigation",
            "target": route.as_str(),
        }),
    )
}

fn route_navigation<I, S>(app: &AppHandle, state: &AuthState, urls: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for raw in urls {
        let Some(route) = parse_route(raw.as_ref()) else {
            continue;
        };
        let ready = if let Ok(mut navigation) = state.navigation.lock() {
            if navigation.ready {
                true
            } else {
                navigation.pending = Some(route);
                false
            }
        } else {
            false
        };
        if ready {
            show_main_window(app);
            let _ = emit_navigation(app, route);
        }
    }
}

fn flush_pending_navigation(app: &AppHandle, state: &AuthState) -> Result<(), String> {
    let route = state
        .navigation
        .lock()
        .map_err(|_| "Cavoti navigation state is unavailable".to_string())?
        .set_ready_and_take();
    if let Some(route) = route {
        show_main_window(app);
        emit_navigation(app, route)?;
    }
    Ok(())
}

fn emit_bootstrap(app: &AppHandle, state: &AuthState) -> Result<(), String> {
    #[cfg(target_os = "android")]
    state.notifications.ensure_permission(app);
    emit_capabilities(app)?;
    emit_settings(app, state)?;
    emit_latest_snapshot(app, state)?;
    #[cfg(target_os = "android")]
    {
        if state
            .android_auth_bridge_unavailable
            .load(Ordering::Acquire)
        {
            emit_bridge_state(
                app,
                "error",
                0,
                "The Android WebView provider does not support the Cavoti session bridge",
            )?;
            return Ok(());
        }
        start_android_session_probe(
            app,
            state,
            auth::AuthProbeRequest::default(),
            false,
            false,
            "Restoring Cavoti session",
        )?;
    }
    #[cfg(not(target_os = "android"))]
    start_auth_session_probe(app, state);
    Ok(())
}

fn apply_setting(app: &AppHandle, state: &AuthState, value: Option<&Value>) -> Result<(), String> {
    let _settings_update_guard = state
        .settings_update_guard
        .lock()
        .map_err(|_| "Cavoti settings state is unavailable".to_string())?;
    let value = value
        .and_then(Value::as_object)
        .ok_or_else(|| "Setting payload is invalid".to_string())?;
    let name = value
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "Setting name is missing".to_string())?;
    let mut next = current_settings(state);

    match name {
        "topmost" => {
            let enabled = value
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Topmost setting is invalid".to_string())?;
            next.topmost = enabled;
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                window
                    .set_always_on_top(enabled)
                    .map_err(|error| format!("Topmost setting could not be applied: {error}"))?;
            }
        }
        "refresh-interval" => {
            let seconds = value
                .get("seconds")
                .and_then(Value::as_u64)
                .ok_or_else(|| "Refresh interval is invalid".to_string())?;
            next.refresh_interval_seconds = normalize_refresh_interval(seconds as u32);
        }
        "freshness-seconds" => {
            next.show_freshness_seconds = value
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Freshness setting is invalid".to_string())?;
        }
        "close-to-tray" => {
            next.close_to_tray = value
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Close behavior setting is invalid".to_string())?;
        }
        "launch-at-startup" => {
            let enabled = value
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Startup setting is invalid".to_string())?;
            if cfg!(debug_assertions) {
                return Err("Startup registration is only available in a packaged build".into());
            }
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let manager = app.autolaunch();
                if enabled {
                    manager
                        .enable()
                        .map_err(|error| format!("Startup registration failed: {error}"))?;
                } else {
                    manager.disable().map_err(|error| {
                        format!("Startup registration could not be removed: {error}")
                    })?;
                }
            }
            next.launch_at_startup = enabled;
            next.startup_error = None;
        }
        "quota-thresholds" => {
            next.quota_thresholds = value
                .get("thresholds")
                .and_then(Value::as_array)
                .ok_or_else(|| "Quota thresholds are invalid".to_string())?
                .iter()
                .filter_map(Value::as_u64)
                .filter(|threshold| (1..=100).contains(threshold))
                .map(|threshold| threshold as u8)
                .collect();
            if !next.quota_thresholds.is_empty() {
                state.notifications.ensure_permission(app);
            }
        }
        _ => return Ok(()),
    }

    save_settings(app, &next)?;
    if let Ok(mut settings) = state.settings.lock() {
        *settings = next;
    }
    emit_settings(app, state)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        #[cfg(desktop)]
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn start_foreground_refresh(app: &AppHandle, state: &AuthState) {
    let auth_collection_active = state
        .adapter
        .lock()
        .map(|adapter| adapter.active_collection_id().is_some())
        .unwrap_or(true);
    if auth_collection_active
        || !state.lifecycle.is_foreground()
        || state
            .foreground_refresh_started
            .swap(true, Ordering::AcqRel)
    {
        return;
    }
    let app = app.clone();
    let state = state.clone();
    tauri::async_runtime::spawn(async move {
        if !state.lifecycle.is_foreground() {
            state
                .foreground_refresh_started
                .store(false, Ordering::Release);
            return;
        }
        let mut request = current_probe_request(&state);
        request.scope = auth::AuthProbeScope::Background;
        #[cfg(target_os = "android")]
        let result = start_android_session_probe(
            &app,
            &state,
            request,
            false,
            false,
            "Refreshing Cavoti usage",
        );
        #[cfg(not(target_os = "android"))]
        let result =
            open_auth_window(&app, &state, request, false, "Refreshing Cavoti usage").await;
        if let Err(error) = result {
            state
                .foreground_refresh_started
                .store(false, Ordering::Release);
            eprintln!("[cavoti-lifecycle] foreground refresh failed: {error}");
        }
    });
}

fn apply_lifecycle_command(
    app: &AppHandle,
    state: &AuthState,
    value: Option<&Value>,
) -> Result<(), String> {
    match parse_command(value)? {
        LifecycleCommand::Pause => {
            state.lifecycle.pause();
            state
                .foreground_refresh_started
                .store(false, Ordering::Release);
            #[cfg(target_os = "android")]
            if !state.auth_window_visible.load(Ordering::Acquire) {
                abort_current_android_collection(app, state);
            }
            emit_lifecycle(app, "paused")
        }
        LifecycleCommand::Foreground => {
            let transitioned = state.lifecycle.resume();
            emit_lifecycle(app, "foreground")?;
            if transitioned {
                start_foreground_refresh(app, state);
            }
            Ok(())
        }
    }
}

fn spawn_auth_timeout(app: AppHandle, state: AuthState, collection_id: String) {
    thread::spawn(move || {
        thread::sleep(AUTH_COLLECTION_TIMEOUT);
        let expired = state
            .adapter
            .lock()
            .map(|mut adapter| adapter.abort(&collection_id))
            .unwrap_or(false);
        if expired {
            #[cfg(target_os = "android")]
            if let Err(error) = dispatch_android_abort_probe(&collection_id) {
                eprintln!("[cavoti-auth] Android timeout abort dispatch failed: {error}");
                let _ = emit_bridge_state(
                    &app,
                    "error",
                    0,
                    "The Android session controller is unavailable",
                );
            }
            let _ = emit_bridge_state(&app, "offline", 0, "Cavoti session probe timed out");
        }
    });
}

fn start_refresh_scheduler(app: &AppHandle, state: &AuthState) {
    if state.refresh_scheduler_started.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    let state = state.clone();
    thread::spawn(move || {
        let mut elapsed_seconds = 0u32;
        loop {
            thread::sleep(Duration::from_secs(1));
            let interval = current_settings(&state).refresh_interval_seconds;
            if !state.lifecycle.is_foreground() {
                elapsed_seconds = 0;
                continue;
            }
            if state.automatic_refresh_suspended.load(Ordering::Acquire) {
                elapsed_seconds = 0;
                continue;
            }
            if interval == 0 {
                elapsed_seconds = 0;
                continue;
            }
            elapsed_seconds = elapsed_seconds.saturating_add(1);
            if elapsed_seconds < interval {
                continue;
            }
            elapsed_seconds = 0;

            let active = state
                .adapter
                .lock()
                .ok()
                .and_then(|adapter| adapter.active_collection_id().map(str::to_owned))
                .is_some();
            #[cfg(target_os = "android")]
            let refreshable = app.get_webview_window("main").is_some();
            #[cfg(not(target_os = "android"))]
            let refreshable = app
                .get_webview_window(AUTH_WINDOW_LABEL)
                .and_then(|window| window.url().ok())
                .is_some_and(|url| is_cavoti_origin(url.as_str()));
            if active || !refreshable {
                continue;
            }

            eprintln!("[cavoti-refresh] automatic refresh interval={}s", interval);
            let app = app.clone();
            let state = state.clone();
            tauri::async_runtime::spawn(async move {
                let mut request = auth::AuthProbeRequest::default();
                request.scope = auth::AuthProbeScope::Background;
                #[cfg(target_os = "android")]
                let _ = start_android_session_probe(
                    &app,
                    &state,
                    request,
                    false,
                    false,
                    "Refreshing Cavoti usage",
                );
                #[cfg(not(target_os = "android"))]
                let _ =
                    open_auth_window(&app, &state, request, false, "Refreshing Cavoti usage").await;
            });
        }
    });
}

#[cfg(desktop)]
fn cavoti_icon() -> Result<tauri::image::Image<'static>, String> {
    let decoder = png::Decoder::new(std::io::Cursor::new(include_bytes!(
        "../../../../web/public/favicon.png"
    )));
    let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
    let mut pixels = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut pixels)
        .map_err(|error| error.to_string())?;
    if info.color_type != png::ColorType::Rgba {
        return Err("Cavoti icon must use RGBA pixels".into());
    }
    Ok(tauri::image::Image::new_owned(
        pixels[..info.buffer_size()].to_vec(),
        info.width,
        info.height,
    ))
}

fn probe_request(value: Option<&Value>) -> auth::AuthProbeRequest {
    let value = value.and_then(Value::as_object);
    let filters = value
        .and_then(|value| value.get("filters"))
        .filter(|filters| filters.is_object())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let page = |name: &str| {
        value
            .and_then(|value| value.get(name))
            .and_then(Value::as_u64)
            .map_or(1, |page| page.clamp(1, u32::MAX as u64) as u32)
    };
    let scope = match value
        .and_then(|value| value.get("scope"))
        .and_then(Value::as_str)
    {
        Some("activity") => auth::AuthProbeScope::Activity,
        Some("overview") => auth::AuthProbeScope::Overview,
        Some("usage") => auth::AuthProbeScope::Usage,
        Some("plans") => auth::AuthProbeScope::Plans,
        Some("status") => auth::AuthProbeScope::Status,
        _ => auth::AuthProbeScope::Full,
    };
    auth::AuthProbeRequest {
        filters,
        usage_page: page("usagePage"),
        error_page: page("errorPage"),
        scope,
    }
}

fn probe_request_summary(request: &auth::AuthProbeRequest) -> String {
    let filters = request.filters.as_object();
    let text = |name: &str| {
        filters
            .and_then(|filters| filters.get(name))
            .and_then(Value::as_str)
            .unwrap_or("-")
    };
    format!(
        "scope={} range={}..{} model={} usage_page={} error_page={}",
        request.scope.name(),
        text("startDate"),
        text("endDate"),
        text("model"),
        request.usage_page,
        request.error_page,
    )
}

#[cfg(not(target_os = "android"))]
fn start_auth_session_probe(app: &AppHandle, state: &AuthState) -> bool {
    if !state.lifecycle.is_foreground() {
        return false;
    }
    if state.startup_probe_started.swap(true, Ordering::AcqRel) {
        return false;
    }
    let app = app.clone();
    let state = state.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = open_auth_window(
            &app,
            &state,
            auth::AuthProbeRequest::default(),
            false,
            "Restoring Cavoti session",
        )
        .await
        {
            state.startup_probe_started.store(false, Ordering::Release);
            eprintln!("[cavoti-auth] startup probe failed: {error}");
        }
    });
    true
}

#[cfg(target_os = "android")]
fn android_dispatch_bool(
    method: &str,
    signature: &str,
    collection_id: &str,
    script: Option<&str>,
    show: Option<bool>,
) -> Result<bool, String> {
    let jvm = ANDROID_JVM
        .get()
        .ok_or_else(|| "Android Activity JVM is unavailable".to_string())?;
    let mut env = jvm
        .attach_current_thread()
        .map_err(|_| "Android Activity JVM could not be attached".to_string())?;
    let class_loader = ANDROID_ACTIVITY_CLASS_LOADER
        .get()
        .ok_or_else(|| "Android Activity class loader is unavailable".to_string())?;
    let class_name = env
        .new_string("com.cavoti.bar.MainActivity")
        .map_err(|_| "Android MainActivity name could not be created".to_string())?;
    let class = JClass::from(
        env.call_method(
            class_loader.as_obj(),
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(class_name.as_ref())],
        )
        .map_err(|_| {
            let _ = env.exception_clear();
            "Android MainActivity is unavailable".to_string()
        })?
        .l()
        .map_err(|_| "Android MainActivity class is invalid".to_string())?,
    );
    let collection_id = env
        .new_string(collection_id)
        .map_err(|_| "Android collection ID could not be passed to MainActivity".to_string())?;
    let value = match (script, show) {
        (Some(script), Some(show)) => {
            let script = env.new_string(script).map_err(|_| {
                "Android probe script could not be passed to MainActivity".to_string()
            })?;
            env.call_static_method(
                class,
                method,
                signature,
                &[
                    JValue::Object(collection_id.as_ref()),
                    JValue::Object(script.as_ref()),
                    JValue::Bool(show as u8),
                ],
            )
        }
        (None, None) => env.call_static_method(
            class,
            method,
            signature,
            &[JValue::Object(collection_id.as_ref())],
        ),
        _ => return Err("Android MainActivity dispatch arguments are invalid".into()),
    }
    .map_err(|_| format!("Android MainActivity dispatch failed: {method}"))?;
    value
        .z()
        .map_err(|_| format!("Android MainActivity dispatch returned an invalid result: {method}"))
}

#[cfg(target_os = "android")]
fn dispatch_android_start_probe(
    collection_id: &str,
    script: &str,
    show: bool,
) -> Result<(), String> {
    if android_dispatch_bool(
        "dispatchStartProbe",
        "(Ljava/lang/String;Ljava/lang/String;Z)Z",
        collection_id,
        Some(script),
        Some(show),
    )? {
        Ok(())
    } else {
        Err("Android MainActivity session adapter is unavailable".into())
    }
}

#[cfg(target_os = "android")]
fn dispatch_android_abort_probe(collection_id: &str) -> Result<(), String> {
    if android_dispatch_bool(
        "dispatchAbortProbe",
        "(Ljava/lang/String;)Z",
        collection_id,
        None,
        None,
    )? {
        Ok(())
    } else {
        Err("Android MainActivity session adapter is unavailable".into())
    }
}

#[cfg(target_os = "android")]
fn dispatch_android_hide_session(collection_id: &str) -> Result<(), String> {
    if android_dispatch_bool(
        "dispatchHideSession",
        "(Ljava/lang/String;)Z",
        collection_id,
        None,
        None,
    )? {
        Ok(())
    } else {
        Err("Android MainActivity session adapter is unavailable".into())
    }
}

#[cfg(target_os = "android")]
fn dispatch_android_prepare_for_login(collection_id: &str) -> Result<(), String> {
    if android_dispatch_bool(
        "dispatchPrepareForLogin",
        "(Ljava/lang/String;)Z",
        collection_id,
        None,
        None,
    )? {
        Ok(())
    } else {
        Err("Android MainActivity session adapter is unavailable".into())
    }
}

#[cfg(target_os = "android")]
fn consume_android_auth_bridge_unavailable() -> bool {
    if !ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING.swap(false, Ordering::AcqRel) {
        return false;
    }
    let Some(app) = ANDROID_APP_HANDLE.get().cloned() else {
        ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING.store(true, Ordering::Release);
        return false;
    };
    let Some(state) = app.try_state::<AuthState>() else {
        ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING.store(true, Ordering::Release);
        return false;
    };
    state
        .android_auth_bridge_unavailable
        .store(true, Ordering::Release);
    abort_current_android_collection(&app, state.inner());
    let _ = emit_bridge_state(
        &app,
        "error",
        0,
        "The Android WebView provider does not support the Cavoti session bridge",
    );
    true
}

#[cfg(target_os = "android")]
fn start_android_session_probe(
    app: &AppHandle,
    state: &AuthState,
    request: auth::AuthProbeRequest,
    show: bool,
    force: bool,
    message: &'static str,
) -> Result<(), String> {
    if !show && !state.lifecycle.is_foreground() {
        return Err("Cavoti session probe was skipped while the app is paused".into());
    }
    if state
        .android_auth_bridge_unavailable
        .load(Ordering::Acquire)
    {
        return Err(
            "The Android WebView provider does not support the Cavoti session bridge".into(),
        );
    }
    state.auth_window_visible.store(show, Ordering::Release);
    if show {
        state
            .automatic_refresh_suspended
            .store(false, Ordering::Release);
    }
    let _probe_start_guard = state
        .android_probe_start_guard
        .lock()
        .map_err(|_| "Cavoti auth startup state is unavailable".to_string())?;
    let collection_id = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Cavoti auth state is unavailable".to_string())?;
        if force {
            adapter.replace_collection_with_request(request)
        } else {
            adapter
                .try_begin_collection_with_request(request)
                .ok_or_else(|| "Cavoti session probe is already running".to_string())?
        }
    };
    let result = (|| {
        emit_bridge_state(app, "loading", 0, message)?;
        let script = active_probe_script(app, state)
            .ok_or_else(|| "Cavoti session probe could not be prepared".to_string())?;
        dispatch_android_start_probe(&collection_id, &script, show)
            .map_err(|_| "The Cavoti session probe could not start".to_string())?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        if let Ok(mut adapter) = state.adapter.lock() {
            adapter.abort(&collection_id);
        }
        let _ = dispatch_android_abort_probe(&collection_id);
        let _ = emit_bridge_state(app, "error", 0, "The Cavoti session probe could not start");
        return Err(error);
    }
    spawn_auth_timeout(app.clone(), state.clone(), collection_id);
    Ok(())
}

fn active_probe_script(app: &AppHandle, state: &AuthState) -> Option<String> {
    let (collection_id, request) = state
        .adapter
        .lock()
        .ok()?
        .active_collection_probe()
        .map(|(id, request)| (id.to_owned(), request.clone()))?;
    let invoke_key = app.invoke_key().to_owned();
    Some(auth::auth_probe_script_with_request(
        &collection_id,
        Some(&invoke_key),
        &request,
    ))
}

#[cfg(not(target_os = "android"))]
async fn open_auth_window(
    app: &AppHandle,
    state: &AuthState,
    request: auth::AuthProbeRequest,
    show: bool,
    message: &'static str,
) -> Result<(), String> {
    if !state.lifecycle.is_foreground() {
        return Ok(());
    }
    if show {
        state
            .automatic_refresh_suspended
            .store(false, Ordering::Release);
    }
    let collection_id = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Cavoti auth state is unavailable".to_string())?;
        if show {
            let Some(collection_id) = adapter.try_begin_collection_with_request(request) else {
                eprintln!("[cavoti-auth] collection already active; ignoring duplicate request");
                return Ok(());
            };
            collection_id
        } else {
            let Some(collection_id) = adapter.try_begin_collection_with_request(request) else {
                eprintln!("[cavoti-auth] collection already active; skipping hidden probe");
                return Err("Cavoti session probe is already running".into());
            };
            collection_id
        }
    };
    emit_bridge_state(app, "loading", 0, message)?;
    let login_url: url::Url = "https://cavoti.com/login"
        .parse::<url::Url>()
        .map_err(|error| error.to_string())?;
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "The Cavoti main window is unavailable".to_string())?;

    if let Some(window) = app.get_webview_window("auth") {
        eprintln!("[cavoti-auth] reusing auth window show={show}");
        let _ = window.eval("window.__cavotiAuthAbort?.();");
        if show {
            window.show().map_err(|error| {
                format!("The Cavoti sign-in window could not be shown: {error}")
            })?;
            #[cfg(desktop)]
            window.unminimize().map_err(|error| {
                format!("The Cavoti sign-in window could not be restored: {error}")
            })?;
            window.set_focus().map_err(|error| {
                format!("The Cavoti sign-in window could not be focused: {error}")
            })?;
            state.auth_window_visible.store(true, Ordering::Release);
        } else {
            let _ = window.hide();
            state.auth_window_visible.store(false, Ordering::Release);
        }
        if show {
            window
                .navigate(login_url.clone())
                .map_err(|error| format!("The Cavoti sign-in page could not be opened: {error}"))?;
        } else if let Ok(url) = window.url() {
            if is_cavoti_origin(url.as_str()) {
                if let Some(script) = active_probe_script(app, state) {
                    window.eval(&script).map_err(|error| {
                        format!("The Cavoti session probe could not start: {error}")
                    })?;
                }
            } else {
                window.navigate(login_url.clone()).map_err(|error| {
                    format!("The Cavoti sign-in page could not be opened: {error}")
                })?;
            }
        } else {
            window
                .navigate(login_url.clone())
                .map_err(|error| format!("The Cavoti sign-in page could not be opened: {error}"))?;
        }
        eprintln!("[cavoti-auth] auth window request accepted show={show}");
        spawn_auth_timeout(app.clone(), state.clone(), collection_id);
        return Ok(());
    }
    let result = (|| {
        let data_directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("The Cavoti auth profile could not start: {error}"))?
            .join("WebView2");
        let builder =
            WebviewWindowBuilder::new(&main_window, "auth", WebviewUrl::External(login_url))
                .title("Sign in to Cavoti")
                .data_directory(data_directory)
                .visible(show);
        #[cfg(desktop)]
        let builder = builder.skip_taskbar(!show);
        #[cfg(desktop)]
        let builder = builder
            .parent(&main_window)
            .map_err(|error| format!("The Cavoti sign-in window could not be parented: {error}"))?;
        #[cfg(desktop)]
        let builder = builder
            .icon(cavoti_icon()?)
            .map_err(|error| format!("The Cavoti sign-in window could not start: {error}"))?;
        builder
            .inner_size(420.0, 720.0)
            .resizable(true)
            .on_navigation(|url| is_allowed_auth_navigation(url.as_str()))
            .on_new_window({
                let app = app.clone();
                move |url, _features| {
                    if is_allowed_auth_navigation(url.as_str()) {
                        if let Some(window) = app.get_webview_window(AUTH_WINDOW_LABEL) {
                            let _ = window.navigate(url);
                        }
                    }
                    tauri::webview::NewWindowResponse::Deny
                }
            })
            .build()
            .map(|window| {
                state.auth_window_visible.store(show, Ordering::Release);
                if show {
                    let _ = window.show();
                    #[cfg(desktop)]
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                } else {
                }
                spawn_auth_timeout(app.clone(), state.clone(), collection_id.clone());
            })
            .map_err(|error| format!("The Cavoti sign-in window could not start: {error}"))
    })();
    if let Err(error) = result {
        if let Ok(mut adapter) = state.adapter.lock() {
            adapter.abort(&collection_id);
        }
        let _ = emit_bridge_state(app, "error", 0, "The Cavoti sign-in window could not start");
        return Err(error);
    }
    Ok(())
}

fn raw_results_state(raw: &AuthRawResults) -> (&'static str, u16, &'static str) {
    if raw.collection_id.is_empty() || raw.phase != "core" && raw.phase != "enrichment" {
        return ("error", 0, "Cavoti returned an invalid session result");
    }
    if raw.results.values().any(|result| result.timed_out) {
        return ("offline", 0, "Cavoti session probe timed out");
    }
    if raw.session_state == "auth-required" {
        let status = raw
            .results
            .values()
            .find(|result| result.status == 401 || result.status == 403)
            .map_or(401, |result| result.status);
        return (
            "auth-required",
            status,
            "Sign in to Cavoti to load usage data",
        );
    }
    if raw.phase == "core" && raw.results.values().any(|result| !result.ok) {
        return ("offline", 0, "Cavoti could not verify the session");
    }
    if let Some(status) = ["me", "subscriptions", "stats", "models", "snapshot"]
        .iter()
        .filter_map(|name| raw.results.get(*name).map(|result| result.status))
        .find(|status| *status == 401 || *status == 403)
    {
        return (
            "auth-required",
            status,
            "Sign in to Cavoti to load usage data",
        );
    }
    if raw.phase == "enrichment" && raw.session_state == "authenticated" {
        return ("live", 0, "Cavoti session verified");
    }
    (
        "loading",
        0,
        "Cavoti session verified; snapshot adapter pending",
    )
}

fn publish_auth_collection(
    app: &AppHandle,
    state: &AuthState,
    payload: AuthCollectionPayload,
) -> Result<bool, String> {
    eprintln!(
        "[cavoti-auth] result received phase={} complete={} state={} {}",
        payload.phase,
        payload.complete,
        payload.session_state,
        payload
            .results
            .iter()
            .map(|(name, result)| format!("{name}={}({}b)", result.status, result.text.len()))
            .collect::<Vec<_>>()
            .join(" "),
    );
    let event = match state
        .adapter
        .lock()
        .map_err(|_| "Cavoti auth state is unavailable".to_string())?
        .accept(payload)
    {
        Ok(event) => event,
        Err(AuthAcceptError::Stale) => return Err("Stale auth collection result".into()),
        Err(AuthAcceptError::Invalid(message)) => {
            let _ = emit_bridge_state(
                &app,
                "error",
                0,
                "Cavoti returned an invalid session result",
            );
            return Err(format!("Invalid auth collection result: {message}"));
        }
    };
    let AuthAdapterEvent::RawResults(raw) = event;
    if raw.phase == "core" && raw.session_state == "auth-required" {
        state
            .automatic_refresh_suspended
            .store(true, Ordering::Release);
    }
    let merged_raw = merge_raw_results(state, &raw);
    let (bridge_state, status, message) = raw_results_state(&raw);
    let normalized_snapshot = if matches!(merged_raw.phase.as_str(), "core" | "enrichment")
        && merged_raw.session_state == "authenticated"
    {
        let Some(snapshot) = normalize_core_snapshot(&merged_raw) else {
            if let Ok(mut adapter) = state.adapter.lock() {
                adapter.abort(&raw.collection_id);
            }
            emit_bridge_state(&app, "error", 0, "Cavoti returned malformed usage data")?;
            return Err("Cavoti core snapshot could not be normalized".into());
        };
        eprintln!(
            "[cavoti-snapshot] normalized usage_logs={} usage_total={} usage_page={} errors={} error_total={} error_page={}",
            snapshot
                .get("usageLogs")
                .and_then(Value::as_array)
                .map_or(0, Vec::len),
            snapshot
                .get("usagePageInfo")
                .and_then(Value::as_object)
                .and_then(|page| page.get("total"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0),
            snapshot
                .get("usagePageInfo")
                .and_then(Value::as_object)
                .and_then(|page| page.get("page"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0),
            snapshot
                .get("errors")
                .and_then(Value::as_array)
                .map_or(0, Vec::len),
            snapshot
                .get("errorPageInfo")
                .and_then(Value::as_object)
                .and_then(|page| page.get("total"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0),
            snapshot
                .get("errorPageInfo")
                .and_then(Value::as_object)
                .and_then(|page| page.get("page"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0),
        );
        Some(snapshot)
    } else {
        None
    };
    if let Some(snapshot) = normalized_snapshot.as_ref() {
        if bridge_state == "live" {
            cache_snapshot(&state, snapshot);
        }
        emit_event(
            &app,
            json!({
                "protocol": 1,
                "type": "snapshot",
                "complete": bridge_state == "live",
                "scope": raw.scope.name(),
                "snapshot": snapshot,
            }),
        )?;
    }
    if bridge_state == "live" {
        if let Some(snapshot) = normalized_snapshot.as_ref() {
            let thresholds = current_settings(state).quota_thresholds;
            state
                .notifications
                .notify_quota_alerts(&app, snapshot, &thresholds);
        }
    }
    emit_bridge_state(app, bridge_state, status, message)?;
    Ok(raw.phase == "enrichment" && raw.session_state == "authenticated")
}

#[tauri::command]
fn auth_collection_result(
    app: AppHandle,
    window: WebviewWindow,
    state: State<AuthState>,
    payload: String,
) -> Result<(), String> {
    if window.label() != AUTH_WINDOW_LABEL {
        return Err("Auth collection is restricted to the auth window".into());
    }

    if payload.as_bytes().len() > MAX_AUTH_PAYLOAD_BYTES {
        return Err("Auth collection payload is too large".into());
    }
    let payload = serde_json::from_str::<AuthCollectionPayload>(&payload)
        .map_err(|_| "Auth collection payload is invalid".to_string())?;

    let current_url = window.url().map_err(|error| error.to_string())?;
    eprintln!(
        "[cavoti-auth] result phase={} complete={} state={} results={}",
        payload.phase,
        payload.complete,
        payload.session_state,
        payload.results.len()
    );
    if !is_cavoti_origin(current_url.as_str()) {
        return Err("Auth collection origin is not Cavoti".into());
    }

    let terminal = publish_auth_collection(&app, &state, payload)?;
    if terminal {
        window
            .hide()
            .map_err(|error| format!("The Cavoti sign-in window could not be hidden: {error}"))?;
        state.auth_window_visible.store(false, Ordering::Release);
        eprintln!("[cavoti-auth] authenticated enrichment complete; auth window hidden");
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn abort_android_collection(app: &AppHandle, state: &AuthState, collection_id: &str) -> bool {
    if collection_id.is_empty() {
        return false;
    }
    let aborted = state
        .adapter
        .lock()
        .map(|mut adapter| {
            let Some(active) = adapter.active_collection_id().map(str::to_owned) else {
                return false;
            };
            if collection_id.is_empty() || active == collection_id {
                adapter.abort(&active)
            } else {
                false
            }
        })
        .unwrap_or(false);
    if aborted && !collection_id.is_empty() {
        if let Err(error) = dispatch_android_abort_probe(collection_id) {
            eprintln!("[cavoti-auth] Android abort dispatch failed: {error}");
            let _ = emit_bridge_state(
                app,
                "error",
                0,
                "The Android session controller is unavailable",
            );
        }
    }
    aborted
}

#[cfg(target_os = "android")]
fn abort_current_android_collection(app: &AppHandle, state: &AuthState) -> bool {
    let collection_id = state
        .adapter
        .lock()
        .ok()
        .and_then(|adapter| adapter.active_collection_id().map(str::to_owned));
    collection_id
        .as_deref()
        .is_some_and(|id| abort_android_collection(app, state, id))
}

#[cfg(target_os = "android")]
fn android_auth_collection_result(
    app: &AppHandle,
    state: &AuthState,
    value: Option<&Value>,
) -> Result<(), String> {
    let collection_id = value
        .and_then(|value| value.get("collectionId"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let payload = match value
        .cloned()
        .ok_or_else(|| "Android auth collection payload is missing".to_string())
        .and_then(|value| {
            serde_json::from_value::<AuthCollectionPayload>(value)
                .map_err(|_| "Android auth collection payload is invalid".to_string())
        }) {
        Ok(payload) => payload,
        Err(error) => {
            if let Some(collection_id) = collection_id.as_deref() {
                abort_android_collection(app, state, collection_id);
            }
            return Err(error);
        }
    };
    let collection_id = payload.collection_id.clone();
    let terminal_core_failure =
        payload.phase == "core" && payload.complete && payload.session_state != "authenticated";
    let result = publish_auth_collection(app, state, payload);
    let terminal = match result {
        Ok(terminal) => terminal,
        Err(error) => {
            abort_android_collection(app, state, &collection_id);
            return Err(error);
        }
    };
    if terminal {
        if let Err(error) = dispatch_android_hide_session(&collection_id) {
            eprintln!("[cavoti-auth] Android hide dispatch failed: {error}");
            abort_android_collection(app, state, &collection_id);
            emit_bridge_state(
                app,
                "error",
                0,
                "The Android session controller is unavailable",
            )?;
            return Err("The Android session controller is unavailable".into());
        }
        state.auth_window_visible.store(false, Ordering::Release);
    } else if terminal_core_failure {
        if let Err(error) = dispatch_android_prepare_for_login(&collection_id) {
            eprintln!("[cavoti-auth] Android login preparation dispatch failed: {error}");
            abort_android_collection(app, state, &collection_id);
            emit_bridge_state(
                app,
                "error",
                0,
                "The Android session controller is unavailable",
            )?;
            return Err("The Android session controller is unavailable".into());
        }
    }
    Ok(())
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeActivityReady(
    mut env: JNIEnv,
    activity: JObject,
) {
    if let Ok(jvm) = env.get_java_vm() {
        let _ = ANDROID_JVM.set(jvm);
    }
    let Ok(activity_class) = env
        .call_method(&activity, "getClass", "()Ljava/lang/Class;", &[])
        .and_then(|value| value.l())
    else {
        return;
    };
    let Ok(class_loader) = env
        .call_method(
            &activity_class,
            "getClassLoader",
            "()Ljava/lang/ClassLoader;",
            &[],
        )
        .and_then(|value| value.l())
    else {
        return;
    };
    if let Ok(global_class_loader) = env.new_global_ref(class_loader) {
        let _ = ANDROID_ACTIVITY_CLASS_LOADER.set(global_class_loader);
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeActivityLifecycle(
    mut env: JNIEnv,
    _activity: JObject,
    lifecycle: JString,
) {
    let Ok(lifecycle) = env.get_string(&lifecycle) else {
        return;
    };
    let Some(app) = ANDROID_APP_HANDLE.get() else {
        return;
    };
    let Some(state) = app.try_state::<AuthState>() else {
        return;
    };
    let value = json!({ "state": lifecycle.to_string_lossy() });
    if let Err(error) = apply_lifecycle_command(app, state.inner(), Some(&value)) {
        eprintln!("[cavoti-lifecycle] native lifecycle dispatch failed: {error}");
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeSubmitAuthResult(
    mut env: JNIEnv,
    _class: JClass,
    payload: JString,
) -> jni::sys::jboolean {
    let Ok(payload) = env.get_string(&payload) else {
        return 0;
    };
    let payload = payload.to_string_lossy();
    if payload.len() > 1024 * 1024 {
        return 0;
    };
    let Ok(value) = serde_json::from_str::<Value>(&payload) else {
        return 0;
    };
    let Some(app) = ANDROID_APP_HANDLE.get().cloned() else {
        return 0;
    };
    let Some(state) = app.try_state::<AuthState>() else {
        return 0;
    };
    if android_auth_collection_result(&app, state.inner(), Some(&value)).is_ok() {
        1
    } else {
        0
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeAbortAuthCollection(
    mut env: JNIEnv,
    _class: JClass,
    collection_id: JString,
) {
    let Ok(collection_id) = env.get_string(&collection_id) else {
        return;
    };
    let collection_id = collection_id.to_string_lossy();
    let Some(app) = ANDROID_APP_HANDLE.get().cloned() else {
        return;
    };
    let Some(state) = app.try_state::<AuthState>() else {
        return;
    };
    abort_android_collection(&app, state.inner(), &collection_id);
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeSessionDocumentReady(
    _env: JNIEnv,
    _class: JClass,
) {
    let Some(app) = ANDROID_APP_HANDLE.get().cloned() else {
        return;
    };
    let Some(state) = app.try_state::<AuthState>() else {
        return;
    };
    let _ = start_android_session_probe(
        &app,
        state.inner(),
        auth::AuthProbeRequest::default(),
        true,
        true,
        "Restoring Cavoti session",
    );
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_com_cavoti_bar_MainActivity_nativeAuthCollectionBridgeUnavailable(
    _env: JNIEnv,
    _class: JClass,
) {
    ANDROID_AUTH_BRIDGE_UNAVAILABLE_PENDING.store(true, Ordering::Release);
    consume_android_auth_bridge_unavailable();
}

#[tauri::command]
async fn host_command(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AuthState>,
    message: HostCommand,
) -> Result<(), String> {
    eprintln!("[cavoti-host] command action={}", message.action);
    log_settings(&app, format!("command action={}", message.action));
    if window.label() != "main" {
        return Err("Host commands are restricted to the main window".into());
    }
    if let Some(command) = resolve_external_command(&message.action, message.value.as_ref())? {
        return match command {
            ExternalCommand::Restart => {
                app.request_restart();
                Ok(())
            }
            ExternalCommand::OpenUrl(url) => app
                .opener()
                .open_url(url, None::<&str>)
                .map_err(|error| format!("External destination could not be opened: {error}")),
        };
    }
    match message.action.as_str() {
        "lifecycle" => apply_lifecycle_command(&app, state.inner(), message.value.as_ref()),
        "bootstrap" => {
            emit_bootstrap(&app, state.inner())?;
            updates::spawn_startup_check(app.clone());
            flush_pending_navigation(&app, state.inner())
        }
        "snapshot-received" | "snapshot-rejected" => Ok(()),
        "check-update" => {
            updates::check_for_update(app.clone(), app.state::<updates::PendingUpdate>(), state)
                .await
                .map(|_| ())
        }
        "install-update" => {
            updates::install_update(app.clone(), app.state::<updates::PendingUpdate>(), state).await
        }
        "connect" => {
            let request = probe_request(message.value.as_ref());
            remember_probe_request(state.inner(), &request);
            #[cfg(target_os = "android")]
            {
                start_android_session_probe(
                    &app,
                    state.inner(),
                    request,
                    true,
                    true,
                    "Connecting to Cavoti session",
                )
            }
            #[cfg(not(target_os = "android"))]
            {
                open_auth_window(
                    &app,
                    state.inner(),
                    request,
                    true,
                    "Connecting to Cavoti session",
                )
                .await
            }
        }
        "refresh" => {
            let request = probe_request(message.value.as_ref());
            remember_probe_request(state.inner(), &request);
            eprintln!(
                "[cavoti-auth] refresh command {}",
                probe_request_summary(&request)
            );
            #[cfg(target_os = "android")]
            {
                start_android_session_probe(
                    &app,
                    state.inner(),
                    request,
                    false,
                    false,
                    "Refreshing Cavoti usage",
                )
            }
            #[cfg(not(target_os = "android"))]
            {
                open_auth_window(
                    &app,
                    state.inner(),
                    request,
                    false,
                    "Refreshing Cavoti usage",
                )
                .await
            }
        }
        "view" => {
            let request = probe_request(message.value.as_ref());
            remember_probe_request(state.inner(), &request);
            eprintln!(
                "[cavoti-auth] view scope request {}",
                probe_request_summary(&request)
            );
            #[cfg(target_os = "android")]
            {
                start_android_session_probe(
                    &app,
                    state.inner(),
                    request,
                    false,
                    false,
                    "Loading Cavoti view",
                )
            }
            #[cfg(not(target_os = "android"))]
            {
                open_auth_window(&app, state.inner(), request, false, "Loading Cavoti view").await
            }
        }
        "setting" => apply_setting(&app, state.inner(), message.value.as_ref()),
        "clear" => {
            let _settings_update_guard = state
                .settings_update_guard
                .lock()
                .map_err(|_| "Cavoti settings state is unavailable".to_string())?;
            let defaults = HostSettings::default();
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().disable();
            }
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(false);
            }
            save_settings(&app, &defaults)?;
            if let Ok(mut settings) = state.settings.lock() {
                *settings = defaults;
            }
            emit_settings(&app, state.inner())
        }
        "close" => {
            if current_settings(state.inner()).close_to_tray {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            } else {
                app.exit(0);
            }
            Ok(())
        }
        "minimize" => {
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
            Ok(())
        }
        "drag" => {
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.start_dragging();
            }
            Ok(())
        }
        "maximize" => {
            let _settings_update_guard = state
                .settings_update_guard
                .lock()
                .map_err(|_| "Cavoti settings state is unavailable".to_string())?;
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                if window.is_maximized().unwrap_or(false) {
                    let _ = window.unmaximize();
                } else {
                    let _ = window.maximize();
                }
                let maximized = window.is_maximized().unwrap_or(false);
                if let Ok(mut settings) = state.settings.lock() {
                    settings.maximized = maximized;
                    save_settings(&app, &settings)?;
                }
                emit_settings(&app, state.inner())?;
            }
            Ok(())
        }
        "exit" => {
            app.exit(0);
            Ok(())
        }
        _ => Err(format!("Unsupported host action: {}", message.action)),
    }
}

#[cfg(desktop)]
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Show Cavoti Bar", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Open settings", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &refresh, &settings, &separator, &quit])?;
    let icon =
        cavoti_icon().map_err(|error| tauri::Error::InvalidIcon(std::io::Error::other(error)))?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "refresh" => {
                let _ = app.emit(
                    "host-command",
                    HostCommand {
                        action: "refresh".into(),
                        value: None,
                    },
                );
            }
            "settings" => {
                show_main_window(app);
                let _ = emit_event(
                    app,
                    json!({ "protocol": 1, "type": "host-navigation", "target": "settings" }),
                );
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(&tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn restore_main_window_state(window: &WebviewWindow) {
    use tauri::{PhysicalPosition, PhysicalSize};
    use tauri_plugin_window_state::{StateFlags, WindowExt};

    let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED;
    let _ = window.restore_state(flags);
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let Ok(monitors) = window.available_monitors() else {
        return;
    };
    let visible = monitors.iter().any(|monitor| {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let right = i64::from(position.x) + i64::from(size.width);
        let bottom = i64::from(position.y) + i64::from(size.height);
        let monitor_right = i64::from(monitor_position.x) + i64::from(monitor_size.width);
        let monitor_bottom = i64::from(monitor_position.y) + i64::from(monitor_size.height);
        let intersection_width =
            right.min(monitor_right) - i64::from(position.x).max(i64::from(monitor_position.x));
        let intersection_height =
            bottom.min(monitor_bottom) - i64::from(position.y).max(i64::from(monitor_position.y));
        intersection_width >= 32 && intersection_height >= 32
    });
    if visible {
        return;
    }
    if let Some(monitor) = monitors.first() {
        let _ = window.unmaximize();
        let position = monitor.position();
        let size = monitor.size();
        let width = size.width.min(430);
        let height = size.height.min(720);
        let _ = window.set_size(PhysicalSize::new(width, height));
        let _ = window.set_position(PhysicalPosition::new(position.x + 22, position.y + 22));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AuthState::default())
        .manage(updates::PendingUpdate::default())
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            eprintln!(
                "[cavoti-auth] page finished label={} url={}",
                webview.label(),
                auth::safe_navigation_url(payload.url().as_str())
            );
            if webview.label() == "main" {
                return;
            }
            let Some(state) = webview.app_handle().try_state::<AuthState>() else {
                return;
            };
            #[cfg(not(target_os = "android"))]
            {
                if webview.label() != AUTH_WINDOW_LABEL {
                    return;
                }
                let hidden_login = url::Url::parse(payload.url().as_str())
                    .ok()
                    .is_some_and(|url| {
                        auth::is_cavoti_origin(payload.url().as_str())
                            && url.path().trim_end_matches('/') == "/login"
                            && !state.auth_window_visible.load(Ordering::Acquire)
                    });
                if !auth::is_auth_probe_document(payload.url().as_str())
                    && !auth::is_auth_callback_document(payload.url().as_str())
                    && !hidden_login
                {
                    return;
                }
                if let Some(script) = active_probe_script(webview.app_handle(), &state) {
                    if let Err(error) = webview.eval(&script) {
                        eprintln!("[cavoti-auth] probe eval failed: {error}");
                    }
                } else if !has_cached_snapshot(&state) {
                    eprintln!("[cavoti-auth] auth document finished without an active probe; starting recovery probe");
                    let app = webview.app_handle().clone();
                    let state = state.inner().clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(error) = open_auth_window(
                            &app,
                            &state,
                            auth::AuthProbeRequest::default(),
                            false,
                            "Restoring Cavoti session",
                        )
                        .await
                        {
                            eprintln!("[cavoti-auth] recovery probe failed: {error}");
                        }
                    });
                }
            }
        })
        .on_window_event(|window, event| {
            if window.label() == AUTH_WINDOW_LABEL && matches!(event, tauri::WindowEvent::Destroyed)
            {
                if let Some(state) = window.app_handle().try_state::<AuthState>() {
                    state.auth_window_visible.store(false, Ordering::Release);
                    let aborted = state
                        .adapter
                        .lock()
                        .ok()
                        .and_then(|mut adapter| {
                            adapter
                                .active_collection_id()
                                .map(str::to_owned)
                                .filter(|collection_id| adapter.abort(collection_id))
                        })
                        .is_some();
                    if aborted && !has_cached_snapshot(&state) {
                        let _ = emit_bridge_state(
                            window.app_handle(),
                            "auth-required",
                            0,
                            "Sign in to Cavoti to load usage data",
                        );
                    } else if aborted {
                        eprintln!(
                            "[cavoti-auth] auth activity destroyed during refresh; retaining cached snapshot"
                        );
                    }
                }
            }
        })
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            host_command,
            auth_collection_result,
            updates::check_for_update,
            updates::install_update
        ]);

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let builder = builder.setup(|app| {
        #[cfg(target_os = "android")]
        {
            let _ = ANDROID_APP_HANDLE.set(app.handle().clone());
        }
        let persisted = load_settings(&app.handle());
        eprintln!(
            "[cavoti-settings] loaded interval={}s close_to_tray={} launch_at_startup={}",
            persisted.refresh_interval_seconds,
            persisted.close_to_tray,
            persisted.launch_at_startup
        );
        let state = app.state::<AuthState>();
        #[cfg(target_os = "android")]
        {
            state.notifications.initialize(app.handle());
            consume_android_auth_bridge_unavailable();
        }
        if let Ok(mut settings) = state.settings.lock() {
            *settings = persisted.clone();
        }
        let navigation_state = state.inner().clone();
        let navigation_app = app.handle().clone();
        let _ = app.deep_link().on_open_url(move |event| {
            let urls = event.urls();
            route_navigation(
                &navigation_app,
                &navigation_state,
                urls.iter().map(|url| url.as_str()),
            );
        });
        if let Ok(Some(urls)) = app.deep_link().get_current() {
            route_navigation(
                &app.handle(),
                state.inner(),
                urls.iter().map(|url| url.as_str()),
            );
        }
        #[cfg(desktop)]
        if let Some(window) = app.get_webview_window("main") {
            restore_main_window_state(&window);
            let _ = window.set_always_on_top(persisted.topmost);
            if persisted.maximized {
                let _ = window.maximize();
            } else {
                let _ = window.unmaximize();
            }
        }
        start_refresh_scheduler(&app.handle(), state.inner());

        #[cfg(desktop)]
        {
            if cfg!(debug_assertions) {
                eprintln!("[cavoti-settings] startup registration skipped in debug build");
            } else {
                use tauri_plugin_autostart::ManagerExt;
                let manager = app.autolaunch();
                let result = if persisted.launch_at_startup {
                    manager.enable()
                } else {
                    manager.disable()
                };
                if let Err(error) = result {
                    eprintln!("[cavoti-settings] startup registration sync failed: {error}");
                }
            }
            build_tray(app)?;
        }
        Ok(())
    });

    #[cfg(desktop)]
    let builder = builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .skip_initial_state("main")
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app)
        }))
        .plugin(tauri_plugin_autostart::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
