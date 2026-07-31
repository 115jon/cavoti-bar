# Cavoti Bar Agent Guide

This file defines repository-local expectations for contributors and coding
agents. Prefer the smallest correct change and preserve the established module
boundaries.

## Repository map

- `src/`: React 19 renderer, TypeScript domain model, host protocol, and views.
- `public/`: Renderer assets and application icons.
- `src-tauri/`: Rust host, authentication adapter, snapshot
  normalization, settings, updater, notifications, and platform commands.
- `src-tauri/gen/android/`: tracked Android Gradle project. The
  custom `MainActivity.kt` WebView adapter and its tests are maintained source,
  even though they live below Tauri's generated project directory.
- `installer/`: .NET Framework 4.8 WPF bootstrapper with embedded payload,
  versioned installation state, shortcuts, deep links, and uninstall support.
- `scripts/`: canonical development, packaging, signing, and release commands.
- `tests/`: Node contract tests for cross-module and packaging invariants.
- `.github/`: validation, release automation, and dependency updates.

## Product identities

Keep these identities distinct:

- Product and shipped application: `Cavoti Bar`
- Shipped Windows executable: `Cavoti Bar.exe`
- Shipped Windows installer: `Cavoti Bar Setup.exe`
- Shipped Android artifact: `Cavoti Bar.apk`
- Rust package and compiler target: `cavoti_bar`
- Rust library: `cavoti_bar_lib`
- Android application ID and JNI namespace: `com.cavoti.bar`
- Persisted Windows install root and uninstall key: `CavotiBar`

Do not globally replace `cavoti_bar` or `CavotiBar`. Those names are internal or
persisted compatibility identifiers. Apply branding at packaging and display
boundaries.

## Architecture invariants

- The native session WebView owns Cavoti cookies and authenticated requests.
- Never send cookies, bearer tokens, raw authenticated HTML, or unbounded API
  payloads into the React renderer.
- Validate collection IDs, phases, endpoints, session states, and payload sizes
  at both Android and Rust boundaries.
- Scoped probes should fetch only the active surface. Usage refreshes must carry
  the active filters and pagination.
- A refresh must always reach a terminal snapshot, auth state, offline state, or
  error state so native loading indicators can stop.
- Deep links are navigation-only and must not carry authentication state.
- Preserve settings, WebView profiles, install state, startup registration, and
  updater compatibility across upgrades.

## Frontend conventions

- Use TypeScript without `any` unless no sound alternative exists.
- Follow existing React patterns and shared components before adding
  abstractions.
- Use `useCompactTiles` for compact/mobile behavior rather than duplicating
  viewport rules.
- Mobile data views use native pull-to-refresh. Keep the explicit Usage refresh
  command, but do not add redundant standalone refresh icons elsewhere.
- Bundle assets required by the app shell. Remote image URLs must be allowed by
  the Tauri CSP and have a graceful fallback.
- Keep controls accessible with semantic roles and labels.

## Native and Android conventions

- Keep Rust request parsing and Android `SessionResultGate` semantics aligned.
- Update Android allowlists and payload caps when Rust probe endpoints change.
- Add or update `SessionResultGateTest.kt` for Android bridge behavior.
- JNI symbol names must continue to match `com.cavoti.bar.MainActivity`.
- Do not regenerate or overwrite tracked Android customizations without
  reviewing the resulting diff.

## Installer conventions

- Build the Rust target first, then copy it to the branded shipped filename.
- New shortcuts and deep links launch `Cavoti Bar.exe` through `Update.exe`.
- Process cleanup must recognize both `Cavoti Bar` and legacy `cavoti_bar`
  processes during upgrades.
- Keep `%LocalAppData%\CavotiBar`, `current.json`, version directories, and the
  existing uninstall registry key compatible.
- Validate the embedded payload contains the branded executable before install.

## Commands

Use Bun for JavaScript dependencies and scripts.

```powershell
node --test .\tests\*.test.mjs

bun run typecheck
bun run test
bun run format:check
bun run lint
bun run build:tauri

cargo fmt --manifest-path .\src-tauri\Cargo.toml --check
cargo test --manifest-path .\src-tauri\Cargo.toml

.\scripts\build-tauri-release.ps1
.\scripts\build-tauri-installer.ps1
.\scripts\build-tauri-android-release.ps1
```

Do not run release signing or publish commands unless explicitly requested.

## Testing expectations

- Write a failing regression test before fixing behavioral bugs.
- Frontend behavior belongs in Vitest and Testing Library tests.
- Rust parsing, adapters, and normalization belong in Rust unit tests.
- Android gate and WebView protocol behavior belongs in Kotlin unit tests.
- Cross-layer naming, security, packaging, and workflow rules belong in
  `tests/tauri-contract.test.mjs`.
- Scale validation to the blast radius and report existing unrelated warnings
  separately.

## Secrets and releases

- Never commit signing keys, keystores, passwords, tokens, session data, or
  generated signing properties.
- GitHub Actions receives signing material only through repository secrets.
- The Android keystore is transferred as base64 and restored under the runner's
  temporary directory.
- Conventional commits merged to `main` are handled by Release Please. Its
  release PR owns the version bump, forced `vMAJOR.MINOR.PATCH` tag, and draft
  GitHub release.
- Release Please and both packaging workflows must validate the semantic tag,
  immutable remote tag target, `main` ancestry, successful CI, all shipped
  version files, and draft release state before accessing signing secrets.
- Packaging jobs run in the `release` environment with checkout credentials
  disabled and use independent per-platform concurrency groups so Windows and
  Android can build concurrently.
- Android release version codes follow the Tauri semver formula plus one to
  remain above the legacy `0.1.0` build's explicit code `1001`.
- Release Please dispatches `Cavoti Windows Release` and `Cavoti Android
  Release` concurrently with the same tag. Windows uploads the three exact
  Windows assets. Android waits for those assets, uploads the APK, and publishes
  only after the exact four-asset set is present in the final atomic check.
- Reruns are recovery-safe: existing draft tags are accepted, matching assets
  are replaced with `--clobber`, and no workflow creates a second release.
- `TAURI_SIGNING_PRIVATE_KEY` is mandatory. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  is optional and is configured only when nonblank.
- Manual dispatch is limited to an existing semantic tag and draft release;
  workflows must never publish a partially populated release.

## Change discipline

- Preserve unrelated worktree changes.
- Do not edit generated build output or dependency directories.
- Keep comments concise and explain only non-obvious constraints.
- Update documentation and contract tests when changing architecture,
  packaging, secret names, or public artifact names.
