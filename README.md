# Squidly Games

Three mini-apps plus shared assets. **Host the `Games` folder as the HTTP root** (not an individual game folder).

## Local dev (Go Live)

1. Open this repo in VS Code.
2. Use Live Server on the **workspace root** (`Games/`), port **5500** (see `.vscode/settings.json`).
3. Open [index.html](./index.html) to pick a game, or open a game directly:
   - `make-a-fishbowl/index.html`
   - `make-a-pizza/index.html`
   - `make-a-robot/index.html`

```bash
python3 -m http.server 5501
# http://127.0.0.1:5501/
```

## Squidly Session (app picker)

Squidly loads each app from a **base URL + `/info.json` + `/index.html`**. It injects `<base href="{appUrl}/">`, so imports like `../shared/session-sync.js` resolve to `shared/` at the repo root.

Register one hub URL in `SquidlySessionV3/src/Features/Apps/apps.js` → `AppsList`:

- `http://127.0.0.1:5501` (loads root `index.html` + `info.json`)

The hub page lists the three games; Squidly shows a single app entry instead of three duplicates.

## Shared code

| Path | Used by |
|------|---------|
| `shared/session-sync.js` | All three `app.js` (Firebase session state) |
| `shared/squidly-buttons.css` | All three `index.html` |
| `shared/scene-controls.css` | Back / Reset placement (all three games) |
| `shared/miniapp-layout.css` | Shared `access-wrap` / hotspot layout |
| `shared/back-nav.js` | Squidly access-click → hub (`index.html`) |

Do not duplicate these into game folders; keep a single copy under `shared/`.

## Robot calibration

`make-a-robot/index.html?calibrate=1` — **dev-only** tool (styles in `calibrate.js`, not `style.css`): click four corners per part on the background to regenerate `resources/robot-layout.json`. Players never use this URL.
