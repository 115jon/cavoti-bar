use crate::auth::AuthRawResults;
use serde_json::{json, Map, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

fn object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn data_for(raw: &AuthRawResults, name: &str) -> Option<Value> {
    let result = raw.results.get(name)?;
    if !result.ok || !(200..300).contains(&result.status) {
        return None;
    }
    let parsed = serde_json::from_str::<Value>(&result.text).ok()?;
    Some(parsed.get("data").cloned().unwrap_or(parsed))
}

fn captured_at() -> Value {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map(Value::String)
        .unwrap_or(Value::Null)
}

fn reset_at(item: Option<&Map<String, Value>>, field: &str, hours: i64) -> Value {
    let Some(value) = item
        .and_then(|item| item.get(field))
        .and_then(Value::as_str)
    else {
        return Value::Null;
    };
    let Ok(start) = OffsetDateTime::parse(value, &Rfc3339) else {
        return Value::Null;
    };
    start
        .checked_add(time::Duration::hours(hours))
        .and_then(|reset| reset.format(&Rfc3339).ok())
        .map(Value::String)
        .unwrap_or(Value::Null)
}

fn monthly_reset_at(item: Option<&Map<String, Value>>) -> Value {
    let rolling = reset_at(item, "monthly_window_start", 720);
    let Some(expiry) = item
        .and_then(|item| item.get("expires_at"))
        .and_then(Value::as_str)
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
    else {
        return rolling;
    };
    let Some(rolling) = rolling
        .as_str()
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
    else {
        return expiry
            .format(&Rfc3339)
            .map(Value::String)
            .unwrap_or(Value::Null);
    };
    expiry
        .min(rolling)
        .format(&Rfc3339)
        .map(Value::String)
        .unwrap_or(Value::Null)
}

fn text(item: Option<&Map<String, Value>>, name: &str, fallback: &str) -> String {
    item.and_then(|value| value.get(name))
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_owned()
}

fn nullable_text(item: Option<&Map<String, Value>>, name: &str) -> Value {
    item.and_then(|value| value.get(name))
        .and_then(Value::as_str)
        .map_or(Value::Null, |value| Value::String(value.to_owned()))
}

fn number(item: Option<&Map<String, Value>>, name: &str) -> f64 {
    item.and_then(|value| value.get(name))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map_or(0.0, |value| value.max(0.0))
}

fn array_at<'a>(item: &'a Map<String, Value>, name: &str) -> &'a [Value] {
    item.get(name)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn rows(source: &[Value], name_key: &str) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "name": text(Some(item), name_key, "Unknown"),
                    "requests": number(Some(item), "requests"),
                    "tokens": number(Some(item), "total_tokens"),
                    "inputTokens": number(Some(item), "input_tokens"),
                    "outputTokens": number(Some(item), "output_tokens"),
                    "cacheCreationTokens": number(Some(item), "cache_creation_tokens"),
                    "cacheReadTokens": number(Some(item), "cache_read_tokens"),
                    "actualCost": number(Some(item), "actual_cost"),
                    "standardCost": number(Some(item), "cost"),
                })
            })
            .collect(),
    )
}

fn trend_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "date": text(Some(item), "date", ""),
                    "requests": number(Some(item), "requests"),
                    "tokens": number(Some(item), "total_tokens"),
                    "inputTokens": number(Some(item), "input_tokens"),
                    "outputTokens": number(Some(item), "output_tokens"),
                    "cacheCreationTokens": number(Some(item), "cache_creation_tokens"),
                    "cacheReadTokens": number(Some(item), "cache_read_tokens"),
                    "actualCost": number(Some(item), "actual_cost"),
                    "standardCost": number(Some(item), "cost"),
                })
            })
            .collect(),
    )
}

