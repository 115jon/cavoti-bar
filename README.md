# Cavoti Bar

A Windows overlay prototype for the Cavoti usage surface. The native shell is WPF; the panel itself is local HTML/CSS/JS loaded through WebView2 so the visual layer can evolve quickly without giving up a native topmost window.

## Current scope

- Compact overlay window positioned in the top-right work area.
- Overview, usage, plans, status, and settings screens.
- Working date-range controls, usage tags, refresh feedback, window settings, and browser hand-off.
- Sanitized HAR-derived fixture for the current account shape.
- Data normalization tests for the usage contract.

## Session boundary

The supplied HAR maps the API surface but does not include reusable request cookies or `Authorization` headers. The app therefore does not copy credentials or attempt to replay the capture. The current UI explicitly labels fixture mode and links back to the Cavoti browser session for refresh.

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

The sanitized fixture lives at `data/demo.json`. The UI copy used by the local shell is `ui/demo-data.js`.
