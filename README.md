# Cavoti Bar

A Windows overlay for the Cavoti usage surface. The native shell is WPF; the panel is a local React/Tailwind renderer built with Vite and loaded through WebView2.

## Current scope

- Compact overlay window positioned in the top-right work area.
- Overview, usage, plans, status, and settings screens.
- Light glass compact popover with a Phosphor icon rail and shadcn-style controls.
- Overview, usage, plans, status, and settings views render from a typed `SnapshotEnvelope`.
- The default UI does not render sample metrics. It waits for a live snapshot or shows an explicit auth/offline/error state.
- The supplied Cavoti favicon and transparent butterfly logo are packaged locally for the UI and executable icon.

## Session boundary

The supplied HAR maps the API surface but does not include reusable request cookies or `Authorization` headers. The app never copies credentials or replays the HAR. A dedicated WebView2 profile under `%LocalAppData%\CavotiBar\WebView2` owns the Cavoti session. The authenticated window performs same-origin GET requests and forwards only normalized aggregate JSON to the local renderer.

`data/demo.json` remains a sanitized contract fixture for tests only. It is not packaged or used as the default renderer source.

The host bridge accepts only source-validated `minimize`, `close`, `drag`, `refresh`, `clear`, `bootstrap`, `connect`, and fixed-target `open-site` messages, plus `setting` messages whose value is an object with the boolean `topmost` name. Refresh rereads the authenticated Cavoti profile; clear deletes `settings.json`, restores topmost, and posts a versioned setting state. Local WebView2 navigation is origin-gated, approved Google/X OAuth popups are routed back through the same auth surface, collection runs only after returning to Cavoti, malformed messages are ignored, and the topmost plus geometry preferences are persisted under the current user's local application data.

Live data remains read-only. Plan purchases, API-key changes, profile changes, and payment actions hand off to Cavoti in the authenticated browser window.

## Build

The Scoop-managed .NET SDK and Bun are required. Build the web renderer and native host from this folder with:

```powershell
Push-Location .\web
bun install
Pop-Location
$dotnet = Join-Path (scoop prefix dotnet-sdk) 'dotnet.exe'
& $dotnet build .\CavotiBar.csproj
```

The native build invokes the Vite build and copies the fresh hashed assets into `ui` and the output directory. The renderer is served through the WebView2 virtual origin `https://app.cavoti.local` so Vite's module assets execute reliably; it is not loaded from `file:`. The project targets .NET 9 and requires the WebView2 Runtime for execution.

Web checks can be run directly with:

```powershell
Push-Location .\web
bun install
bun run verify
Pop-Location
```

The test suite covers snapshot normalization, bridge protocol validation, auth-required states, and core navigation. Native WebView2 integration still requires a real Windows session and a signed-in Cavoti profile.

## HAR inspection

The original HAR is intentionally kept outside the project. To inspect endpoint coverage without printing credentials:

```powershell
.\scripts\inspect-har.ps1 -Path 'C:\Users\developer\Downloads\cavoti.com.har'
```

The HAR-derived fixture lives at `data/demo.json` and is intentionally not the runtime source.
