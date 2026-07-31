use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HostRoute {
    Overview,
    Usage,
    Plans,
    Status,
    Settings,
}

impl HostRoute {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::Usage => "usage",
            Self::Plans => "plans",
            Self::Status => "status",
            Self::Settings => "settings",
        }
    }
}

pub(crate) fn parse_route(raw: &str) -> Option<HostRoute> {
    let url = Url::parse(raw).ok()?;
    if !url.scheme().eq_ignore_ascii_case("cavoti")
        || url.host_str() != Some("open")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return None;
    }

    match url.path() {
        "/overview" => Some(HostRoute::Overview),
        "/usage" => Some(HostRoute::Usage),
        "/plans" => Some(HostRoute::Plans),
        "/status" => Some(HostRoute::Status),
        "/settings" => Some(HostRoute::Settings),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_route, HostRoute};

    #[test]
    fn parses_only_the_allowlisted_cavoti_routes() {
        for (path, route) in [
            ("overview", HostRoute::Overview),
            ("usage", HostRoute::Usage),
            ("plans", HostRoute::Plans),
            ("status", HostRoute::Status),
            ("settings", HostRoute::Settings),
        ] {
            assert_eq!(parse_route(&format!("cavoti://open/{path}")), Some(route));
        }
    }

    #[test]
    fn rejects_untrusted_url_parts_and_payloads() {
        for raw in [
            "https://open/overview",
            "cavoti://evil/overview",
            "cavoti://open/unknown",
            "cavoti://open/overview/",
            "cavoti://open/overview?code=secret",
            "cavoti://open/overview?token=secret",
            "cavoti://open/overview?state=opaque",
            "cavoti://open/overview?code_verifier=secret",
            "cavoti://open/overview#state",
            "cavoti://user:pass@open/overview",
            "cavoti://open:443/overview",
            "cavoti://open",
            "not a url",
        ] {
            assert_eq!(parse_route(raw), None, "unexpectedly accepted {raw}");
        }
    }
}
