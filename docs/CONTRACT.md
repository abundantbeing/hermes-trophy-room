# Trophy Room: build contract (Python half <-> Desktop half)

Plugin id: `trophy-room`. Display name: "Trophy Room". Repo: `hermes-trophy-room`.
Bundled plugin `hermes-achievements` (dashboard tab) stays untouched; ids and names here must never collide with it.

## Layout (repo root is the plugin)

```
plugin.yaml                 manifest v2, requires_hermes ">=0.22.0", declares provides_hooks
__init__.py                 register(ctx): registers hooks only
trophy_room_core/           python package (unique name, imported by __init__ and plugin_api)
  catalog.py engine.py store.py hooks.py legacy.py art.py signals.py
dashboard/manifest.json     {"name": "trophy-room", "api": "plugin_api.py"}   (no tab, no entry)
dashboard/plugin_api.py     FastAPI router mounted at /api/plugins/trophy-room/
desktop/plugin.js           ONE plain ESM file (only imports @hermes/plugin-sdk, react, react/jsx-runtime)
art/                        real pictures later: <id>.webp (gallery + pop-up) and art/icons/<id>.png (OS notification)
tests/                      python tests + tests/harness (desktop harness) + tests/dev_server.py
docs/                       contract, art style, brand and screenshots
```

## Rules both halves obey (catalog admission)
No network calls, no telemetry, no binaries, no eval, no self-update, no `.pyc`.
Python reads secrets never. Desktop uses only the SDK surface: no `document.querySelector` on app markup, no `window.hermesDesktop`, no body MutationObserver, no prototype patching.
Reads outside the plugin's own data are opt-in and disclosed: (1) "Import from the dashboard plugin" reads `<hermes home>/plugins/hermes-achievements/state.json` + `scan_snapshot.json`; nothing else outside our data.
No emoji or em dashes in UI strings. Square corners (3px), brand look from design/index.html.

## Glyph keys (the only icon keys the catalog may use; desktop draws every one)
flame wing clock nodes key crystal hammer term eye chat board crown moon cog mic globe hand star
shield scroll bug plug puzzle book brain cloud bolt lock rocket branch container image film speaker compass hourglass bell cube wrench feather laurel

## Tiers
5 tiers, index 0..4: Copper, Silver, Gold, Diamond, Olympian. `tier` = highest reached index, -1 = none.

## REST: base `/api/plugins/trophy-room`

`GET /state` ->
```json
{
 "version": 1,
 "catalog": [{"id":"let_him_cook","name":"Let Him Cook","description":"...","category":"Agent Autonomy",
              "glyph":"flame","secret":false,"kind":"lifetime|best_session|multi_condition|distinct",
              "thresholds":[200,500,1200,3000,8000],"how":"Tool calls in one session","source":"legacy|new",
              "requirements":[{"label":"Terminal calls in one session","gte":180}]  // multi_condition only, else null
             }],
 "progress": {"let_him_cook":{"value":2100,"tier":2,"state":"unlocked|discovered|locked|secret","first_tier":2,"unlocked_at":1782510295,"next":3000}},
 "totals": {"unlocked":55,"total":120,"by_tier":[14,15,13,8,5]},
 "unseen": [{"id":"let_him_cook","tier":2,"at":1782510295}],
 "meta": {"legacy_import": {"available": true, "done": false}, "categories": ["Agent Autonomy", "..."]}
}
```
Secret + state "secret": the entry is still in `catalog` but `name`/`description`/`how` are replaced by "Secret trophy"/hint text and `glyph` is "star", until its first related signal (then state becomes "discovered").
`state`: "unlocked" (tier >= 0), "discovered" (value > 0), "locked" (value 0), "secret".

`POST /seen` body `{"ids":["x"]}` (omit ids = all) -> `{"ok":true}`  marks the unseen queue as seen.
`POST /signal` body `{"key":"trophy_room_open"|"profile_seen"|"plugin_count"|"page_visit","value":...}` -> `{"ok":true}`  Desktop-observed signals, whitelisted keys only.
`POST /import-legacy` -> `{"ok":true,"imported":55,"already":0,"source":"<path>"}`  imports unlocks and progress from the dashboard plugin, marks them seen, never fires pop-ups.
`POST /reset` body `{"confirm":"reset"}` -> `{"ok":true}`  clears our data only.
`GET /art/{id}` -> `{"uri":"data:image/webp;base64,..."|null,"icon_path":"C:\\...\\art\\icons\\id.png"|null}`  looks for `art/{id}.webp|png|jpg|jpeg`; `null` when absent (desktop draws the glyph placeholder).
`GET /art-index` -> `{"ids":["let_him_cook", ...]}`  ids that have real art.

## Event (Python -> every Desktop window): `plugin.trophy-room.unlocked`
Sent with `hermes_cli.plugin_events.broadcast_plugin_event("trophy-room","unlocked",payload)`; Desktop receives `host.onEvent('plugin.trophy-room.unlocked', ({payload}) => ...)`.
```json
{"id":"let_him_cook","tier":2,"tiers_gained":[1,2],"name":"Let Him Cook","description":"...","category":"Agent Autonomy",
 "glyph":"flame","how":"Tool calls in one session","value":1200,"threshold":1200,"next":3000,"at":1782510295,"new":false}
```
The unlock row is written to SQLite first (seen=0); the broadcast is best-effort. Several tiers crossed at once = ONE event, highest tier, `tiers_gained` lists all.

## Desktop settings (device-local, `ctx.storage`, never sent to Python)
`style`: auto|podium|tile|card (default auto); `place`: top-left|top-center|top-right|bottom-right|bottom-left (default top-center);
`inApp` true; `onWindow` true (title-bar flash + taskbar badge via navigator.setAppBadge); `os` true (ctx.os.notify when the window is unfocused);
`sound` true; `volume` 0.55; `quiet` true (hold pop-ups until the focused session's turn ends); `minTier` 0 (smallest tier that pops up).
Higher tier = bigger moment. With `style: auto`: Copper/Silver use `tile`, Gold/Diamond use `podium`, Olympian uses `card`. Any other style value is used for every tier.

## Amendments from the Python build (authoritative, supersede the text above)
1. `multi_condition` entries have `thresholds: []`. Their progress `value` is a percent 0..100. They unlock once at tier 2 (Gold); `next` is 100 until then and null after. The detail ladder must handle empty `thresholds` (show the requirements list with per-requirement labels instead of five tiers).
2. `catalog[].requirements` items are `{metric, gte, label}`; `how` for those entries reads "label >= n; label >= n".
3. Event `payload.new` / catalog `source` mean: from the new set (true) vs the legacy set (false).
4. `POST /signal` returns `{"ok":true,"unlocked":[ids]}`; a bad key or value is HTTP 400.
5. `POST /import-legacy` returns `{ok:false, error}` when there is no dashboard data (not a 404).
6. A secret entry's `thresholds` are NOT masked; only name, description, how, glyph and requirements are.
7. Unlock timing: hook writes are coalesced, so an unlock can arrive up to about 1 s after the tool call.