fn usage_window(
    item: Option<&Map<String, Value>>,
    used_key: &str,
    limit_key: &str,
    unit: &str,
    reset: Value,
) -> Value {
    let used = number(item, used_key);
    let limit = number(item, limit_key);
    json!({
        "used": used,
        "limit": limit,
        "configured": limit > 0.0,
        "unit": unit,
        "resetAt": reset,
    })
}

fn monthly_usage_window(item: Option<&Map<String, Value>>, unit: &str) -> Value {
    let monthly_limit = number(item, "monthly_limit_usd");
    let limit = if monthly_limit > 0.0 {
        monthly_limit
    } else {
        let weekly_limit = number(item, "weekly_limit_usd");
        if weekly_limit > 0.0 {
            weekly_limit * 5.0
        } else {
            0.0
        }
    };
    let used = number(item, "monthly_usage_usd");
    json!({
        "used": used,
        "limit": limit,
        "configured": limit > 0.0,
        "unit": unit,
        "resetAt": monthly_reset_at(item),
    })
}

fn subscription_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                let raw_kind = text(Some(item), "billing_kind", "subscription");
                let point_based = raw_kind.to_ascii_lowercase().contains("point")
                    || text(Some(item), "product_type", "")
                        .to_ascii_lowercase()
                        .contains("point");
                let unit = if point_based { "points" } else { "usd" };
                let billing_kind = match raw_kind.to_ascii_lowercase().as_str() {
                    "point_pack" => "Per-request plan",
                    "usage_quota" => "Usage plan",
                    _ => raw_kind.as_str(),
                };
                let raw_name = text(Some(item), "plan_name", "Unnamed plan");
                let name = if raw_name.eq_ignore_ascii_case("usage_quota") {
                    "Usage plan".to_owned()
                } else {
                    raw_name
                };
                let five_hour = usage_window(
                    Some(item),
                    "daily_usage_usd",
                    "daily_limit_usd",
                    unit,
                    reset_at(Some(item), "daily_window_start", 5),
                );
                json!({
                    "name": name,
                    "status": text(Some(item), "status", "unknown"),
                    "billingKind": billing_kind,
                    "unit": unit,
                    "expiresAt": nullable_text(Some(item), "expires_at"),
                    "usage": {
                        "fiveHour": five_hour,
                        "weekly": usage_window(Some(item), "weekly_usage_usd", "weekly_limit_usd", unit, reset_at(Some(item), "weekly_window_start", 168)),
                        "monthly": monthly_usage_window(Some(item), unit),
                    },
                })
            })
            .collect(),
    )
}

fn location_row(item: Option<&Map<String, Value>>) -> Value {
    let Some(item) = item else {
        return Value::Null;
    };
    json!({
        "city": text(Some(item), "city", ""),
        "region": text(Some(item), "region", ""),
        "country": text(Some(item), "country", ""),
        "countryCode": text(Some(item), "country_code", ""),
        "organization": text(Some(item), "organization_name", &text(Some(item), "organization", "")),
        "timezone": text(Some(item), "timezone", ""),
    })
}

fn usage_log_rows(source: &[Value], geo: Option<&Map<String, Value>>) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                let api_key = item.get("api_key").and_then(object);
                let group = item.get("group").and_then(object);
                let ip = text(Some(item), "ip_address", "Unknown IP");
                let location = geo
                    .and_then(|items| items.get(&ip))
                    .and_then(object)
                    .map_or(Value::Null, |value| location_row(Some(value)));
                let total_tokens = number(Some(item), "input_tokens")
                    + number(Some(item), "output_tokens")
                    + number(Some(item), "cache_creation_tokens")
                    + number(Some(item), "cache_read_tokens");
                json!({
                    "id": number(Some(item), "id"),
                    "requestId": text(Some(item), "request_id", ""),
                    "apiKeyName": text(api_key, "name", "Unknown key"),
                    "model": text(Some(item), "model", "Unknown model"),
                    "reasoningEffort": text(Some(item), "reasoning_effort", "default"),
                    "endpoint": text(Some(item), "inbound_endpoint", "Unknown endpoint"),
                    "groupName": text(group, "name", "Unknown group"),
                    "inputTokens": number(Some(item), "input_tokens"),
                    "outputTokens": number(Some(item), "output_tokens"),
                    "cacheCreationTokens": number(Some(item), "cache_creation_tokens"),
                    "cacheReadTokens": number(Some(item), "cache_read_tokens"),
                    "totalTokens": total_tokens,
                    "actualCost": number(Some(item), "actual_cost"),
                    "standardCost": number(Some(item), "total_cost"),
                    "timeToFirstTokenMs": number(Some(item), "first_token_ms"),
                    "durationMs": number(Some(item), "duration_ms"),
                    "ipAddress": ip,
                    "location": location,
                    "userAgent": text(Some(item), "user_agent", "Unknown client"),
                    "createdAt": text(Some(item), "created_at", ""),
                })
            })
            .collect(),
    )
}

