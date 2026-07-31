use serde_json::Value;
use std::net::IpAddr;
use url::Url;

pub(crate) const CAVOTI_USAGE_URL: &str = "https://cavoti.com/usage";
pub(crate) const CAVOTI_STATUS_URL: &str = "https://cavoti.com/monitor";
const IP_LOOKUP_URL: &str = "https://www.iplocation.net/ip-lookup";

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum ExternalCommand {
    Restart,
    OpenUrl(String),
}

pub(crate) fn resolve_external_command(
    action: &str,
    value: Option<&Value>,
) -> Result<Option<ExternalCommand>, String> {
    match action {
        "restart" => Ok(Some(ExternalCommand::Restart)),
        "open-site" => Ok(Some(ExternalCommand::OpenUrl(CAVOTI_USAGE_URL.to_owned()))),
        "open-status" => Ok(Some(ExternalCommand::OpenUrl(CAVOTI_STATUS_URL.to_owned()))),
        "open-ip" => {
            let ip = value
                .and_then(Value::as_object)
                .and_then(|value| value.get("ip"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "IP address is missing".to_owned())?;
            let ip = ip
                .parse::<IpAddr>()
                .map_err(|_| "IP address is invalid".to_owned())?;
            let mut url = Url::parse(IP_LOOKUP_URL).expect("fixed IP lookup URL is valid");
            url.query_pairs_mut().append_pair("ip", &ip.to_string());
            Ok(Some(ExternalCommand::OpenUrl(url.to_string())))
        }
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fixed_external_actions_resolve_to_only_cavoti_destinations() {
        assert_eq!(
            resolve_external_command("open-site", None).unwrap(),
            Some(ExternalCommand::OpenUrl(CAVOTI_USAGE_URL.to_owned()))
        );
        assert_eq!(
            resolve_external_command("open-status", None).unwrap(),
            Some(ExternalCommand::OpenUrl(CAVOTI_STATUS_URL.to_owned()))
        );
        assert_eq!(
            resolve_external_command("restart", None).unwrap(),
            Some(ExternalCommand::Restart)
        );
        assert_eq!(resolve_external_command("setting", None).unwrap(), None);
    }

    #[test]
    fn ip_destination_requires_an_ip_address_and_escapes_it_as_a_query_value() {
        let command =
            resolve_external_command("open-ip", Some(&json!({ "ip": "2001:db8::1" }))).unwrap();
        assert_eq!(
            command,
            Some(ExternalCommand::OpenUrl(
                "https://www.iplocation.net/ip-lookup?ip=2001%3Adb8%3A%3A1".to_owned()
            ))
        );
    }

    #[test]
    fn invalid_ip_destinations_are_rejected() {
        for value in [
            json!({ "ip": "" }),
            json!({ "ip": "not-an-ip" }),
            json!({ "ip": "https://evil.example" }),
            json!({ "ip": 127 }),
            json!({}),
            json!(null),
        ] {
            assert!(resolve_external_command("open-ip", Some(&value)).is_err());
        }
    }
}
