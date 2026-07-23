# Cavoti Bar

A Windows overlay prototype for the Cavoti usage surface. The native shell is WPF; the panel itself is local HTML/CSS/JS loaded through WebView2 so the visual layer can evolve quickly without giving up a native topmost window.

## Current scope

- Compact overlay window positioned in the top-right work area.
- Overview, usage, plans, status, and settings screens.
- Working date-range controls, usage tags, refresh feedback, compact interval popover, window settings, and browser hand-off.
- Sanitized HAR-derived fixture for the current account shape.
- Data normalization tests for the usage contract.

## Session boundary

The supplied HAR maps the API surface but does not include reusable request cookies or `Authorization` headers. The app therefore does not copy credentials or attempt to replay the capture. The current UI explicitly labels fixture mode, does not claim live health, and links back to the Cavoti browser session for refresh.

`data/demo.json` is the canonical sanitized snapshot. The WPF host copies it to the native output, validates its JSON shape, and posts it to the local WebView2 document after navigation. `ui/demo-data.js` is intentionally data-free and only keeps direct file inspection from throwing before a host snapshot arrives.

The host bridge accepts only `minimize`, `close`, `open-site`, `drag`, and validated `setting` messages. Local WebView2 navigation is origin-gated, malformed messages are ignored, and the topmost preference is persisted under the current user's local application data.

The next live bridge should use an interactive WebView2 login or an explicit user-provided session flow, then store session material in Windows Credential Manager rather than a JSON file.

## Run when the .NET SDK is installed

Install the .NET 9 SDK and WebView2 Runtime, then run from this folder:

```powershell
dotnet run
```

The current environment has the .NET 9 runtime and Windows Desktop runtime but no SDK, so native compilation has not been attempted here.

## HAR inspection

The original HAR is intentionally kept outside the project. To inspect endpoint coverage without printing credentials:

```powershell
.\scripts\inspect-har.ps1 -Path 'C:\Users\developer\Downloads\cavoti.com.har'
```

The sanitized fixture lives at `data/demo.json`; there is no second UI fixture copy.