fn error_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "id": number(Some(item), "id"),
                    "createdAt": text(Some(item), "created_at", ""),
                    "model": text(Some(item), "model", "Unknown model"),
                    "endpoint": text(Some(item), "inbound_endpoint", "Unknown endpoint"),
                    "statusCode": number(Some(item), "status_code"),
                    "category": text(Some(item), "category", "Unknown"),
                    "platform": text(Some(item), "platform", "Unknown"),
                    "message": text(Some(item), "message", "No error message"),
                    "keyName": text(Some(item), "key_name", "Unknown key"),
                    "keyDeleted": item.get("key_deleted").and_then(Value::as_bool).unwrap_or(false),
                })
            })
            .collect(),
    )
}

fn page_info(source: Option<&Map<String, Value>>) -> Value {
    json!({
        "page": number(source, "page"),
        "pageSize": number(source, "page_size"),
        "total": number(source, "total"),
        "pages": number(source, "pages"),
    })
}

fn quota_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "label": text(Some(item), "label", "Quota reset"),
                    "resetAt": nullable_text(Some(item), "reset_at"),
                })
            })
            .collect(),
    )
}

fn banner_row(source: Option<&Map<String, Value>>) -> Value {
    if !source
        .and_then(|item| item.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Value::Null;
    }
    json!({
        "title": text(source, "title", "Cavoti update"),
        "message": text(source, "message", ""),
    })
}

fn announcement_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "title": text(Some(item), "title", "Announcement"),
                    "message": text(Some(item), "message", ""),
                })
            })
            .collect(),
    )
}

fn nullable_number(item: Option<&Map<String, Value>>, name: &str) -> Value {
    item.and_then(|value| value.get(name))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| Value::from(value.max(0.0)))
        .unwrap_or(Value::Null)
}

fn status_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                let checked_at = item
                    .get("timeline")
                    .and_then(Value::as_array)
                    .and_then(|timeline| timeline.first())
                    .and_then(object)
                    .map_or(Value::Null, |latest| {
                        nullable_text(Some(latest), "checked_at")
                    });
                json!({
                    "name": text(Some(item), "name", "Unknown channel"),
                    "provider": text(Some(item), "provider", "unknown"),
                    "model": text(Some(item), "primary_model", ""),
                    "status": text(Some(item), "primary_status", "unknown"),
                    "latencyMs": nullable_number(Some(item), "primary_latency_ms"),
                    "availability7d": nullable_number(Some(item), "availability_7d"),
                    "checkedAt": checked_at,
                })
            })
            .collect(),
    )
}

fn option_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                json!({
                    "id": number(Some(item), "id"),
                    "name": text(Some(item), "name", "Unknown"),
                })
            })
            .collect(),
    )
}

