use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const AUTH_WINDOW_LABEL: &str = "auth";
pub const MAX_AUTH_PAYLOAD_BYTES: usize = 1024 * 1024;
pub const MAX_AUTH_RESULT_BYTES: usize = 64 * 1024;
pub const AUTH_COLLECTION_TIMEOUT: Duration = Duration::from_secs(120);

const MAX_COLLECTION_ID_BYTES: usize = 128;
const MAX_PHASE_BYTES: usize = 32;
const MAX_SESSION_STATE_BYTES: usize = 32;
const REQUIRED_ENDPOINTS: [&str; 5] = ["me", "subscriptions", "stats", "models", "snapshot"];
const KNOWN_ENDPOINTS: [&str; 13] = [
    "me",
    "subscriptions",
    "stats",
    "models",
    "snapshot",
    "usage",
    "errors",
    "keys",
    "quota",
    "banner",
    "announcements",
    "status",
    "groups",
];
static COLLECTION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct AuthEndpointResult {
    pub status: u16,
    pub ok: bool,
    pub text: String,
    pub timed_out: bool,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct AuthCollectionPayload {
    #[serde(rename = "type")]
    pub message_type: String,
    pub collection_id: String,
    pub phase: String,
    pub complete: bool,
    pub session_state: String,
    pub results: BTreeMap<String, AuthEndpointResult>,
}

#[derive(Debug, Clone)]
pub struct AuthRawResults {
    pub collection_id: String,
    pub phase: String,
    pub session_state: String,
    pub results: BTreeMap<String, AuthEndpointResult>,
}

#[derive(Debug, Clone)]
pub struct AuthProbeRequest {
    pub filters: Value,
    pub usage_page: u32,
    pub error_page: u32,
}

impl Default for AuthProbeRequest {
    fn default() -> Self {
        Self {
            filters: json!({}),
            usage_page: 1,
            error_page: 1,
        }
    }
}

#[derive(Debug)]
pub enum AuthAdapterEvent {
    // Internal event name: auth-results-internal. This remains Rust-only until
    // the snapshot-core slice normalizes it.
    RawResults(AuthRawResults),
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuthAcceptError {
    Stale,
    Invalid(&'static str),
}

#[derive(Debug, Default)]
pub struct AuthAdapter {
    active: Option<ActiveCollection>,
}

#[derive(Debug)]
struct ActiveCollection {
    id: String,
    phase: &'static str,
    request: AuthProbeRequest,
}

impl AuthAdapter {
    #[cfg(test)]
    pub fn begin_collection(&mut self) -> String {
        self.begin_collection_with_request(AuthProbeRequest::default())
    }

    pub fn begin_collection_with_request(&mut self, request: AuthProbeRequest) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let sequence = COLLECTION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let id = format!("{timestamp:x}-{sequence:x}");
        self.active = Some(ActiveCollection {
            id: id.clone(),
            phase: "core",
            request,
        });
        id
    }

    pub fn try_begin_collection_with_request(
        &mut self,
        request: AuthProbeRequest,
    ) -> Option<String> {
        if self.active.is_some() {
            return None;
        }
        Some(self.begin_collection_with_request(request))
    }

    pub fn replace_collection_with_request(&mut self, request: AuthProbeRequest) -> String {
        self.begin_collection_with_request(request)
    }

    pub fn active_collection_id(&self) -> Option<&str> {
        self.active
            .as_ref()
            .map(|collection| collection.id.as_str())
    }

    pub fn active_collection_probe(&self) -> Option<(&str, &AuthProbeRequest)> {
        self.active
            .as_ref()
            .map(|collection| (collection.id.as_str(), &collection.request))
    }

    pub fn abort(&mut self, collection_id: &str) -> bool {
        if self.active_collection_id() != Some(collection_id) {
            return false;
        }
        self.active = None;
        true
    }

    pub fn accept(
        &mut self,
        payload: AuthCollectionPayload,
    ) -> Result<AuthAdapterEvent, AuthAcceptError> {
        let Some(active) = self.active.as_mut() else {
            return Err(AuthAcceptError::Stale);
        };
        if active.id != payload.collection_id {
            return Err(AuthAcceptError::Stale);
        }
        if payload.message_type != "api-results"
            || !matches!(
                payload.session_state.as_str(),
                "authenticated" | "auth-required" | "unknown"
            )
        {
            return Err(AuthAcceptError::Invalid("invalid message"));
        }
        if payload.collection_id.is_empty()
            || payload.collection_id.len() > MAX_COLLECTION_ID_BYTES
            || payload.phase.len() > MAX_PHASE_BYTES
            || payload.session_state.len() > MAX_SESSION_STATE_BYTES
        {
            return Err(AuthAcceptError::Invalid(
                "session result metadata is too large",
            ));
        }
        if payload.phase != active.phase {
            return Err(AuthAcceptError::Invalid("invalid phase"));
        }
        if payload.results.len() > KNOWN_ENDPOINTS.len() {
            return Err(AuthAcceptError::Invalid("too many results"));
        }
        if payload
            .results
            .keys()
            .any(|name| !KNOWN_ENDPOINTS.contains(&name.as_str()))
        {
            return Err(AuthAcceptError::Invalid("unknown result"));
        }
        if payload
            .results
            .values()
            .any(|result| result.text.len() > MAX_AUTH_RESULT_BYTES)
        {
            return Err(AuthAcceptError::Invalid("result too large"));
        }

        let raw = AuthRawResults {
            collection_id: payload.collection_id.clone(),
            phase: payload.phase.clone(),
            session_state: payload.session_state,
            results: payload.results,
        };

        if active.phase == "core" {
            if REQUIRED_ENDPOINTS
                .iter()
                .any(|name| !raw.results.contains_key(*name))
            {
                return Err(AuthAcceptError::Invalid("missing required result"));
            }
            let required_failed = REQUIRED_ENDPOINTS.iter().any(|name| {
                raw.results
                    .get(*name)
                    .is_some_and(|result| !result.ok || !(200..300).contains(&result.status))
            });
            if required_failed {
                if !payload.complete {
                    return Err(AuthAcceptError::Invalid("non-terminal core failure"));
                }
                self.active = None;
            } else {
                if payload.complete {
                    return Err(AuthAcceptError::Invalid("core completed early"));
                }
                active.phase = "enrichment";
            }
        } else {
            if !payload.complete {
                return Err(AuthAcceptError::Invalid("enrichment is not terminal"));
            }
            self.active = None;
        }

        Ok(AuthAdapterEvent::RawResults(raw))
    }
}

pub fn is_cavoti_origin(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("cavoti.com"))
        && url.port_or_known_default() == Some(443)
}

pub fn is_auth_probe_document(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    if !is_cavoti_origin(value) {
        return false;
    }
    let path = url.path().trim_end_matches('/');
    path != "/login" && path != "/auth/oauth/callback"
}

pub fn is_auth_callback_document(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    is_cavoti_origin(value) && url.path().trim_end_matches('/') == "/auth/oauth/callback"
}

pub fn safe_navigation_url(value: &str) -> String {
    let Ok(mut url) = url::Url::parse(value) else {
        return "<invalid-url>".into();
    };
    url.set_query(None);
    url.set_fragment(None);
    url.to_string()
}

pub fn is_allowed_auth_navigation(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https" || url.port_or_known_default() != Some(443) {
        return false;
    }
    matches!(
        url.host_str().map(str::to_ascii_lowercase).as_deref(),
        Some("cavoti.com")
            | Some("accounts.google.com")
            | Some("accounts.youtube.com")
            | Some("oauth2.googleapis.com")
            | Some("x.com")
            | Some("twitter.com")
            | Some("api.x.com")
            | Some("api.twitter.com")
    )
}

