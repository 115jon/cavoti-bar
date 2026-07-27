use crate::quota::QuotaNotificationCoordinator;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::{NotificationExt, PermissionState};

#[derive(Debug, Default)]
pub(crate) struct NativeNotifications {
    quota: Mutex<QuotaNotificationCoordinator>,
    last_connection_state: Mutex<Option<String>>,
}

impl NativeNotifications {
    pub(crate) fn ensure_permission<R: Runtime>(&self, app: &AppHandle<R>) {
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

    pub(crate) fn notify_connection_state<R: Runtime>(&self, app: &AppHandle<R>, state: &str) {
        if state == "loading" {
            return;
        }
        let changed = self
            .last_connection_state
            .lock()
            .map(|mut previous| {
                if previous.as_deref() == Some(state) {
                    false
                } else {
                    *previous = Some(state.to_owned());
                    true
                }
            })
            .unwrap_or(false);
        if !changed {
            return;
        }
        let (title, body) = match state {
            "live" => ("Cavoti connected", "Usage monitoring is active."),
            "offline" => ("Cavoti connection", "Cavoti could not be reached."),
            "auth-required" => ("Cavoti connection", "Sign in to Cavoti to load usage data."),
            "error" => ("Cavoti connection", "Cavoti connection is unavailable."),
            _ => return,
        };
        show(app, title, body);
    }

    pub(crate) fn notify_quota_alerts<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        snapshot: &Value,
        thresholds: &[u8],
    ) {
        let alerts = self
            .quota
            .lock()
            .map(|mut quota| quota.evaluate(snapshot, thresholds))
            .unwrap_or_default();
        for alert in alerts {
            show(
                app,
                "Cavoti quota alert",
                &format!(
                    "{} {} usage reached {}%.",
                    alert.plan, alert.window, alert.threshold
                ),
            );
        }
    }
}

fn show<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    if let Err(error) = app.notification().builder().title(title).body(body).show() {
        eprintln!("[cavoti-notifications] notification failed: {error}");
    }
}
