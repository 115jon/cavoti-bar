use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct QuotaAlert {
    pub(crate) plan: String,
    pub(crate) window: String,
    pub(crate) threshold: u8,
}

#[derive(Clone, Debug)]
struct WindowState {
    reset_at: String,
    percent: f64,
}

#[derive(Debug, Default)]
pub(crate) struct QuotaNotificationCoordinator {
    windows: HashMap<String, WindowState>,
    notified: HashSet<String>,
    initialized: bool,
}

impl QuotaNotificationCoordinator {
    pub(crate) fn evaluate(&mut self, snapshot: &Value, thresholds: &[u8]) -> Vec<QuotaAlert> {
        let mut normalized_thresholds = thresholds
            .iter()
            .copied()
            .filter(|threshold| (1..=100).contains(threshold))
            .collect::<Vec<_>>();
        normalized_thresholds.sort_unstable();
        normalized_thresholds.dedup();

        let mut alerts = Vec::new();
        let Some(subscriptions) = snapshot.get("subscriptions").and_then(Value::as_array) else {
            self.initialized = true;
            return alerts;
        };

        for plan in subscriptions.iter().filter_map(Value::as_object) {
            let Some(plan_name) = plan.get("name").and_then(Value::as_str) else {
                continue;
            };
            let Some(usage) = plan.get("usage").and_then(Value::as_object) else {
                continue;
            };
            for (window_name, field_name) in [
                ("5 hour", "fiveHour"),
                ("weekly", "weekly"),
                ("monthly", "monthly"),
            ] {
                let Some(window) = usage.get(field_name).and_then(Value::as_object) else {
                    continue;
                };
                let Some((percent, reset_at)) = try_usage(window) else {
                    continue;
                };
                let state_key = format!("{plan_name}\u{001f}{window_name}");
                let previous = self.windows.insert(
                    state_key.clone(),
                    WindowState {
                        reset_at: reset_at.clone(),
                        percent,
                    },
                );
                if !self.initialized {
                    continue;
                }
                let Some(previous) = previous.as_ref() else {
                    continue;
                };
                let reset_changed = previous.reset_at != reset_at;
                for threshold in normalized_thresholds.iter().copied() {
                    if percent < f64::from(threshold)
                        || (!reset_changed && previous.percent >= f64::from(threshold))
                    {
                        continue;
                    }
                    let alert_key = format!(
                        "{plan_name}\u{001f}{window_name}\u{001f}{reset_at}\u{001f}{threshold}"
                    );
                    if self.notified.insert(alert_key) {
                        alerts.push(QuotaAlert {
                            plan: plan_name.to_owned(),
                            window: window_name.to_owned(),
                            threshold,
                        });
                    }
                }
            }
        }
        self.initialized = true;
        alerts
    }
}

fn try_usage(window: &serde_json::Map<String, Value>) -> Option<(f64, String)> {
    if window
        .get("configured")
        .and_then(Value::as_bool)
        .is_some_and(|configured| !configured)
    {
        return None;
    }
    let reset_at = window.get("resetAt").and_then(Value::as_str)?.to_owned();
    let used = window.get("used").and_then(Value::as_f64)?;
    let limit = window.get("limit").and_then(Value::as_f64)?;
    if !used.is_finite() || !limit.is_finite() || limit <= 0.0 {
        return None;
    }
    Some(((used / limit * 100.0).clamp(0.0, 100.0), reset_at))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot(used: f64, reset_at: &str) -> Value {
        json!({
            "subscriptions": [{
                "name": "Usage plan",
                "usage": {
                    "fiveHour": {
                        "used": used,
                        "limit": 100.0,
                        "configured": true,
                        "resetAt": reset_at
                    }
                }
            }]
        })
    }

    #[test]
    fn first_snapshot_only_initializes_quota_state() {
        let mut coordinator = QuotaNotificationCoordinator::default();
        assert!(coordinator
            .evaluate(&snapshot(85.0, "reset-a"), &[80])
            .is_empty());
    }

    #[test]
    fn threshold_crossings_are_emitted_once_until_the_window_resets() {
        let mut coordinator = QuotaNotificationCoordinator::default();
        let thresholds = [80, 95];
        coordinator.evaluate(&snapshot(70.0, "reset-a"), &thresholds);
        assert_eq!(
            coordinator
                .evaluate(&snapshot(96.0, "reset-a"), &thresholds)
                .len(),
            2
        );
        assert!(coordinator
            .evaluate(&snapshot(99.0, "reset-a"), &thresholds)
            .is_empty());
    }

    #[test]
    fn reset_rearms_crossed_thresholds_but_duplicate_refreshes_do_not() {
        let mut coordinator = QuotaNotificationCoordinator::default();
        coordinator.evaluate(&snapshot(99.0, "reset-a"), &[80]);
        assert_eq!(
            coordinator
                .evaluate(&snapshot(85.0, "reset-b"), &[80])
                .as_slice(),
            &[QuotaAlert {
                plan: "Usage plan".to_owned(),
                window: "5 hour".to_owned(),
                threshold: 80,
            }]
        );
        assert!(coordinator
            .evaluate(&snapshot(85.0, "reset-b"), &[80])
            .is_empty());
    }

    #[test]
    fn newly_seen_plan_does_not_alert_until_a_later_crossing() {
        let mut coordinator = QuotaNotificationCoordinator::default();
        coordinator.evaluate(&snapshot(0.0, "reset-a"), &[80]);
        let added_plan = json!({
            "subscriptions": [
                snapshot(0.0, "reset-a")["subscriptions"][0].clone(),
                {
                    "name": "New plan",
                    "usage": {
                        "fiveHour": {
                            "used": 90.0,
                            "limit": 100.0,
                            "configured": true,
                            "resetAt": "reset-new"
                        }
                    }
                }
            ]
        });
        assert!(coordinator.evaluate(&added_plan, &[80]).is_empty());
    }

    #[test]
    fn malformed_or_unconfigured_windows_do_not_alert() {
        let mut coordinator = QuotaNotificationCoordinator::default();
        coordinator.evaluate(&snapshot(0.0, "reset-a"), &[80]);
        let malformed = json!({
            "subscriptions": [{
                "name": "Usage plan",
                "usage": {
                    "fiveHour": { "used": 100.0, "limit": 100.0, "configured": false }
                }
            }]
        });
        assert!(coordinator.evaluate(&malformed, &[80]).is_empty());
    }
}
