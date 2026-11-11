"""Achievement engine: apply counter changes, evaluate only the achievements they touch, record unlocks.

Rules:
- Unlocks are sticky: a tier once reached is never revoked.
- One unlock event per achievement per evaluation, carrying the highest tier and every tier gained.
- The unlock row is written (seen=0) before the broadcast. The broadcast is best-effort.
- Progress value = live value combined with an imported baseline (sum for lifetime and distinct
  metrics, max for best-session metrics).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from . import catalog as cat
from .store import PLUGIN_ID, Store, get_store

logger = logging.getLogger(__name__)

TROPHY_HUNTER = "trophy_hunter"


@dataclass
class Changes:
    """One batch of metric changes, written in a single transaction."""
    sums: dict[str, int] = field(default_factory=dict)
    maxes: dict[str, int] = field(default_factory=dict)
    distinct: list[tuple[str, str]] = field(default_factory=list)
    sessions: dict[str, dict[str, Any]] = field(default_factory=dict)
    prune: bool = False  # trim old per-session tallies
    tries: int = 0  # failed write attempts so far (the hooks layer retries)

    def bump(self, metric: str, n: int = 1) -> None:
        if n:
            self.sums[metric] = self.sums.get(metric, 0) + int(n)

    def top(self, metric: str, value: int) -> None:
        self.maxes[metric] = max(self.maxes.get(metric, 0), int(value))

    def add(self, metric: str, value: Any) -> None:
        if value not in (None, ""):
            self.distinct.append((metric, str(value)))

    def touched(self) -> set[str]:
        return set(self.sums) | set(self.maxes) | {m for m, _ in self.distinct}

    def empty(self) -> bool:
        return not (self.sums or self.maxes or self.distinct or self.sessions or self.prune)


def _metric_values(store: Store, metrics: set[str], total_unlocked: int) -> dict[str, int]:
    distinct_keys = [m for m in metrics if cat.metric_type(m) == "distinct"]
    plain = [m for m in metrics if cat.metric_type(m) in ("sum", "max")]
    values = store.counters(plain)
    values.update(store.distinct_counts(distinct_keys))
    if "total_unlocked" in metrics:
        values["total_unlocked"] = total_unlocked
    return values


def _combine(a: dict[str, Any], raw: int, baseline: int) -> int:
    """Live value plus imported baseline. Best-session and distinct metrics take the larger of the
    two (a baseline for a set cannot be added to it); lifetime counters add."""
    if a["kind"] in ("best_session", "distinct"):
        return max(raw, baseline)
    return raw + baseline


def evaluate_one(a: dict[str, Any], values: dict[str, int], baselines: dict[str, int]) -> tuple[int, int, int]:
    """Return (value, tier, threshold_met). For multi-condition entries value is the percent met."""
    if a["kind"] == "multi_condition":
        parts, complete = [], True
        for r in a["requirements"]:
            v = int(values.get(r["metric"], 0))
            complete = complete and v >= r["gte"]
            parts.append(min(1.0, v / max(1, r["gte"])))
        pct = 100 if complete else min(99, int(sum(parts) / len(parts) * 100))
        return pct, (cat.MULTI_TIER if complete else -1), (100 if complete else 0)
    raw = int(values.get(a["metric"], 0))
    value = _combine(a, raw, baselines.get(a["id"], 0))
    tier = cat.tier_for(a["thresholds"], value)
    return value, tier, (a["thresholds"][tier] if tier >= 0 else 0)


def _max_tiers(store: Store) -> dict[str, int]:
    out: dict[str, int] = {}
    for id_, tier, _at, _seen in store.unlock_rows():
        out[id_] = max(out.get(id_, -1), tier)
    return out


def _total_unlocked(max_tiers: dict[str, int]) -> int:
    return sum(1 for i, t in max_tiers.items() if t >= 0 and i != TROPHY_HUNTER)


def payload_for(a: dict[str, Any], tier: int, gained: list[int], value: int, at: int) -> dict[str, Any]:
    nxt = cat.next_threshold(a["thresholds"], tier) if a["thresholds"] else None
    return {"id": a["id"], "tier": tier, "tiers_gained": gained, "name": a["name"], "description": a["description"],
            "category": a["category"], "glyph": a["glyph"], "how": a["how"], "value": value,
            "threshold": a["thresholds"][tier] if a["thresholds"] and tier >= 0 else 0, "next": nxt,
            "at": at, "new": a["source"] == "new"}


def broadcast(payload: dict[str, Any]) -> bool:
    """Best-effort push to every connected Desktop window. Never raises."""
    # SystemExit is caught on purpose: importing the gateway outside a Desktop backend can raise
    # hermes_bootstrap.RelaunchExit (a SystemExit), which must never take the agent process down.
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event
    except (Exception, SystemExit):
        return False
    try:
        broadcast_plugin_event(PLUGIN_ID, "unlocked", payload)
        return True
    except (Exception, SystemExit) as exc:
        logger.debug("broadcast failed: %s", exc)
        return False


def _evaluate_ids(store: Store, conn, ids: list[str], max_tiers: dict[str, int], seen: int, now: int) -> list[dict[str, Any]]:
    """Evaluate the given ids inside an open transaction; insert unlock rows; return payloads."""
    if not ids:
        return []
    achs = [cat.CATALOG_BY_ID[i] for i in ids]
    metrics: set[str] = set()
    for a in achs:
        metrics.update([a["metric"]] if a["metric"] else [r["metric"] for r in a["requirements"]])
    values = _metric_values(store, metrics, _total_unlocked(max_tiers))
    baselines = store.baselines()
    out: list[dict[str, Any]] = []
    for a in achs:
        value, tier, _thr = evaluate_one(a, values, baselines)
        have = max_tiers.get(a["id"], -1)
        if tier <= have:
            continue
        if a["kind"] == "multi_condition":
            gained = [cat.MULTI_TIER]
        else:
            gained = list(range(have + 1, tier + 1))
        for t in gained:
            Store.unlock_insert(conn, a["id"], t, now, seen)
        max_tiers[a["id"]] = tier
        out.append(payload_for(a, tier, gained, value, now))
    return out


def apply(changes: Changes, seen: int = 0, do_broadcast: bool = True, store: Optional[Store] = None) -> list[dict[str, Any]]:
    """Write one batch of changes and record any unlocks. Returns the unlock payloads."""
    store = store or get_store()
    if changes.empty():
        return []
    now = int(time.time())
    payloads: list[dict[str, Any]] = []
    with store.tx() as conn:
        for m, n in changes.sums.items():
            Store.add(conn, m, n)
        for m, v in changes.maxes.items():
            Store.maximum(conn, m, v)
        for m, v in changes.distinct:
            Store.distinct_add(conn, m, v)
        for sid, data in changes.sessions.items():
            Store.session_put(conn, sid, data)
        if changes.prune:
            Store.session_prune(conn)
        ids: list[str] = []
        for m in changes.touched():
            ids.extend(cat.METRIC_TO_IDS.get(m, []))
        ids = list(dict.fromkeys(ids))
        max_tiers = _max_tiers(store)
        payloads = _evaluate_ids(store, conn, ids, max_tiers, seen, now)
        if payloads and TROPHY_HUNTER not in ids:
            payloads += _evaluate_ids(store, conn, [TROPHY_HUNTER], max_tiers, seen, now)
    if do_broadcast:
        for p in payloads:
            broadcast(p)
    return payloads


def evaluate_all(seen: int = 1, do_broadcast: bool = False, store: Optional[Store] = None) -> list[dict[str, Any]]:
    """Re-evaluate every achievement (used after an import)."""
    store = store or get_store()
    now = int(time.time())
    with store.tx() as conn:
        max_tiers = _max_tiers(store)
        payloads = _evaluate_ids(store, conn, [a["id"] for a in cat.CATALOG if a["id"] != TROPHY_HUNTER], max_tiers, seen, now)
        payloads += _evaluate_ids(store, conn, [TROPHY_HUNTER], max_tiers, seen, now)
    if do_broadcast:
        for p in payloads:
            broadcast(p)
    return payloads


def hidden_secret_ids(store: Optional[Store] = None) -> set[str]:
    """Ids of secret entries that have shown no first sign yet (their art must stay hidden)."""
    store = store or get_store()
    secrets = [a for a in cat.CATALOG if a["secret"]]
    max_tiers = _max_tiers(store)
    metrics: set[str] = set()
    for a in secrets:
        metrics.update([a["metric"]] if a["metric"] else [r["metric"] for r in a["requirements"]])
    values = _metric_values(store, metrics, _total_unlocked(max_tiers))
    baselines = store.baselines()
    hidden: set[str] = set()
    for a in secrets:
        value, tier, _ = evaluate_one(a, values, baselines)
        if max(tier, max_tiers.get(a["id"], -1)) < 0 and value == 0:
            hidden.add(a["id"])
    return hidden


SECRET_NAME = "Secret trophy"
SECRET_TEXT = "Hidden until Hermes sees the first sign of it."


def build_state(store: Optional[Store] = None) -> dict[str, Any]:
    """The /state payload (see docs/CONTRACT.md)."""
    store = store or get_store()
    rows = store.unlock_rows()
    first: dict[str, tuple[int, int]] = {}
    max_tiers: dict[str, int] = {}
    for id_, tier, at, _seen in rows:
        max_tiers[id_] = max(max_tiers.get(id_, -1), tier)
        if id_ not in first or tier < first[id_][0]:
            first[id_] = (tier, at)
    metrics = {m for a in cat.CATALOG for m in ([a["metric"]] if a["metric"] else [r["metric"] for r in a["requirements"]])}
    values = _metric_values(store, metrics, _total_unlocked(max_tiers))
    baselines = store.baselines()

    catalog_out, progress, by_tier = [], {}, [0] * 5
    unlocked_total = 0
    for a in cat.CATALOG:
        value, tier, _ = evaluate_one(a, values, baselines)
        tier = max(tier, max_tiers.get(a["id"], -1))
        if a["kind"] == "multi_condition" and tier >= 0:
            value = 100
        if tier >= 0:
            state = "unlocked"
            unlocked_total += 1
            by_tier[tier] += 1
        elif value > 0:
            state = "discovered"
        elif a["secret"]:
            state = "secret"
        else:
            state = "locked"
        entry = {k: a[k] for k in ("id", "name", "description", "category", "glyph", "secret", "kind", "thresholds", "how", "source", "requirements")}
        if state == "secret":
            entry.update(name=SECRET_NAME, description=SECRET_TEXT, how=SECRET_TEXT, glyph="star", requirements=None)
        catalog_out.append(entry)
        if a["thresholds"]:
            nxt = cat.next_threshold(a["thresholds"], tier)
        else:
            nxt = 100 if tier < 0 else None
        progress[a["id"]] = {"value": value, "tier": tier, "state": state,
                             "first_tier": first[a["id"]][0] if a["id"] in first else None,
                             "unlocked_at": first[a["id"]][1] if a["id"] in first else None,
                             "next": nxt}
    legacy_file = _legacy_state_path()
    return {
        "version": 1,
        "catalog": catalog_out,
        "progress": progress,
        "totals": {"unlocked": unlocked_total, "total": len(cat.CATALOG), "by_tier": by_tier},
        "unseen": store.unseen(),
        "meta": {"legacy_import": {"available": bool(legacy_file and legacy_file.exists()),
                                   "done": store.meta_get("legacy_import_done") is not None},
                 "categories": cat.CATEGORIES},
    }


def _legacy_state_path():
    try:
        from .legacy import legacy_dir
        return legacy_dir() / "state.json"
    except Exception:
        return None
