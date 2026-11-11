"""Development server: the real Trophy Room router on http://127.0.0.1:8770/api/plugins/trophy-room

Run it with the Hermes venv Python:  python tests/dev_server.py [--port 8770]
It uses a throwaway HERMES_HOME (a temp folder), so nothing touches ~/.hermes. The data is seeded with
demo progress: about 40 unlocked trophies across tiers, some discovered, a few unseen.

Dev-only routes (not part of the plugin):
  GET  /dev/fire?id=let_him_cook&tier=2   write the unlock row (seen=0) and return the event payload
  POST /dev/state-reset                   wipe and re-seed
  GET  /dev/health                        where the temp home is
"""
from __future__ import annotations

import argparse
import os
import random
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME = tempfile.mkdtemp(prefix="trophy-room-dev-")
os.environ["HERMES_HOME"] = HOME
for p in (str(ROOT), str(ROOT / "dashboard")):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from trophy_room_core import catalog as cat  # noqa: E402
from trophy_room_core import engine  # noqa: E402
from trophy_room_core.engine import Changes  # noqa: E402
from trophy_room_core.store import Store, get_store  # noqa: E402

import plugin_api  # noqa: E402  (dashboard/plugin_api.py)


def _seed_metric(conn, metric: str, value: int) -> None:
    kind = cat.metric_type(metric)
    if kind == "distinct":
        for i in range(value):
            Store.distinct_add(conn, metric, f"{metric}-{i}")
    elif kind in ("sum", "max"):
        Store.maximum(conn, metric, value)


def seed(target_unlocked: int = 32, seed_value: int = 7) -> dict:
    rng = random.Random(seed_value)
    store = get_store()
    store.reset()
    ids = [a["id"] for a in cat.CATALOG if a["id"] != "trophy_hunter" and not a["secret"]]
    secret_ids = [a["id"] for a in cat.CATALOG if a["secret"]]
    rng.shuffle(ids)
    now = int(time.time())
    with store.tx() as conn:
        done = 0
        for id_ in ids:
            a = cat.CATALOG_BY_ID[id_]
            if done >= target_unlocked:
                break
            if a["kind"] == "multi_condition":
                for r in a["requirements"]:
                    _seed_metric(conn, r["metric"], r["gte"])
            else:
                tier = rng.choices([0, 1, 2, 3, 4], weights=[5, 5, 4, 2, 1])[0]
                _seed_metric(conn, a["metric"], a["thresholds"][tier] + rng.randint(0, max(1, a["thresholds"][tier] // 5)))
            done += 1
        # discovered: progress below the first threshold
        left = [i for i in ids[target_unlocked + 3:] if cat.CATALOG_BY_ID[i]["kind"] != "multi_condition"]
        for id_ in left[:9]:
            a = cat.CATALOG_BY_ID[id_]
            _seed_metric(conn, a["metric"], max(1, a["thresholds"][0] // 2))
        for id_ in secret_ids[:2]:  # two secrets with first signs, so they show as discovered
            a = cat.CATALOG_BY_ID[id_]
            if a["kind"] != "multi_condition":
                _seed_metric(conn, a["metric"], max(1, a["thresholds"][0] // 2))
    engine.evaluate_all(seen=1, do_broadcast=False)
    # stagger the unlock dates over the last two months
    with store.tx() as conn:
        for n, (id_, tier) in enumerate(sorted({(r[0], r[1]) for r in store.unlock_rows()})):
            conn.execute("UPDATE unlocks SET at=? WHERE id=? AND tier=?", (now - rng.randint(3600, 60 * 86400) , id_, tier))
    # three unseen unlocks (what the Desktop shows as "while you were away")
    unseen_pick = [i for i in ids[target_unlocked:target_unlocked + 3]]
    for id_ in unseen_pick:
        a = cat.CATALOG_BY_ID[id_]
        ch = Changes()
        if a["kind"] == "multi_condition":
            for r in a["requirements"]:
                ch.bump(r["metric"], r["gte"])
        elif cat.metric_type(a["metric"]) == "distinct":
            for i in range(a["thresholds"][0]):
                ch.add(a["metric"], f"seed-unseen-{i}")
        elif cat.metric_type(a["metric"]) == "max":
            ch.top(a["metric"], a["thresholds"][0])
        else:
            ch.bump(a["metric"], a["thresholds"][0])
        engine.apply(ch, seen=0, do_broadcast=False)
    st = engine.build_state()
    return {"unlocked": st["totals"]["unlocked"], "by_tier": st["totals"]["by_tier"], "unseen": len(st["unseen"]),
            "discovered": sum(1 for p in st["progress"].values() if p["state"] == "discovered")}


app = FastAPI(title="Trophy Room dev server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(plugin_api.router, prefix="/api/plugins/trophy-room")


@app.get("/dev/health")
def health() -> dict:
    return {"ok": True, "hermes_home": HOME}


@app.post("/dev/state-reset")
def state_reset() -> dict:
    return {"ok": True, **seed()}


@app.get("/dev/fire")
def fire(id: str, tier: int = 0) -> dict:
    a = cat.CATALOG_BY_ID.get(id)
    if a is None:
        raise HTTPException(status_code=404, detail="unknown achievement")
    top = max(0, min(tier, 4))
    if a["kind"] == "multi_condition":
        gained, top = [cat.MULTI_TIER], cat.MULTI_TIER
    else:
        gained = list(range(0, top + 1))
    store = get_store()
    now = int(time.time())
    with store.tx() as conn:
        for t in gained:
            conn.execute("DELETE FROM unlocks WHERE id=? AND tier=?", (id, t))
            Store.unlock_insert(conn, id, t, now, 0)
    value = a["thresholds"][top] if a["thresholds"] else 100
    return engine.payload_for(a, top, gained, value, now)


seed()

if __name__ == "__main__":
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    args = ap.parse_args()
    print(f"trophy-room dev server: http://127.0.0.1:{args.port}/api/plugins/trophy-room/state  (home {HOME})", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
