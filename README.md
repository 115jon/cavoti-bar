# Cavoti Bar

Cavoti Bar is a Tauri 2 client for Windows, macOS, Linux, and Android. The
shared React renderer provides the overview, usage, plans, status, and settings
surfaces. Native Rust code owns the authenticated Cavoti WebView, snapshot
collection, platform integration, and persistence.

## Runtime Boundary

The app owns a persistent Cavoti WebView profile. Same-origin Cavoti requests
run inside that profile and only bounded, normalized snapshot data crosses into
the local renderer. Cookies, bearer tokens, and authenticated page contents do
not cross the bridge.

The app-owned deep-link routes are navigation-only:

- `cavoti://open/overview`
- `cavoti://open/usage`
- `cavoti://open/plans`
- `cavoti://open/status`
- `cavoti://open/settings`

They do not establish authentication or carry OAuth tokens. Unknown routes and
query or fragment payloads are ignored.

## Development

Requirements: Rust, Bun, Tauri 2 prerequisites, and Android SDK/NDK tooling for
Android builds.

Run the desktop development shell from `apps/tauri`. It stops any existing
Cavoti binary before starting Tauri:

```powershell
Push-Location .\apps\tauri
bun run dev
Pop-Location
```

Build a standalone release executable, or build and launch it:

```powershell
Push-Location .\apps\tauri
bun run build:release
bun run run:release
# Or use: bun run release
Pop-Location
```

The equivalent PowerShell entry points are `scripts\tauri-dev.ps1`,
`scripts\build-tauri-release.ps1`, and `scripts\run-tauri-release.ps1`.
Each release operation stops an existing `cavoti_bar.exe` before replacing or
launching the artifact.

## Validation

```powershell
node --test .\tests\tauri-contract.test.mjs .\tests\ui-contract.test.mjs .\tests\data.test.mjs
Push-Location .\web
bun run typecheck
bun run test
Pop-Location
cargo test --manifest-path .\apps\tauri\src-tauri\Cargo.toml
cargo check --manifest-path .\apps\tauri\src-tauri\Cargo.toml --target armv7-linux-androideabi
```

Real authenticated OAuth, installed-artifact, macOS, Android device, and
notification permission checks require the corresponding platform runtime.
