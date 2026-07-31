use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Manager, Runtime, State};

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
pub(crate) struct PendingUpdate {
    #[cfg(desktop)]
    pub(crate) update: Mutex<Option<tauri_plugin_updater::Update>>,
    pub(crate) startup_check_started: AtomicBool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateMetadata {
    pub(crate) version: String,
    pub(crate) current_version: String,
    pub(crate) notes: Option<String>,
}

#[tauri::command]
pub(crate) async fn check_for_update<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingUpdate>,
    auth_state: State<'_, crate::AuthState>,
) -> Result<Option<UpdateMetadata>, String> {
    #[cfg(not(desktop))]
    {
        let _ = (app, pending, auth_state);
        return Err("Updates are delivered through the platform store on mobile".into());
    }

    #[cfg(desktop)]
    {
        let update = app
            .updater()
            .map_err(|error| error.to_string())?
            .check()
            .await
            .map_err(|error| error.to_string())?;
        let metadata = update.as_ref().map(|update| UpdateMetadata {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            notes: update.body.clone(),
        });
        if let Ok(mut pending_update) = pending.update.lock() {
            *pending_update = update;
        }
        if let Ok(mut settings) = auth_state.settings.lock() {
            settings.update_ready = metadata.is_some();
        }
        let _ = crate::emit_settings(&app, &auth_state);
        Ok(metadata)
    }
}

#[tauri::command]
pub(crate) async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingUpdate>,
    auth_state: State<'_, crate::AuthState>,
) -> Result<(), String> {
    #[cfg(not(desktop))]
    {
        let _ = (app, pending, auth_state);
        return Err("Updates are delivered through the platform store on mobile".into());
    }

    #[cfg(desktop)]
    {
        let update = pending
            .update
            .lock()
            .map_err(|_| "Pending update state is unavailable".to_string())?
            .take()
            .ok_or_else(|| "No pending update is available".to_string())?;
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|error| error.to_string())?;
        if let Ok(mut settings) = auth_state.settings.lock() {
            settings.update_ready = false;
        }
        let _ = crate::emit_settings(&app, &auth_state);
        Ok(())
    }
}

pub(crate) fn spawn_startup_check<R: Runtime>(app: AppHandle<R>) {
    #[cfg(desktop)]
    {
        let pending = app.state::<PendingUpdate>();
        if pending.startup_check_started.swap(true, Ordering::AcqRel) {
            return;
        }
        tauri::async_runtime::spawn(async move {
            let pending = app.state::<PendingUpdate>();
            let auth_state = app.state::<crate::AuthState>();
            if let Err(error) = check_for_update(app.clone(), pending, auth_state).await {
                eprintln!("[cavoti-updater] startup check failed: {error}");
            }
        });
    }
    #[cfg(not(desktop))]
    let _ = app;
}
