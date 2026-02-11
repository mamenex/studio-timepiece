# Studioklocka (Studio Timepiece)

Studioklocka is a studio wall clock and running-order display built with React + Tauri. It is designed for live production rooms and control rooms where a large, readable clock, clear status indicators, and a configurable running order are essential.

**Key features**
- Large digital clock with optional seconds ring and studio logo
- Date display and built-in stopwatch
- Running order view for segments and timing
- Fullscreen mode and zoom controls for different screens
- Optional X32 mixer mic-live indicator (desktop app only)
- Local clock or world-time sync (with automatic fallback)

## Tech stack
- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Tauri 2 for the desktop shell

## Quick start (web/dev)

```sh
npm install
npm run dev
```

## Install (macOS)

**Option A: Install a prebuilt app**
1. Download the `.dmg` (or `.app`) from your release or shared build.
2. Open the `.dmg` and drag `Studioklocka` into `Applications`.
3. Launch the app from `Applications`.

**Option B: Build from source**
1. Install Node.js (18+ recommended) and Rust.
2. Install Xcode Command Line Tools: `xcode-select --install`.
3. In this repo:

```sh
npm install
npm run tauri dev
```

To create a signed/unsigned build:

```sh
npm run tauri build
```

To build and copy installers to the repo root in one step:

```sh
npm run tauri:build:copy
```

The `.app` and installer artifacts are written to `src-tauri/target/release/bundle/`, and the current macOS build can be copied to the repo root:

- `./Studioklocka.app`
- `./Studioklocka_0.1.0_aarch64.dmg`

## Install (Windows)

**Option A: Install a prebuilt app**
1. Download the `.msi` (or `.exe`) from your release or shared build.
2. Run the installer and follow the prompts.
3. Launch `Studioklocka` from the Start Menu.

**Option B: Build from source**
1. Install Node.js (18+ recommended) and Rust.
2. Install the “Desktop development with C++” workload in Visual Studio Build Tools (MSVC).
3. In this repo (PowerShell or Command Prompt):

```sh
npm install
npm run tauri dev
```

### PowerShell `npm.ps1` execution policy error

If you see this in PowerShell:

`npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system`

use one of these fixes:

1. **Use Command Prompt instead of PowerShell** (quickest):

```bat
npm install
```

2. **Call the Windows command shim from PowerShell**:

```powershell
npm.cmd install
npm.cmd run tauri dev
```

3. **Allow PowerShell scripts for your user** (persistent fix):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then restart PowerShell and run:

```powershell
npm install
npm run tauri dev
```

If policy changes are blocked by company IT rules, use option 1 or 2.

To create an installer:

```sh
npm run tauri build
```

To build and copy installers to the repo root in one step:

```sh
npm run tauri:build:copy
```

The `.msi` is written to `src-tauri/target/release/bundle/`. If you build on Windows and want the installer at the repo root, copy it to:

- `./Studioklocka_*.msi`

## Configuration notes
- **World time vs local time**: toggle in the app menu. World time uses `worldtimeapi.org` and falls back to the local system clock if unavailable.
- **X32 mic-live indicator**: available in the desktop app when Tauri is running. Configure host/port and threshold in the settings UI.

## Development notes
- Vite dev server: `npm run dev`
- Build the web bundle: `npm run build`
- Preview the web build: `npm run preview`
- Tauri dev shell: `npm run tauri dev`
- Tauri production build: `npm run tauri build`

## License

TBD
