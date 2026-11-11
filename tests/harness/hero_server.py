"""Dev server with a curated, internally consistent demo state for screenshots.

Run it with the plain system Python (no PYTHONPATH):  python tests/harness/hero_server.py [--port 8770]
It imports tests/dev_server.py (throwaway HERMES_HOME, its random seed), then lifts chosen trophies to chosen
tiers by seeding their real counters, so a card's progress always matches its tier. Everything else is untouched.
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests"))

import dev_server as ds  # noqa: E402  (seeds a throwaway home and builds the app)
from trophy_room_core import catalog as cat  # noqa: E402
from trophy_room_core import engine  # noqa: E402
from trophy_room_core.store import get_store  # noqa: E402

# name -> tier to reach (multi_condition entries just need their requirements met)
UNLOCK = {
    "Let Him Cook": 2, "Autonomous Avalanche": 4, "Toolchain Maxxer": 3, "Full Send": 2, "Subagent Commander": 2,
    "Background Process Enjoyer": 1, "Cron Necromancer": 3, "Red Text Connoisseur": 2, "Stack Trace Sommelier": 1,
    "Night Shift Operator": 4, "Everywhere At Once": 3, "Skillsmith": 2, "Skill Issue? Skill Created.": 1,
    "Memory Keeper": 1, "Gateway Dweller": 2, "Radio Voice": 1, "Forge Apprentice": 2, "Whetstone": 1, "Open Book": 3,
    "Gallery Owner": 2, "Director's Cut": 1, "Studio Session": 1, "Multimedia Magnate": 2,
}
# name -> fraction of the first tier (shows as "discovered": greyed picture with progress)
DISCOVER = ["Actually Read The Logs", "Skill Issue? Skill Created.", "Card Catalog", "Radio Voice", "Port 3000 Is Taken", "Terminal Goblin"]


def hero() -> None:
    by_name = {a["name"]: a for a in cat.CATALOG}
    store = get_store()
    rng = random.Random(11)
    with store.tx() as conn:
        for name, tier in UNLOCK.items():
            a = by_name.get(name)
            if a is None:
                print("unknown trophy", name)
                continue
            if a["kind"] == "multi_condition":
                for r in a["requirements"]:
                    ds._seed_metric(conn, r["metric"], r["gte"])
            else:
                th = a["thresholds"][tier]
                ds._seed_metric(conn, a["metric"], th + rng.randint(0, max(1, th // 4)))
        for name in DISCOVER:
            a = by_name.get(name)
            if a and a["kind"] != "multi_condition" and name not in UNLOCK:
                ds._seed_metric(conn, a["metric"], max(1, a["thresholds"][0] // 2))
    engine.evaluate_all(seen=1, do_broadcast=False)
    now = int(time.time())
    with store.tx() as conn:  # date the new unlocks over the last two months
        for id_, tier, at, _seen in store.unlock_rows():
            if at > now - 120:
                conn.execute("UPDATE unlocks SET at=? WHERE id=? AND tier=?", (now - rng.randint(3600, 60 * 86400), id_, tier))
    st = engine.build_state()
    print("hero state:", st["totals"], "unseen", len(st["unseen"]), flush=True)


hero()

if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    args = ap.parse_args()
    print(f"trophy-room HERO dev server: http://127.0.0.1:{args.port}/api/plugins/trophy-room/state", flush=True)
    uvicorn.run(ds.app, host="127.0.0.1", port=args.port, log_level="warning")