pub fn normalize_core_snapshot(raw: &AuthRawResults) -> Option<Value> {
    let me = data_for(raw, "me")?;
    let subscriptions = data_for(raw, "subscriptions")?;
    let stats = data_for(raw, "stats")?;
    let models = data_for(raw, "models")?;
    let snapshot = data_for(raw, "snapshot")?;
    let keys_data = data_for(raw, "keys").unwrap_or_else(|| json!({}));
    let quota_data = data_for(raw, "quota").unwrap_or_else(|| json!({}));
    let banner_data = data_for(raw, "banner");
    let announcements_data = data_for(raw, "announcements").unwrap_or_else(|| json!([]));
    let status_data = data_for(raw, "status").unwrap_or_else(|| json!({}));
    let groups_available = data_for(raw, "groups").unwrap_or_else(|| json!([]));
    let usage_data = data_for(raw, "usage").unwrap_or_else(|| json!({}));
    let errors_data = data_for(raw, "errors").unwrap_or_else(|| json!({}));
    let geo_data = data_for(raw, "geo").unwrap_or_else(|| json!({}));
    let me = object(&me)?;
    let subscriptions = subscriptions.as_array()?;
    let stats = object(&stats)?;
    let models = object(&models)?;
    let snapshot = object(&snapshot)?;
    let keys_data = object(&keys_data);
    let quota_data = object(&quota_data);
    let banner_data = banner_data.as_ref().and_then(object);
    let announcements_data = announcements_data.as_array();
    let status_data = object(&status_data);
    let groups_available = groups_available.as_array();
    let usage_data = object(&usage_data);
    let errors_data = object(&errors_data);
    let geo_data = object(&geo_data);
    let key_items = keys_data.map_or(&[][..], |value| array_at(value, "items"));
    let active_keys = key_items
        .iter()
        .filter_map(object)
        .filter(|item| text(Some(item), "status", "active").eq_ignore_ascii_case("active"))
        .count();

    Some(json!({
        "version": 1,
        "capturedAt": captured_at(),
        "source": "live-webview2",
        "account": {
            "displayName": text(Some(me), "username", "Connected account"),
            "status": text(Some(me), "status", "unknown"),
        },
        "subscriptions": subscription_rows(subscriptions),
        "stats": {
            "requests": number(Some(stats), "total_requests"),
            "inputTokens": number(Some(stats), "total_input_tokens"),
            "outputTokens": number(Some(stats), "total_output_tokens"),
            "cacheTokens": number(Some(stats), "total_cache_tokens"),
            "totalTokens": number(Some(stats), "total_tokens"),
            "cacheCreationTokens": number(Some(stats), "total_cache_creation_tokens"),
            "cacheReadTokens": number(Some(stats), "total_cache_read_tokens"),
            "actualCost": number(Some(stats), "total_actual_cost"),
            "standardCost": number(Some(stats), "total_cost"),
            "averageDurationMs": number(Some(stats), "average_duration_ms"),
            "endpoints": rows(array_at(stats, "endpoints"), "endpoint"),
        },
            "models": rows(array_at(models, "models"), "model"),
            "dailyTrend": trend_rows(array_at(snapshot, "trend")),
            "groups": rows(array_at(snapshot, "groups"), "group_name"),
            "usageLogs": usage_log_rows(
                usage_data.map_or(&[][..], |value| array_at(value, "items")),
                geo_data,
            ),
            "usagePageInfo": page_info(usage_data),
            "errors": error_rows(errors_data.map_or(&[][..], |value| array_at(value, "items"))),
            "errorPageInfo": page_info(errors_data),
            "keys": { "total": key_items.len(), "active": active_keys, "expiringSoon": 0 },
            "quotaResetCards": quota_rows(quota_data.map_or(&[][..], |value| array_at(value, "cards"))),
            "banner": banner_row(banner_data),
            "announcements": announcement_rows(announcements_data.map_or(&[][..], Vec::as_slice)),
            "channelMonitors": status_rows(status_data.map_or(&[][..], |value| array_at(value, "items"))),
            "apiKeys": option_rows(key_items),
            "groupOptions": option_rows(groups_available.map_or(&[][..], Vec::as_slice)),
    }))
}