fn serialize_invoke_key(invoke_key: Option<&str>) -> String {
    serde_json::to_string(&invoke_key.filter(|key| !key.is_empty()))
        .unwrap_or_else(|_| "null".into())
}

#[cfg(test)]
pub fn auth_probe_script(collection_id: &str, invoke_key: Option<&str>) -> String {
    auth_probe_script_with_request(collection_id, invoke_key, &AuthProbeRequest::default())
}

pub fn auth_probe_script_with_request(
    collection_id: &str,
    invoke_key: Option<&str>,
    request: &AuthProbeRequest,
) -> String {
    let collection_id =
        serde_json::to_string(collection_id).unwrap_or_else(|_| "\"invalid\"".into());
    let invoke_key = serialize_invoke_key(invoke_key);
    let filters = serde_json::to_string(&request.filters).unwrap_or_else(|_| "{}".into());
    format!(
        r#"(() => {{
  const collectionId = {collection_id};
  const invokeKey = {invoke_key};
  const filters = {filters};
  const usagePage = {usage_page};
  const errorPage = {error_page};
  const CAVOTI_TIMEOUT_MS = 10000;
  const internals = window.__TAURI_INTERNALS__;
  const invoke = (cmd, payload) => new Promise((resolve, reject) => {{
    if (typeof invokeKey !== 'string' || invokeKey.length === 0) {{
      reject(new Error('Tauri invoke key unavailable'));
      return;
    }}
    if (typeof window.ipc?.postMessage !== 'function' || typeof internals?.transformCallback !== 'function') {{
      reject(new Error('Tauri IPC transport unavailable'));
      return;
    }}
    const callback = internals.transformCallback(resolve, true);
    const error = internals.transformCallback(reject, false);
    window.ipc.postMessage(JSON.stringify({{ cmd, callback, error, payload, __TAURI_INVOKE_KEY__: invokeKey }}));
  }});
  if (window.__cavotiAuthProbeId === collectionId) return;
  window.__cavotiAuthProbeId = collectionId;
  const controller = new AbortController();
  window.__cavotiAuthAbort = () => controller.abort();
  const fetchResult = async (url, options, timeoutMilliseconds) => {{
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    controller.signal.addEventListener('abort', abortRequest, {{ once: true }});
    let timer;
    try {{
      const operation = (async () => {{
        const response = await fetch(url, {{ ...options, signal: requestController.signal }});
        return {{ status: response.status, ok: response.ok, text: (await response.text()).slice(0, {max_bytes}), timedOut: false }};
      }})();
      const timeout = new Promise((resolve) => {{
        timer = setTimeout(() => {{ requestController.abort(); resolve({{ status: 0, ok: false, text: '', timedOut: true }}); }}, timeoutMilliseconds);
      }});
      return await Promise.race([operation, timeout]);
    }} catch {{
      return {{ status: 0, ok: false, text: '', timedOut: false }};
    }} finally {{
      controller.signal.removeEventListener('abort', abortRequest);
      clearTimeout(timer);
    }}
  }};
  const send = (phase, complete, sessionState, results) => {{
    const payload = {{ type: 'api-results', collectionId, phase, complete, sessionState, results }};
    if (typeof window.CavotiAndroidResult?.postMessage === 'function') {{
      window.CavotiAndroidResult.postMessage(JSON.stringify(payload));
      return Promise.resolve();
    }}
    return invoke('auth_collection_result', {{ payload: JSON.stringify(payload) }});
  }};
  const waitForAuthenticatedNavigation = () => {{
    if (location.pathname !== '/auth/oauth/callback') return Promise.resolve();
    return new Promise((resolve) => {{
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      const cleanup = () => {{
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', check);
      }};
      const check = () => {{
        if (location.pathname !== '/auth/oauth/callback') {{
          cleanup();
          resolve();
        }}
      }};
      history.pushState = function(...args) {{
        originalPushState.apply(this, args);
        check();
      }};
      history.replaceState = function(...args) {{
        originalReplaceState.apply(this, args);
        check();
      }};
      window.addEventListener('popstate', check);
      check();
    }});
  }};
  (async () => {{
    await waitForAuthenticatedNavigation();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = new Date();
    const start = new Date(today.getTime() - 29 * 86400000);
    const iso = (value) => value.toISOString().slice(0, 10);
    const params = new URLSearchParams({{ start_date: filters.startDate || iso(start), end_date: filters.endDate || iso(today), timezone: zone }});
    const optionalFilters = {{ api_key_id: filters.apiKeyId, model: filters.model, group_id: filters.groupId, billing_type: filters.billingType, billing_mode: filters.billingMode }};
    for (const [key, value] of Object.entries(optionalFilters)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    const streamByType = {{ sync: 1, stream: 2, ws_v2: 3 }};
    if (filters.requestType && streamByType[filters.requestType]) params.set('stream', String(streamByType[filters.requestType]));
    const query = params.toString();
    const authToken = localStorage.getItem('auth_token');
    const headers = {{ accept: 'application/json' }};
    if (authToken) headers.Authorization = `Bearer ${{authToken}}`;
    const cavotiOptions = {{ credentials: 'include', mode: 'same-origin', headers }};
    const urls = {{
      me: `https://cavoti.com/api/v1/auth/me?timezone=${{encodeURIComponent(zone)}}`,
      subscriptions: `https://cavoti.com/api/v1/subscriptions/active?timezone=${{encodeURIComponent(zone)}}`,
      stats: `https://cavoti.com/api/v1/usage/stats?${{query}}`,
      models: `https://cavoti.com/api/v1/usage/dashboard/models?${{query}}&model_source=requested`,
      snapshot: `https://cavoti.com/api/v1/usage/dashboard/snapshot-v2?${{query}}&granularity=day&include_trend=true&include_model_stats=false&include_group_stats=true`,
      usage: `https://cavoti.com/api/v1/usage?page=${{usagePage}}&page_size=100&${{query}}`,
      errors: `https://cavoti.com/api/v1/usage/errors?page=${{errorPage}}&page_size=100&${{query}}`,
      keys: `https://cavoti.com/api/v1/keys?page=1&page_size=100&timezone=${{encodeURIComponent(zone)}}`,
      quota: `https://cavoti.com/api/v1/subscriptions/quota-reset-cards?timezone=${{encodeURIComponent(zone)}}`,
      banner: `https://cavoti.com/api/v1/settings/banner?timezone=${{encodeURIComponent(zone)}}`,
      announcements: `https://cavoti.com/api/v1/announcements?timezone=${{encodeURIComponent(zone)}}`,
      status: `https://cavoti.com/api/v1/channel-monitors?timezone=${{encodeURIComponent(zone)}}`,
      groups: `https://cavoti.com/api/v1/groups/available?timezone=${{encodeURIComponent(zone)}}`
    }};
    const requiredNames = ['me', 'subscriptions', 'stats', 'models', 'snapshot'];
    const requiredResults = {{}};
    await Promise.all(requiredNames.map(async (name) => {{
      if (controller.signal.aborted) return;
      requiredResults[name] = await fetchResult(urls[name], cavotiOptions, CAVOTI_TIMEOUT_MS);
    }}));
    if (controller.signal.aborted) return;
    const authenticated = requiredNames.every((name) => requiredResults[name]?.ok && requiredResults[name]?.status >= 200 && requiredResults[name]?.status < 300);
    const sessionState = authenticated ? 'authenticated' : (Object.values(requiredResults).some((result) => result.status === 401 || result.status === 403) ? 'auth-required' : 'unknown');
    await send('core', !authenticated, sessionState, requiredResults);
    if (!authenticated || controller.signal.aborted) return;

    const optionalNames = ['usage', 'errors', 'keys', 'quota', 'banner', 'announcements', 'status', 'groups'];
    const optionalResults = {{}};
    await Promise.all(optionalNames.map(async (name) => {{
      optionalResults[name] = await fetchResult(urls[name], cavotiOptions, CAVOTI_TIMEOUT_MS);
    }}));
    if (controller.signal.aborted) return;

    if (controller.signal.aborted) return;
    const results = {{ ...requiredResults, ...optionalResults }};
    await send('enrichment', true, sessionState, results);
  }})().catch(() => console.error('[cavoti-auth] probe failed'));
}})();"#,
        max_bytes = MAX_AUTH_RESULT_BYTES,
        filters = filters,
        usage_page = request.usage_page.max(1),
        error_page = request.error_page.max(1),
    )
}

