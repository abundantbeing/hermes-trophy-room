from trophy_room_core import catalog as cat
from trophy_room_core import engine
from trophy_room_core.engine import Changes
from trophy_room_core.store import get_store


def run(**kw):
    ch = Changes()
    for m, n in kw.get("bump", {}).items():
        ch.bump(m, n)
    for m, v in kw.get("top", {}).items():
        ch.top(m, v)
    for m, v in kw.get("add", []):
        ch.add(m, v)
    return engine.apply(ch)


def test_tier_crossing_one_event(home):
    out = run(bump={"skill_created": 1})
    assert [p["id"] for p in out] == ["forge_apprentice"]
    p = out[0]
    assert p["tier"] == 0 and p["tiers_gained"] == [0] and p["new"] is True
    assert p["name"] == "Forge Apprentice" and p["glyph"] == "hammer" and p["threshold"] == 1 and p["next"] == 5
    assert home.sent and home.sent[0]["id"] == "forge_apprentice"
    out = run(bump={"skill_created": 4})  # 5 total: Silver
    assert out[0]["tier"] == 1 and out[0]["tiers_gained"] == [1]


def test_multi_tier_jump_is_one_event(home):
    out = run(bump={"skill_created": 40})
    assert len(out) == 1
    assert out[0]["tier"] == 3 and out[0]["tiers_gained"] == [0, 1, 2, 3]
    rows = [r for r in get_store().unlock_rows() if r[0] == "forge_apprentice"]
    assert [r[1] for r in rows] == [0, 1, 2, 3] and all(r[3] == 0 for r in rows)  # written seen=0


def test_sticky_unlocks_never_revoked(home):
    run(bump={"skill_created": 5})
    # unlocks are rows in the database: nothing a later event does can remove them
    assert run(bump={"skill_created": 0}) == []
    st = engine.build_state()
    assert st["progress"]["forge_apprentice"]["tier"] == 1


def test_no_duplicate_event_for_same_tier(home):
    run(bump={"skill_created": 1})
    assert run(bump={"skill_created": 1}) == []  # still Copper (1 -> 2)


def test_secret_discovery_and_masking(home):
    st = engine.build_state()
    p = st["progress"]["spring_cleaning"]
    assert p["state"] == "secret"
    entry = next(a for a in st["catalog"] if a["id"] == "spring_cleaning")
    assert entry["name"] == "Secret trophy" and entry["glyph"] == "star" and entry["secret"] is True
    run(bump={"memory_removals": 1})  # first related signal -> unlocks Copper (threshold 1)
    st = engine.build_state()
    assert st["progress"]["spring_cleaning"]["state"] == "unlocked"
    entry = next(a for a in st["catalog"] if a["id"] == "spring_cleaning")
    assert entry["name"] == "Spring Cleaning"


def test_secret_becomes_discovered_below_first_threshold(home):
    run(bump={"cron_weekend_runs": 0})
    # port_3000_taken thresholds start at 15: value 3 -> discovered, not unlocked
    run(bump={"port_conflict_events": 3})
    st = engine.build_state()
    assert st["progress"]["port_3000_taken"]["state"] == "discovered"
    assert st["progress"]["port_3000_taken"]["value"] == 3


def test_baseline_adds_to_live(home):
    store = get_store()
    with store.tx() as conn:
        conn.execute("INSERT INTO baseline(id,value) VALUES('terminal_goblin', 700)")
    assert engine.build_state()["progress"]["terminal_goblin"]["value"] == 700
    out = run(bump={"total_terminal_calls": 60})  # 700 + 60 >= 750
    assert out and out[0]["id"] == "terminal_goblin" and out[0]["tier"] == 0


def test_baseline_best_session_uses_max(home):
    with get_store().tx() as conn:
        conn.execute("INSERT INTO baseline(id,value) VALUES('let_him_cook', 468)")
    run(top={"max_tool_calls_in_session": 100})
    assert engine.build_state()["progress"]["let_him_cook"]["value"] == 468  # max(468, 100)
    out = run(top={"max_tool_calls_in_session": 520})
    assert out[0]["id"] == "let_him_cook" and out[0]["tier"] == 1


def test_distinct_metric(home):
    run(add=[("platforms", "cli")])
    assert engine.build_state()["progress"]["everywhere_at_once"]["value"] == 1
    run(add=[("platforms", "cli")])  # same value: no double count
    assert engine.build_state()["progress"]["everywhere_at_once"]["value"] == 1
    out = run(add=[("platforms", "telegram")])
    assert out[0]["id"] == "everywhere_at_once" and out[0]["tier"] == 0


