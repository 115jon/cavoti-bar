use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Debug)]
pub(crate) struct LifecycleState {
    foreground: AtomicBool,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum LifecycleCommand {
    Pause,
    Foreground,
}

pub(crate) fn parse_command(value: Option<&Value>) -> Result<LifecycleCommand, String> {
    match value
        .and_then(Value::as_object)
        .and_then(|value| value.get("state"))
        .and_then(Value::as_str)
    {
        Some("paused") => Ok(LifecycleCommand::Pause),
        Some("foreground") => Ok(LifecycleCommand::Foreground),
        Some(_) => Err("Unsupported lifecycle state".to_string()),
        None => Err("Lifecycle state is missing".to_string()),
    }
}

impl Default for LifecycleState {
    fn default() -> Self {
        Self {
            foreground: AtomicBool::new(true),
        }
    }
}

impl LifecycleState {
    pub(crate) fn pause(&self) -> bool {
        self.foreground.swap(false, Ordering::AcqRel)
    }

    pub(crate) fn resume(&self) -> bool {
        !self.foreground.swap(true, Ordering::AcqRel)
    }

    pub(crate) fn is_foreground(&self) -> bool {
        self.foreground.load(Ordering::Acquire)
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_command, LifecycleCommand};
    use serde_json::json;

    #[test]
    fn parses_only_foreground_lifecycle_commands() {
        assert_eq!(
            parse_command(Some(&json!({ "state": "paused" }))),
            Ok(LifecycleCommand::Pause)
        );
        assert_eq!(
            parse_command(Some(&json!({ "state": "foreground" }))),
            Ok(LifecycleCommand::Foreground)
        );
        assert!(parse_command(Some(&json!({ "state": "hidden" }))).is_err());
        assert!(parse_command(None).is_err());
    }
}