#[cfg(test)]
impl AuthCollectionPayload {
    fn test_result(status: u16) -> AuthEndpointResult {
        AuthEndpointResult {
            status,
            ok: (200..300).contains(&status),
            text: "{}".into(),
            timed_out: false,
        }
    }

    pub fn test_core(collection_id: &str, status: u16) -> Self {
        Self {
            message_type: "api-results".into(),
            collection_id: collection_id.into(),
            phase: "core".into(),
            complete: status < 200 || status >= 300,
            session_state: if (200..300).contains(&status) {
                "authenticated"
            } else {
                "auth-required"
            }
            .into(),
            results: REQUIRED_ENDPOINTS
                .into_iter()
                .map(|name| (name.into(), Self::test_result(status)))
                .collect(),
        }
    }

    pub fn test_enrichment(collection_id: &str) -> Self {
        Self {
            message_type: "api-results".into(),
            collection_id: collection_id.into(),
            phase: "enrichment".into(),
            complete: true,
            session_state: "authenticated".into(),
            results: BTreeMap::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invoke_key_serialization_guards_missing_and_empty_values() {
        assert_eq!(serialize_invoke_key(None), "null");
        assert_eq!(serialize_invoke_key(Some("")), "null");
        assert_eq!(serialize_invoke_key(Some("runtime-key")), "\"runtime-key\"");

        let script = auth_probe_script("collection", Some("runtime-key"));
        assert!(script.contains("__TAURI_INVOKE_KEY__: invokeKey"));
        assert!(script.contains("Tauri invoke key unavailable"));
    }

    #[test]
    fn auth_payload_deserialization_rejects_unknown_fields() {
        let payload = json!({
            "type": "api-results",
            "collectionId": "collection",
            "phase": "core",
            "complete": false,
            "sessionState": "authenticated",
            "results": {
                "me": {
                    "status": 200,
                    "ok": true,
                    "text": "{}",
                    "timedOut": false,
                    "diagnostics": "unexpected"
                }
            },
            "diagnostics": "unexpected"
        });

        assert!(serde_json::from_value::<AuthCollectionPayload>(payload).is_err());
    }

    #[test]
    fn auth_payload_metadata_bounds_are_enforced_after_deserialization() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        let mut payload = AuthCollectionPayload::test_core(&collection_id, 200);
        payload.phase = "x".repeat(MAX_PHASE_BYTES + 1);

        assert!(matches!(
            adapter.accept(payload),
            Err(AuthAcceptError::Invalid(
                "session result metadata is too large"
            ))
        ));
    }

    #[test]
    fn auth_probe_waits_for_the_post_login_document() {
        assert!(!is_auth_probe_document("https://cavoti.com/login"));
        assert!(!is_auth_probe_document(
            "https://cavoti.com/auth/oauth/callback#access_token=secret"
        ));
        assert!(is_auth_probe_document("https://cavoti.com/dashboard"));
    }

    #[test]
    fn terminal_auth_failure_allows_a_new_collection() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        let payload = AuthCollectionPayload::test_core(&collection_id, 401);

        assert!(matches!(
            adapter.accept(payload),
            Ok(AuthAdapterEvent::RawResults(_))
        ));
        assert!(adapter.active_collection_id().is_none());
        assert!(adapter
            .try_begin_collection_with_request(AuthProbeRequest::default())
            .is_some());
    }

