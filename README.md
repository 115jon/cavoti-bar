# Cavoti Bar

A Windows overlay prototype for the Cavoti usage surface. The native shell is WPF; the panel itself is local HTML/CSS/JS loaded through WebView2 so the visual layer can evolve quickly without giving up a native topmost window.

## Current scope

- Compact overlay window positioned in the top-right work area.
- Overview, usage, plans, status, and settings screens.
- Fixture refresh rereads the canonical snapshot through the native host; it never makes a live network request.
- Future live-bridge range and tag controls remain visible, but only the captured 7-day, all-traffic view is enabled in fixture mode.
- The local-only refresh interval schedules those fixture rereads; topmost is native and persistent, while Clear preferences resets native settings and browser local storage.
- Sanitized HAR-derived fixture for the current account shape.
- Data normalization tests for the usage contract.

## Session boundary

The supplied HAR maps the API surface but does not include reusable request cookies or `Authorization` headers. The app therefore does not copy credentials or attempt to replay the capture. The current UI explicitly labels fixture mode, does not claim live health, and links back to the Cavoti browser session only for sign-in or site actions.

`data/demo.json` is the canonical sanitized snapshot. The WPF host copies it to the native output, validates its JSON shape, and posts it to the local WebView2 document after navigation. `ui/demo-data.js` is intentionally data-free and only keeps direct file inspection from throwing before a host snapshot arrives.

The host bridge accepts only source-validated `minimize`, `close`, `drag`, `refresh`, `clear`, and fixed-target `open-site` messages, plus `setting` messages whose value is an object with the boolean `topmost` name. Refresh rereads the local fixture; clear deletes `settings.json`, restores topmost, and posts the updated setting state. Local WebView2 navigation is origin-gated, new-window requests are handled and suppressed, malformed messages are ignored, and the topmost preference is persisted under the current user's local application data.

The next live bridge should use an interactive WebView2 login or an explicit user-provided session flow, then store session material in Windows Credential Manager rather than a JSON file.

## Build

The Scoop-managed .NET SDK is available in this environment. Build from this folder with:

```powershell
$dotnet = Join-Path (scoop prefix dotnet-sdk) 'dotnet.exe'
& $dotnet build .\CavotiBar.csproj
```

The project targets .NET 9 and still requires the WebView2 Runtime for execution. Native host tests are not present; malformed fixture behavior is covered by the pure data normalization tests.

## HAR inspection

The original HAR is intentionally kept outside the project. To inspect endpoint coverage without printing credentials:

```powershell
.\scripts\inspect-har.ps1 -Path 'C:\Users\developer\Downloads\cavoti.com.har'
```

The sanitized fixture lives at `data/demo.json`; there is no second UI fixture copy.
