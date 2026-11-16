# ForgeLocal

Local-first desktop IDE + AI coding assistant with first-class **LM Studio** integration. Inspired by LocalForge, Cline, and Cursor — built to work offline with no account, telemetry, or cloud fallback.

## Prerequisites

- Node.js 20+ (tested with 22)
- npm 10+
- LM Studio installed separately for AI features
- Linux / macOS / Windows

## Setup

```bash
npm install
```

Copy the example config if you want a reference for provider defaults:

```bash
cp config/config.example.json ./config.local.example.json
```

Runtime settings are stored locally via `electron-store` (not committed). The example file is safe to commit and contains no secrets.

## Run (development)

```bash
npm run dev
```

On Linux, `npm run dev` sets `ELECTRON_DISABLE_SANDBOX=1` so Electron can start without a root-owned SUID `chrome-sandbox`. That is the supported local-dev path (no sudo required).

If you prefer the real Chromium sandbox instead:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Then you can remove `ELECTRON_DISABLE_SANDBOX=1` from the `dev` / `preview` scripts in `package.json`. Note: re-running `npm install` may restore a non-root `chrome-sandbox`, so you would need to re-apply those permissions.

### Linux troubleshooting

| Symptom                                        | Fix                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `chrome-sandbox` / `setuid_sandbox_host` FATAL | Use `npm run dev` (sandbox already disabled in script), or apply the `chown`/`chmod` above |
| Missing GTK / NSS libs                         | `sudo apt install libgtk-3-0 libnss3 libgbm1 libasound2`                                   |

## Test / quality

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

## Build / package

```bash
npm run build
npm run package
```

- `build` compiles main/preload/renderer with electron-vite
- `package` produces an unpackaged app directory under `release/` via electron-builder

## Offline behavior

- Project files, chat history, settings, and the tools catalog live on disk locally
- The bundled catalog in `resources/catalog.json` works with no network
- “Reload offline catalog” re-reads the bundled file; there is no automatic online refresh
- Core IDE features (open project, edit, search, terminal approval, diff review) do not require internet
- Default AI chat uses a reachable **local** LM Studio server
- Optional **remote** OpenAI-compatible mode is explicit in Settings (base URL + user API key). There is no silent cloud fallback from local mode
- Online tools/extensions appear only while a remote model is selected; switching back to local disables them

## LM Studio setup (local)

1. Install [LM Studio](https://lmstudio.ai/)
2. Download/load a chat model
3. Start the local server (Developer → Start Server)
4. Default API base URL: `http://localhost:1234/v1`
5. In ForgeLocal: **Settings** (Provider mode → Local) or **Reconnect**, then select a discovered model
6. Attach only the files you want as context, send a prompt, review diffs, Accept/Reject

## Remote OpenAI-compatible models

1. Settings → Provider mode → **Remote**
2. Set base URL (e.g. `https://api.openai.com/v1`) and API key (stored in electron-store locally; never logged)
3. Test connection, pick a model from the discovered list
4. Online tools/extensions unlock in the catalog/dock only after a remote model is active

## Tool dock

- **MCP:** Honest status panel (`stub` / `empty` / `ready`). This build does not run a live MCP server runtime
- **Online:** Visible/usable only with an active remote model
- **Pop-out IDE:** Opens a second BrowserWindow and restores workspace + open file paths when possible (unsaved buffer text is not cloned)

### Troubleshooting

| Symptom                        | Likely cause                                       |
| ------------------------------ | -------------------------------------------------- |
| `stopped` / connection refused | LM Studio not running or server not started        |
| `unreachable` / timeout        | Wrong port/base URL, firewall, or hung server      |
| `no-model`                     | Server up but no model loaded                      |
| Remote missing API key         | Remote mode requires a key in Settings             |
| Online tools hidden/disabled   | Local mode active or no remote model selected      |
| HTTP errors from chat          | Incompatible model, unloaded model, or bad request |

## End-to-end flow

1. Open a project (File → Open Project)
2. Connect LM Studio and pick a model
3. Open files and mark context with `+` in the file tree (nothing else is sent)
4. Prompt in the AI panel
5. Review proposed diffs → Accept (writes after confirm) or Reject
6. AI shell suggestions appear as Command Cards and need explicit approval

## Stack / assumptions

- **Stack:** Electron + React 18 + TypeScript + Vite (electron-vite) + Monaco + Zustand + electron-store + electron-builder + Vitest
- **Provider:** OpenAI-compatible API; default local `http://localhost:1234/v1`, optional remote endpoint via Settings
- **Security:** Workspace path confinement by default; destructive/unsafe commands blocked; AI edits never overwrite without approval; online catalog tools gated to remote mode
- **Catalog:** Bundled offline JSON; unimplemented third-party stubs cannot be marked installed/enabled as working
- **Polish layers:** Infinite canvas + focus lens, ghost-layer diffs (Tab/Esc), intent radial (Extract/Optimize/Tests/Explain), glass Command Cards + LM/MCP/online/pop-out dock, and selection syntax dimming. Optional catalog tools default on for the gift experience; MCP dock is an honest stub (no live runtime); VRAM meter is honestly `n/a`
- **Fonts / look:** Syne (UI/brand) + JetBrains Mono with ligatures (code). Visual direction is “forge ember” — deep ink, warm copper, quiet celadon — not purple/indigo dashboard chrome. If fonts.googleapis.com is blocked offline, the UI falls back to system fonts
- **Terminal:** Uses approved `shell: true` child processes (Command Cards), not a full interactive PTY, for portability and explicit approval
- **No telemetry / analytics / automatic cloud uploads**

## Project layout

```
src/main/          Electron main: FS, LM Studio, catalog, IPC, security
src/preload/       contextBridge API
src/renderer/      React UI (IDE, chat, diffs, catalog, canvas)
src/shared/        Shared types/defaults
resources/         Offline tools catalog
config/            Example settings (no secrets)
tests/             Vitest unit tests
```

## License

MIT
