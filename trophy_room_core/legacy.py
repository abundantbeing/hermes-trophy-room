"""One-time, opt-in import from the bundled dashboard plugin ``hermes-achievements``.

Reads (never writes) ``<hermes home>/plugins/hermes-achievements/state.json`` and, when present,
``scan_snapshot.json`` in the same folder. Imported unlocks keep their original dates, are marked
seen (so no pop-up storm), and the snapshot's progress becomes a baseline that live counting adds to.
Safe to run twice.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

from . import catalog as cat
from . import engine
from .store import Store, get_store, hermes_home

TIER_INDEX = {name.lower(): i for i, name in enumerate(cat.TIER_NAMES)}


def legacy_dir() -> Path:
    return hermes_home() / "plugins" / "hermes-achievements"


def _load(path: Path) -> Optional[Any]:
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def import_legacy(store: Optional[Store] = None) -> dict[str, Any]:
    store = store or get_store()
    base = legacy_dir()
    if store.meta_get("legacy_import_done") is not None:  # a second import would double count
        have_ids = {r[0] for r in store.unlock_rows()}
        n = sum(1 for a in cat.LEGACY if a["id"] in have_ids)
        return {"ok": True, "imported": 0, "already": n, "source": str(base / "state.json"), "note": "already imported"}
    state = _load(base / "state.json")
    if not isinstance(state, dict):
        return {"ok": False, "imported": 0, "already": 0, "source": str(base / "state.json"), "error": "no dashboard plugin data found"}
    unlocks = state.get("unlocks") if isinstance(state.get("unlocks"), dict) else {}
    snap = _load(base / "scan_snapshot.json")
    by_snap: dict[str, dict[str, Any]] = {}
    snap_time = int(time.time())
    if isinstance(snap, dict) and isinstance(snap.get("achievements"), list):
        by_snap = {a.get("id"): a for a in snap["achievements"] if isinstance(a, dict)}
        if isinstance(snap.get("generated_at"), (int, float)):
            snap_time = int(snap["generated_at"])

    have: dict[str, int] = {}
    for id_, tier, _at, _seen in store.unlock_rows():
        have[id_] = max(have.get(id_, -1), tier)

    imported = already = 0
    with store.tx() as conn:
        for a in cat.LEGACY:
            id_ = a["id"]
            u = unlocks.get(id_) if isinstance(unlocks.get(id_), dict) else None
            s = by_snap.get(id_)
            unlocked = u is not None or (s is not None and s.get("state") == "unlocked")
            if not unlocked:
                _set_baseline(conn, store, a, _int((s or {}).get("progress")))
                continue
            at = _int((u or {}).get("unlocked_at")) or snap_time
            if a["kind"] == "multi_condition":
                tiers = [cat.MULTI_TIER]
            else:
                top = _tier_of((s or {}).get("tier"))
                if top is None:
                    top = _tier_of((u or {}).get("first_tier"))
                tiers = list(range(0, (top if top is not None else 0) + 1))
            if id_ in have:
                already += 1
            else:
                imported += 1
            for t in tiers:
                Store.unlock_insert(conn, id_, t, at, 1)
            _set_baseline(conn, store, a, _int((s or {}).get("progress")))
        Store.meta_set(conn, "legacy_import_done", str(int(time.time())))
    engine.evaluate_all(seen=1, do_broadcast=False, store=store)
    return {"ok": True, "imported": imported, "already": already, "source": str(base / "state.json")}


def _set_baseline(conn, store: Store, a: dict[str, Any], progress: int) -> None:
    """Record the dashboard plugin's progress as a baseline.

    A lifetime counter adds live counts on top, so the baseline is what the dashboard saw minus what
    we already counted live (no double counting). Best-session and distinct metrics take the larger of
    baseline and live, so they store the progress as is. Multi-condition entries ignore baselines.
    """
    if not progress or a["kind"] == "multi_condition":
        return
    if a["kind"] == "lifetime":
        live = store.counters([a["metric"]]).get(a["metric"], 0)
        progress = max(0, progress - live)
    if progress:
        conn.execute("INSERT INTO baseline(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=MAX(value, excluded.value)", (a["id"], progress))


def _int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _tier_of(name: Any) -> Optional[int]:
    return TIER_INDEX.get(str(name).lower()) if name else None
