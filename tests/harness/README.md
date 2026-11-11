# Desktop harness

Runs `desktop/plugin.js` unchanged in a normal browser, against a stand-in for the Hermes Desktop SDK. It is for development and automated checks. **It is not the real app**: the real Radix popover, tooltip, dialog, theme and shell are replaced by small look-alikes in `sdk-stub.js`.

## Run

```bash
cd <repo root>
python -m http.server 8771 --bind 127.0.0.1
```

Open `http://127.0.0.1:8771/tests/harness/index.html`.

| Query | Effect |
|---|---|
| `api=fixture` | use the built-in fixture backend (`fixtures.js`) |
| `api=real` or none | use the Python dev server on `127.0.0.1:8770` when it answers, else the fixture |
| `bare=1` | hide the control panel so the window fills the page |
| `theme=light` | light theme |
| `unseen=3` | fixture starts with 3 unseen trophies (away summary) |
| `route=/trophy-room` | start on a route |
| `nopopover=1` / `nodialog=1` | hide Popover / Dialog from the SDK stub (tests the plugin's fallbacks) |
| `artall=1` | fixture: every trophy has real art (tests lazy art loading) |
| `profile=work` | start with another profile |
| `nosignals=1` | reject `/signal` (still logged) so page visits cannot unlock trophies mid-capture |

The control panel (bottom right) fires an unlock at any tier, toggles window focus (OS notification path), toggles "turn busy", switches theme, and jumps to the chat, the trophy room and settings.

## Checks

```js
// in the page, after it loads
await window.__runChecks()   // [{ name, ok, detail }]
```

`checks.js` drives the real plugin through the visible UI: every look x place, the `auto` look per tier, queue order, smallest tier, holding while busy, OS notification (focused, away, toggled off, icon from real art), in-app off, sound on and muted (Web Audio spy), click-through to a trophy, gallery summary, category scrolling and keyboard navigation, filters, search, secret entries, detail dialog, replay, away summary, legacy import, signals, optimistic totals.

Four runs make up the full verification (the real-backend run needs the dev server):

| Run | URL | Checks |
|---|---|---|
| Real backend | `?bare=1&route=/` with `python tests/dev_server.py` on :8770 (run it without the Hermes `PYTHONPATH`) | Full suite |
| Fixture | `?api=fixture&bare=1&route=/&unseen=3` | Full suite |
| Missing SDK pieces | `?api=fixture&bare=1&route=/&nopopover=1&nodialog=1` | 11 |
| Lazy art | `?api=fixture&bare=1&route=/trophy-room&artall=1` | 3 |

During a run `/signal` is rejected on purpose (it is still logged), so page visits cannot unlock Sightseer or Tinkerer in the middle of a geometry check. Covered since the review: unlocks from other processes found by a state refetch (one or two as cards, more as the away summary), page and plugin-count signals, the profile signal only on a real change, pop-up hosts (none mounted, one missing, a double mount), badge promise rejections, lazy and capped art requests, a failing reset, and fallbacks for a missing Popover, Dialog or ConfirmDialog.

`node tests/lint_desktop.mjs` statically checks `desktop/plugin.js` against the catalog rules for Desktop plugins.

### Away-unlock collections

Open `?api=fixture&bare=1&route=/&unseen=0` in a fresh harness session, then run:

```js
const away = await import('./away-checks.js')
await away.run(window.__trophy)
// Reload the renderer, import away-checks.js again, then verify the retained batch:
await away.verifyPersistedReplay(window.__trophy)
await away.verifyEdges(window.__trophy)
```

These checks cover the exact five-card batch, seen acknowledgement, individual flips, Full view and return, duplicate hosts, profile isolation, persistence, unavailable state, late requests, malformed snapshots and reset. Repeat `run` with `nodialog=1` to check the inline fallback. Native Desktop screenshots and Radix focus/Escape behavior still require the real host; the harness is not proof of those.

## What this does not prove

- Real Radix `Popover` placement, `titleBar.center` slot geometry and focus behaviour in the real shell.
- `navigator.setAppBadge` on the real Electron window and `ctx.os.notify` toasts on Windows.
- The app's own Tailwind, fonts and theme variables. The plugin ships its own CSS and reads `--ui-*` variables with fallbacks.

## Screenshots

`python tests/harness/hero_server.py` serves the same API as `tests/dev_server.py` with a curated, consistent demo state (61 of 120 unlocked across all tiers, discovered and secret entries, counters that match their tiers). Run it with the plain system Python, then open the harness with `?bare=1&nosignals=1` at 1280x800 and clear the saved settings (`localStorage.clear()`) first. The full check run re-seeds the dev server at the end, so restart the hero server before capturing.
