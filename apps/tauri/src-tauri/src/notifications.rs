use crate::quota::QuotaNotificationCoordinator;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri_plugin_notification::{Channel, Importance, Visibility};
use tauri_plugin_notification::{NotificationExt, PermissionState};

#[derive(Debug, Default)]
pub(crate) struct NativeNotifications {
    quota: Mutex<QuotaNotificationCoordinator>,
    last_connection_state: Arc<Mutex<Option<String>>>,
    channel_ready: AtomicBool,
}

impl NativeNotifications {
    pub(crate) fn initialize<R: Runtime>(&self, app: &AppHandle<R>) {
        self.ensure_channel(app);
    }

    fn ensure_channel<R: Runtime>(&self, app: &AppHandle<R>) -> bool {
        if self.channel_ready.load(Ordering::Acquire) {
            return true;
        }
        #[cfg(target_os = "android")]
        let result: Result<(), String> = app
            .notification()
            .create_channel(
                Channel::builder("cavoti-monitor", "Cavoti monitoring")
                    .description("Connection and quota alerts from Cavoti Bar.")
                    .importance(Importance::Default)
                    .visibility(Visibility::Private)
                    .vibration(true)
                    .build(),
            )
            .map_err(|error| error.to_string());
        #[cfg(not(target_os = "android"))]
        let result: Result<(), String> = Ok(());

        if let Err(error) = result {
            eprintln!("[cavoti-notifications] channel creation failed: {error}");
            return false;
        }
        self.channel_ready.store(true, Ordering::Release);
        true
    }

    pub(crate) fn ensure_permission<R: Runtime>(&self, app: &AppHandle<R>) {
        self.ensure_channel(app);
        match app.notification().permission_state() {
            Ok(PermissionState::Granted) => {}
            Ok(_) => {
                if let Err(error) = app.notification().request_permission() {
                    eprintln!("[cavoti-notifications] permission request failed: {error}");
                }
            }
            Err(error) => {
                eprintln!("[cavoti-notifications] permission check failed: {error}");
            }
        }
    }

    pub(crate) fn notify_connection_state<R: Runtime>(
        self: &Arc<Self>,
        app: &AppHandle<R>,
        state: &str,
    ) {
        if state == "loading" {
            return;
        }
        let (title, body) = match state {
            "live" => ("Cavoti connected", "Usage monitoring is active."),
            "offline" => ("Cavoti connection", "Cavoti could not be reached."),
            "auth-required" => ("Cavoti connection", "Sign in to Cavoti to load usage data."),
            "error" => ("Cavoti connection", "Cavoti connection is unavailable."),
            _ => return,
        };
        let app = app.clone();
        let notifications = Arc::clone(self);
        let state = state.to_owned();
        let title = title.to_owned();
        let body = body.to_owned();
        std::thread::spawn(move || {
            if !notifications.ensure_channel(&app) {
                return;
            }
            let Ok(mut previous) = notifications.last_connection_state.lock() else {
                return;
            };
            if previous.as_deref() == Some(state.as_str()) {
                return;
            }
            *previous = Some(state.clone());
            drop(previous);
            if !show(&app, &title, &body) {
                if let Ok(mut previous) = notifications.last_connection_state.lock() {
                    if previous.as_deref() == Some(state.as_str()) {
                        *previous = None;
                    }
                }
            }
        });
    }

    pub(crate) fn notify_quota_alerts<R: Runtime>(
        self: &Arc<Self>,
        app: &AppHandle<R>,
        snapshot: &Value,
        thresholds: &[u8],
    ) {
        let app = app.clone();
        let notifications = Arc::clone(self);
        let snapshot = snapshot.clone();
        let thresholds = thresholds.to_vec();
        std::thread::spawn(move || {
            if !notifications.ensure_channel(&app) {
                return;
            }
            let alerts = notifications
                .quota
                .lock()
                .map(|mut quota| quota.evaluate(&snapshot, &thresholds))
                .unwrap_or_default();
            for alert in alerts {
                show(
                    &app,
                    "Cavoti quota alert",
                    &format!(
                        "{} {} usage reached {}%.",
                        alert.plan, alert.window, alert.threshold
                    ),
                );
            }
        });
    }
}

fn show<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) -> bool {
    if let Err(error) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .channel_id("cavoti-monitor")
        .show()
    {
        eprintln!("[cavoti-notifications] notification failed: {error}");
        return false;
    }
    true
}
