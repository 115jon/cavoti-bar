# Cavoti Bar

[![Cavoti CI](https://github.com/115jon/cavoti-bar/actions/workflows/ci.yml/badge.svg)](https://github.com/115jon/cavoti-bar/actions/workflows/ci.yml)
[![Windows Release](https://github.com/115jon/cavoti-bar/actions/workflows/windows-release.yml/badge.svg)](https://github.com/115jon/cavoti-bar/actions/workflows/windows-release.yml)
[![Android Release](https://github.com/115jon/cavoti-bar/actions/workflows/android-release.yml/badge.svg)](https://github.com/115jon/cavoti-bar/actions/workflows/android-release.yml)

Cavoti Bar is a native desktop and Android client for monitoring Cavoti usage,
plans, model pricing, API keys, and service health. A shared React renderer is
hosted by Tauri 2, while Rust and the Android WebView adapter own authenticated
collection and platform integration.

## Features

- Live usage, cost, token, request, and error summaries
- Scoped refreshes for the active view and filters
- Usage filtering by date, key, model, group, request type, and billing mode
- Plan quota and reset monitoring
- Model pricing and channel health views
- Persistent Cavoti authentication in an app-owned WebView profile
- Windows tray, startup, deep-link, notification, and updater integration
- Native Android pull-to-refresh, lifecycle handling, and notifications

## Downloads

- [Latest GitHub release](https://github.com/115jon/cavoti-bar/releases/latest)
- [Latest Windows installer](https://github.com/115jon/cavoti-bar/releases/latest/download/Cavoti%20Bar%20Setup.exe)
- [Latest Android APK](https://github.com/115jon/cavoti-bar/releases/latest/download/Cavoti%20Bar.apk)

Product screenshots will be added to `docs/screenshots/` for the desktop and
mobile experiences once the release captures are provided.

## Architecture

```text
src/                         React renderer and host protocol
public/                      Renderer assets and application icons
src-tauri/                   Rust host, auth adapter, snapshots, platform APIs
src-tauri/gen/               Tracked Android project and native WebView adapter
installer/                   Windows bootstrapper and versioned install layout
scripts/                     Development, build, signing, and release entrypoints
tests/                       Repository-level architecture and packaging contracts
```

Authenticated Cavoti requests execute inside the persistent Cavoti WebView
profile. Only bounded, normalized snapshot data crosses into the renderer.
Cookies, bearer tokens, and raw authenticated page content remain inside the
native session boundary.

The supported deep links are navigation-only:

- `cavoti://open/overview`
- `cavoti://open/usage`
- `cavoti://open/plans`
- `cavoti://open/status`
- `cavoti://open/settings`

## Requirements

- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/) stable toolchain
- Tauri 2 platform prerequisites
- Windows: .NET 10 SDK and .NET Framework 4.8 build tools for the custom installer
- Android: JDK 17 and Android SDK/NDK 29

## Development

Install dependencies:

```powershell
bun install --frozen-lockfile
```

Run the desktop development shell:

```powershell
bun run dev
```

Run the primary validation suite:

```powershell
node --test .\tests\*.test.mjs

bun run typecheck
bun run test
bun run format:check
bun run lint

cargo fmt --manifest-path .\src-tauri\Cargo.toml --check
cargo test --manifest-path .\src-tauri\Cargo.toml
```

## Release builds

Build the branded standalone Windows executable:

```powershell
.\scripts\build-tauri-release.ps1
```

Output: `src-tauri\target\release\Cavoti Bar.exe`

Build the signed Windows bootstrapper and updater signature:

```powershell
.\scripts\build-tauri-installer.ps1
```

Outputs:

- `installer\bin\Release\net48\Cavoti Bar Setup.exe`
- `installer\bin\Release\net48\Cavoti Bar Setup.exe.sig`

Build a signed universal Android APK:

```powershell
.\scripts\build-tauri-android-release.ps1
```

Output: `src-tauri\gen\android\app\build\outputs\apk\...\release\Cavoti Bar.apk`

Release tags must use `vMAJOR.MINOR.PATCH` and match the version in
`src-tauri/tauri.conf.json`. The Windows workflow creates the GitHub
Release and updater metadata. The Android workflow attaches the signed APK to
that release.

## GitHub configuration

The release workflows require these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `CAVOTI_ANDROID_KEYSTORE_BASE64`
- `CAVOTI_ANDROID_KEY_ALIAS`
- `CAVOTI_ANDROID_KEYSTORE_PASSWORD`
- `CAVOTI_ANDROID_KEY_PASSWORD`

They also use the public Actions variable `CAVOTI_UPDATE_ENDPOINT`.

After creating `115jon/cavoti-bar`, provision the configured local credentials
without printing their values:

```powershell
.\scripts\configure-github-secrets.ps1 -Repository 115jon/cavoti-bar
```

Signing keys, keystores, passwords, authenticated snapshots, and local session
data must never be committed.

## License

No license has been declared yet. Add one before accepting external
contributions or redistributing the source.
