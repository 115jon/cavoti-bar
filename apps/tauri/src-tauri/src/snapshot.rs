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

fn text_any(item: Option<&Map<String, Value>>, names: &[&str], fallback: &str) -> String {
    names
        .iter()
        .find_map(|name| {
            item.and_then(|value| value.get(*name))
                .and_then(Value::as_str)
        })
        .unwrap_or(fallback)
        .to_owned()
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
                let cache_creation_tokens = item
                    .get("cache_creation_tokens")
                    .and_then(Value::as_f64)
                    .map_or_else(
                        || {
                            number(Some(item), "cache_creation_5m_tokens")
                                + number(Some(item), "cache_creation_1h_tokens")
                        },
                        |value| value.max(0.0),
                    );
                let location = geo
                    .and_then(|items| items.get(&ip))
                    .and_then(object)
                    .map_or(Value::Null, |value| location_row(Some(value)));
                let total_tokens = number(Some(item), "input_tokens")
                    + number(Some(item), "output_tokens")
                    + cache_creation_tokens
                    + number(Some(item), "cache_read_tokens");
                json!({
                    "id": number(Some(item), "id"),
                    "requestId": text(Some(item), "request_id", ""),
                    "apiKeyName": text(api_key, "name", "Unknown key"),
                    "model": text(Some(item), "model", "Unknown model"),
                    "reasoningEffort": text(Some(item), "reasoning_effort", "default"),
                     "endpoint": text(Some(item), "inbound_endpoint", "Unknown endpoint"),
                     "requestType": text_any(Some(item), &["request_type", "requestType"], ""),
                    "groupName": text(group, "name", "Unknown group"),
                    "inputTokens": number(Some(item), "input_tokens"),
                    "outputTokens": number(Some(item), "output_tokens"),
                    "cacheCreationTokens": cache_creation_tokens,
                    "cacheReadTokens": number(Some(item), "cache_read_tokens"),
                    "totalTokens": total_tokens,
                    "actualCost": number(Some(item), "actual_cost"),
                    "standardCost": number(Some(item), "total_cost"),
                    "inputCost": number(Some(item), "input_cost"),
                    "outputCost": number(Some(item), "output_cost"),
                    "cacheCreationCost": number(Some(item), "cache_creation_cost"),
                    "cacheReadCost": number(Some(item), "cache_read_cost"),
                    "rateMultiplier": nullable_number(Some(item), "rate_multiplier"),
                    "subscriptionCost": number(Some(item), "subscription_cost"),
                    "balanceCost": number(Some(item), "balance_cost"),
                    "unchargedCost": number(Some(item), "uncharged_cost"),
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
                     "errorBody": text_any(Some(item), &["error_body", "errorBody", "response_body"], ""),
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

fn nullable_number_any(item: Option<&Map<String, Value>>, names: &[&str]) -> Value {
    names
        .iter()
        .find_map(|name| {
            item.and_then(|value| value.get(*name))
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
                .map(|value| Value::from(value.max(0.0)))
        })
        .unwrap_or(Value::Null)
}

fn status_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                let timeline = item
                    .get("timeline")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(object)
                            .map(|entry| {
                                json!({
                                    "status": text(Some(entry), "status", "unknown"),
                                    "latencyMs": nullable_number_any(Some(entry), &["latency_ms", "latencyMs"]),
                                    "pingLatencyMs": nullable_number_any(Some(entry), &["ping_latency_ms", "pingLatencyMs"]),
                                    "checkedAt": nullable_text(Some(entry), "checked_at"),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let extra_models = item
                    .get("models")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(object)
                            .map(|entry| {
                                json!({
                                    "name": text_any(Some(entry), &["model", "name"], "Unknown model"),
                                    "status": text(Some(entry), "status", "unknown"),
                                    "latencyMs": nullable_number_any(Some(entry), &["latency_ms", "latencyMs"]),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let checked_at = item
                    .get("timeline")
                    .and_then(Value::as_array)
                    .and_then(|timeline| timeline.first())
                    .and_then(object)
                    .map_or(Value::Null, |latest| {
                        nullable_text(Some(latest), "checked_at")
                    });
                json!({
                    "id": number(Some(item), "id"),
                    "name": text(Some(item), "name", "Unknown channel"),
                    "provider": text(Some(item), "provider", "unknown"),
                    "groupName": text_any(Some(item), &["group_name", "groupName"], ""),
                    "model": text(Some(item), "primary_model", ""),
                    "status": text(Some(item), "primary_status", "unknown"),
                    "latencyMs": nullable_number(Some(item), "primary_latency_ms"),
                    "pingLatencyMs": nullable_number_any(Some(item), &["primary_ping_latency_ms", "ping_latency_ms"]),
                    "availability7d": nullable_number(Some(item), "availability_7d"),
                    "checkedAt": checked_at,
                    "extraModels": extra_models,
                    "timeline": timeline,
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

fn api_key_rows(source: &[Value]) -> Value {
    Value::Array(
        source
            .iter()
            .filter_map(object)
            .map(|item| {
                let group = item.get("group").and_then(object);
                json!({
                    "id": number(Some(item), "id"),
                    "name": text(Some(item), "name", "Unknown"),
                    "groupId": number(Some(item), "group_id"),
                    "status": text(Some(item), "status", "unknown"),
                    "groupName": text_any(group, &["name", "group_name"], ""),
                    "quota": nullable_number_any(Some(item), &["quota", "quota_limit", "quota_limit_usd"]),
                    "quotaUsed": nullable_number_any(Some(item), &["quota_used", "quota_usage", "usage_usd"]),
                    "expiresAt": nullable_text(Some(item), "expires_at"),
                    "rateLimit5h": nullable_number_any(Some(item), &["rate_limit_5h", "rate_limit_5h_usd"]),
                    "rateLimit1d": nullable_number_any(Some(item), &["rate_limit_1d", "rate_limit_1d_usd"]),
                    "rateLimit7d": nullable_number_any(Some(item), &["rate_limit_7d", "rate_limit_7d_usd"]),
                    "usage5h": nullable_number_any(Some(item), &["usage_5h", "usage_5h_usd"]),
                    "usage1d": nullable_number_any(Some(item), &["usage_1d", "usage_1d_usd"]),
                    "usage7d": nullable_number_any(Some(item), &["usage_7d", "usage_7d_usd"]),
                    "reset5hAt": reset_at(Some(item), "window_5h_start", 5),
                    "reset1dAt": reset_at(Some(item), "window_1d_start", 24),
                    "reset7dAt": reset_at(Some(item), "window_7d_start", 168),
                    "rateMultiplier": nullable_number_any(group, &["rate_multiplier"]),
                    "rpmLimit": nullable_number_any(group, &["rpm_limit"]),
                })
            })
            .collect(),
    )
}

fn pricing_rows(source: Option<&Value>) -> Value {
    let platforms = source
        .and_then(object)
        .map(|value| array_at(value, "platforms"))
        .unwrap_or(&[]);
    Value::Array(
        platforms
            .iter()
            .filter_map(object)
            .flat_map(|platform| {
                let platform_name = text_any(Some(platform), &["platform", "name"], "unknown");
                array_at(platform, "models")
                    .iter()
                    .filter_map(object)
                    .flat_map(move |model| {
                        let model_name = text_any(Some(model), &["model", "model_name", "name"], "Unknown model");
                        let source_name = text_any(Some(model), &["source", "model_source"], &platform_name);
                        let price_platform = platform_name.clone();
                        let price_source = source_name.clone();
                        let price_model = model_name.clone();
                        array_at(model, "group_prices")
                            .iter()
                            .filter_map(object)
                            .map(move |price| {
                                let pricing = price.get("pricing").and_then(object).unwrap_or(price);
                                let group_name = array_at(platform, "groups")
                                    .iter()
                                    .filter_map(object)
                                    .find(|group| {
                                        group.get("id").and_then(Value::as_i64)
                                            == price.get("group_id").and_then(Value::as_i64)
                                    })
                                    .map(|group| text(Some(group), "name", ""));
                                let rate_multiplier = array_at(platform, "groups")
                                    .iter()
                                    .filter_map(object)
                                    .find(|group| {
                                        group.get("id").and_then(Value::as_i64)
                                            == price.get("group_id").and_then(Value::as_i64)
                                    })
                                    .and_then(|group| group.get("rate_multiplier"))
                                    .cloned()
                                    .unwrap_or(Value::Null);
                                json!({
                                    "name": price_model.clone(),
                                    "platform": price_platform.clone(),
                                    "source": price_source.clone(),
                                    "groupId": number(Some(price), "group_id"),
                                    "groupName": group_name,
                                    "rateMultiplier": rate_multiplier,
                                    "billingMode": text_any(Some(pricing), &["billing_mode", "billingMode"], "token"),
                                    "inputPrice": nullable_number_any(Some(pricing), &["input_price", "inputPrice"]),
                                    "outputPrice": nullable_number_any(Some(pricing), &["output_price", "outputPrice"]),
                                    "cacheWritePrice": nullable_number_any(Some(pricing), &["cache_write_price", "cacheWritePrice"]),
                                    "cacheReadPrice": nullable_number_any(Some(pricing), &["cache_read_price", "cacheReadPrice"]),
                                    "imageOutputPrice": nullable_number_any(Some(pricing), &["image_output_price", "imageOutputPrice"]),
                                    "perRequestPrice": nullable_number_any(Some(pricing), &["per_request_price", "perRequestPrice"]),
                                    "pointPrice": nullable_number_any(Some(pricing), &["point_price", "pointPrice"]),
                                    "intervals": pricing.get("intervals").cloned().unwrap_or_else(|| json!([])),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .collect::<Vec<_>>()
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
    let pricing_data = data_for(raw, "pricing");
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
        "source": "live-cavoti-webview",
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
             "apiKeys": api_key_rows(key_items),
             "groupOptions": option_rows(groups_available.map_or(&[][..], Vec::as_slice)),
             "modelPricing": pricing_rows(pricing_data.as_ref()),
    }))
}