    #[test]
    fn cancelled_collection_results_are_stale() {
        let mut adapter = AuthAdapter::default();
        let collection_id = adapter.begin_collection();
        assert!(adapter.abort(&collection_id));
        assert!(matches!(
            adapter.accept(AuthCollectionPayload::test_core(&collection_id, 200)),
            Err(AuthAcceptError::Stale)
        ));
    }

    #[test]
    fn replacing_a_collection_makes_the_new_id_active_atomically() {
        let mut adapter = AuthAdapter::default();
        let previous = adapter.begin_collection();
        let replacement = adapter.replace_collection_with_request(AuthProbeRequest::default());

        assert_ne!(previous, replacement);
        assert_eq!(adapter.active_collection_id(), Some(replacement.as_str()));
        assert!(matches!(
            adapter.accept(AuthCollectionPayload::test_core(&previous, 200)),
            Err(AuthAcceptError::Stale)
        ));
    }

    #[test]
    fn safe_navigation_url_removes_query_and_fragment_credentials() {
        let safe = safe_navigation_url(
            "https://cavoti.com/auth/oauth/callback#access_token=secret&refresh_token=secret",
        );
        assert_eq!(safe, "https://cavoti.com/auth/oauth/callback");
        assert!(!safe.contains("secret"));
    }
}