def test_multi_condition_unlocks_at_gold(home):
    out = run(bump={"install_error_events": 25})
    assert out == []
    out = run(bump={"install_success_events": 10})
    assert [p["id"] for p in out] == ["dependency_hell_tourist"]
    assert out[0]["tier"] == cat.MULTI_TIER and out[0]["tiers_gained"] == [cat.MULTI_TIER]
    st = engine.build_state()
    assert st["progress"]["dependency_hell_tourist"]["tier"] == 2
    assert st["progress"]["dependency_hell_tourist"]["value"] == 100


def test_trophy_hunter_counts_unlocks(home):
    ids = ["forge_apprentice", "note_to_self", "deja_vu", "squeeze_play", "spring_cleaning", "whetstone",
           "open_book", "card_catalog", "arsenal_inventory", "elephant_never_forgets"]
    metrics = {"forge_apprentice": ("skill_created", 1), "note_to_self": ("memory_tool_calls", 5), "deja_vu": ("session_search_calls", 3),
               "squeeze_play": ("compactions", 1), "spring_cleaning": ("memory_removals", 1), "whetstone": ("skill_patched", 3),
               "open_book": ("skill_views", 10), "arsenal_inventory": ("skill_list_calls", 3), "elephant_never_forgets": ("memory_survived", 1)}
    last = []
    for i, (m, n) in metrics.items():
        last = run(bump={m: n})
    run(add=[("skills_touched", f"s{k}") for k in range(3)])
    out_ids = {r[0] for r in get_store().unlock_rows()}
    assert "trophy_hunter" in out_ids  # 10 trophies reached
    assert any(p["id"] == "trophy_hunter" for p in home.sent)


def test_evaluate_all_after_baseline_is_silent(home):
    with get_store().tx() as conn:
        conn.execute("INSERT INTO baseline(id,value) VALUES('terminal_goblin', 800)")
    out = engine.evaluate_all(seen=1, do_broadcast=False)
    assert any(p["id"] == "terminal_goblin" for p in out)
    assert not home.sent
    assert get_store().unseen() == []


def test_unseen_queue_and_mark_seen(home):
    run(bump={"skill_created": 5, "memory_tool_calls": 5})
    un = get_store().unseen()
    assert {u["id"] for u in un} >= {"forge_apprentice", "note_to_self"}
    assert [u for u in un if u["id"] == "forge_apprentice"][0]["tier"] == 1
    get_store().mark_seen(["forge_apprentice"])
    assert "forge_apprentice" not in {u["id"] for u in get_store().unseen()}
    get_store().mark_seen()
    assert get_store().unseen() == []


def test_state_shape(home):
    st = engine.build_state()
    assert st["version"] == 1 and len(st["catalog"]) == 120
    assert st["totals"] == {"unlocked": 0, "total": 120, "by_tier": [0, 0, 0, 0, 0]}
    assert st["meta"]["legacy_import"] == {"available": False, "done": False}
    assert len(st["meta"]["categories"]) == 18
    p = st["progress"]["let_him_cook"]
    assert set(p) == {"value", "tier", "state", "first_tier", "unlocked_at", "next"}
    assert p["tier"] == -1 and p["state"] == "locked" and p["next"] == 200


def test_broadcast_failure_never_raises(home, monkeypatch):
    import sys, types
    monkeypatch.setattr(engine, "broadcast", engine.real_broadcast)
    boom = types.ModuleType("hermes_cli.plugin_events")

    def broadcast_plugin_event(*a, **k):
        raise RuntimeError("no desktop")
    boom.broadcast_plugin_event = broadcast_plugin_event
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", boom)
    out = engine.apply(Changes(sums={"skill_created": 1}))
    assert out and out[0]["id"] == "forge_apprentice"  # the unlock row is already written
    assert any(r[0] == "forge_apprentice" for r in get_store().unlock_rows())


def test_broadcast_uses_contract_event_name(home, monkeypatch):
    import sys, types
    monkeypatch.setattr(engine, "broadcast", engine.real_broadcast)
    calls = []
    mod = types.ModuleType("hermes_cli.plugin_events")
    mod.broadcast_plugin_event = lambda pid, ev, payload=None: calls.append((pid, ev, payload))
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", mod)
    engine.apply(Changes(sums={"skill_created": 1}))
    assert calls and calls[0][0] == "trophy-room" and calls[0][1] == "unlocked" and calls[0][2]["id"] == "forge_apprentice"


def test_broadcast_survives_system_exit(home, monkeypatch):
    """Importing the gateway outside a Desktop backend can raise RelaunchExit, a SystemExit subclass."""
    import sys, types
    monkeypatch.setattr(engine, "broadcast", engine.real_broadcast)
    boom = types.ModuleType("hermes_cli.plugin_events")

    def broadcast_plugin_event(*a, **k):
        raise SystemExit(0)
    boom.broadcast_plugin_event = broadcast_plugin_event
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", boom)
    out = engine.apply(Changes(sums={"skill_created": 1}))
    assert out and out[0]["id"] == "forge_apprentice"
