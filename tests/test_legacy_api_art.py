import base64
import json
import sys
from pathlib import Path

import pytest

from trophy_room_core import art, engine, legacy
from trophy_room_core.store import get_store


def write_legacy(home, snapshot=True):
    d = home / "plugins" / "hermes-achievements"
    d.mkdir(parents=True)
    state = {"unlocks": {
        "let_him_cook": {"evidence": None, "first_tier": "Copper", "unlocked_at": 1781962237},
        "night_shift_operator": {"evidence": None, "first_tier": "Silver", "unlocked_at": 1782510295},
        "full_send": {"evidence": None, "first_tier": None, "unlocked_at": 1782820336},
        "not_in_our_catalog": {"first_tier": "Gold", "unlocked_at": 1},
    }}
    (d / "state.json").write_text(json.dumps(state), encoding="utf-8")
    if snapshot:
        snap = {"generated_at": 1783000000, "achievements": [
            {"id": "let_him_cook", "state": "unlocked", "tier": "Copper", "progress": 468},
            {"id": "night_shift_operator", "state": "unlocked", "tier": "Gold", "progress": 415},
            {"id": "full_send", "state": "unlocked", "tier": None, "progress": 100},
            {"id": "terminal_goblin", "state": "discovered", "tier": None, "progress": 300},
        ]}
        (d / "scan_snapshot.json").write_text(json.dumps(snap), encoding="utf-8")
    return d


def test_legacy_import(home):
    d = write_legacy(home)
    before = {p.name: p.read_bytes() for p in d.iterdir()}
    r = legacy.import_legacy()
    assert r["ok"] and r["imported"] == 3 and r["already"] == 0
    rows = get_store().unlock_rows()
    by = {}
    for id_, tier, at, seen in rows:
        by.setdefault(id_, []).append((tier, at, seen))
    assert [t for t, _, _ in by["let_him_cook"]] == [0]
    assert [t for t, _, _ in by["night_shift_operator"]] == [0, 1, 2]  # snapshot tier Gold beats first_tier Silver
    assert by["night_shift_operator"][0][1] == 1782510295  # original date kept
    assert [t for t, _, _ in by["full_send"]] == [2]  # multi-condition unlocks at Gold
    assert all(seen == 1 for v in by.values() for _, _, seen in v)
    assert "not_in_our_catalog" not in by
    assert get_store().unseen() == [] and not home.sent  # no pop-ups
    st = engine.build_state()
    assert st["progress"]["let_him_cook"]["value"] == 468
    assert st["progress"]["terminal_goblin"]["state"] == "discovered"  # baseline from a not-yet-unlocked entry
    assert st["meta"]["legacy_import"] == {"available": True, "done": True}
    assert {p.name: p.read_bytes() for p in d.iterdir()} == before  # read only


def test_legacy_import_is_idempotent(home):
    write_legacy(home)
    legacy.import_legacy()
    n = len(get_store().unlock_rows())
    r = legacy.import_legacy()
    assert r["ok"] and r["imported"] == 0 and r["already"] == 3
    assert len(get_store().unlock_rows()) == n


def test_legacy_import_without_snapshot_uses_first_tier(home):
    write_legacy(home, snapshot=False)
    legacy.import_legacy()
    tiers = {}
    for id_, t, _a, _s in get_store().unlock_rows():
        tiers.setdefault(id_, []).append(t)
    assert tiers["night_shift_operator"] == [0, 1]


def test_legacy_import_missing_or_broken(home):
    r = legacy.import_legacy()
    assert r["ok"] is False and r["imported"] == 0
    d = home / "plugins" / "hermes-achievements"
    d.mkdir(parents=True)
    (d / "state.json").write_text("{nope", encoding="utf-8")
    assert legacy.import_legacy()["ok"] is False


def test_live_counting_adds_to_baseline_after_import(home):
    write_legacy(home)
    legacy.import_legacy()
    from trophy_room_core.engine import Changes
    out = engine.apply(Changes(sums={"total_terminal_calls": 500}))  # 300 baseline + 500 live >= 750
    assert any(p["id"] == "terminal_goblin" and p["tier"] == 0 for p in out)


# ---- art ----
def test_art_lookup(home, tmp_path_factory, monkeypatch):
    d = tmp_path_factory.mktemp("art")
    (d / "icons").mkdir()
    monkeypatch.setattr(art, "ART_DIR", d)
    assert art.art_payload("let_him_cook") == {"uri": None, "icon_path": None}
    assert art.art_ids() == []
    (d / "let_him_cook.webp").write_bytes(b"RIFFxxxxWEBP")
    (d / "icons" / "let_him_cook.png").write_bytes(b"\x89PNG")
    (d / "forge_apprentice.png").write_bytes(b"\x89PNGdata")
    p = art.art_payload("let_him_cook")
    assert p["uri"] == "data:image/webp;base64," + base64.b64encode(b"RIFFxxxxWEBP").decode()
    assert p["icon_path"] == str(d / "icons" / "let_him_cook.png")
    q = art.art_payload("forge_apprentice")
    assert q["uri"].startswith("data:image/png;base64,") and q["icon_path"] == str(d / "forge_apprentice.png")
    assert sorted(art.art_ids()) == ["forge_apprentice", "let_him_cook"]


def test_art_rejects_bad_ids(home):
    for bad in ("../x", "nope", "LET_HIM_COOK", "let_him_cook/../../x", ""):
        assert art.find_art(bad) is None
        assert not art.valid_id(bad)


# ---- REST ----
@pytest.fixture
def client(home):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dashboard"))
    import importlib
    import plugin_api
    importlib.reload(plugin_api)
    app = FastAPI()
    app.include_router(plugin_api.router, prefix="/api/plugins/trophy-room")
    return TestClient(app)


B = "/api/plugins/trophy-room"


def test_api_state_and_seen(client, home):
    r = client.get(f"{B}/state")
    assert r.status_code == 200
    s = r.json()
    assert s["version"] == 1 and len(s["catalog"]) == 120 and s["unseen"] == []
    from trophy_room_core.engine import Changes
    engine.apply(Changes(sums={"skill_created": 1, "memory_tool_calls": 5}))
    s = client.get(f"{B}/state").json()
    assert {u["id"] for u in s["unseen"]} == {"forge_apprentice", "note_to_self"}
    assert s["totals"]["unlocked"] == 2 and s["totals"]["by_tier"][0] == 2
    assert client.post(f"{B}/seen", json={"ids": ["forge_apprentice"]}).json() == {"ok": True}
    assert {u["id"] for u in client.get(f"{B}/state").json()["unseen"]} == {"note_to_self"}
    assert client.post(f"{B}/seen", json={}).json() == {"ok": True}
    assert client.get(f"{B}/state").json()["unseen"] == []


def test_api_signal(client, home):
    r = client.post(f"{B}/signal", json={"key": "trophy_room_open"})
    assert r.status_code == 200 and r.json()["unlocked"] == ["trophy_room"]
    for p in ("chat", "skills", "settings"):
        client.post(f"{B}/signal", json={"key": "page_visit", "value": p})
    client.post(f"{B}/signal", json={"key": "profile_seen", "value": "work"})
    client.post(f"{B}/signal", json={"key": "plugin_count", "value": 3})
    s = client.get(f"{B}/state").json()["progress"]
    assert s["sightseer"]["value"] == 3 and s["sightseer"]["tier"] == 0
    assert s["wardrobe_change"]["value"] == 1
    assert s["plugin_hand"]["tier"] == -1  # plugin_count is accepted but earns nothing now
    assert s["tinkerer"]["value"] == 1 and s["tinkerer"]["state"] == "discovered"
    assert client.post(f"{B}/signal", json={"key": "nope"}).status_code == 400
    assert client.post(f"{B}/signal", json={"key": "page_visit"}).status_code == 400
    assert client.post(f"{B}/signal", json={"key": "plugin_count", "value": "x"}).status_code == 400


def test_api_import_legacy_and_reset(client, home):
    assert client.post(f"{B}/import-legacy").json()["ok"] is False
    write_legacy(home)
    s = client.get(f"{B}/state").json()
    assert s["meta"]["legacy_import"] == {"available": True, "done": False}
    r = client.post(f"{B}/import-legacy").json()
    assert r["ok"] and r["imported"] == 3
    assert client.get(f"{B}/state").json()["totals"]["unlocked"] >= 3
    assert client.post(f"{B}/reset", json={"confirm": "no"}).status_code == 400
    assert client.post(f"{B}/reset", json={"confirm": "reset"}).json() == {"ok": True}
    assert client.get(f"{B}/state").json()["totals"]["unlocked"] == 0


def test_api_art(client, home, tmp_path_factory, monkeypatch):
    d = tmp_path_factory.mktemp("art2")
    monkeypatch.setattr(art, "ART_DIR", d)
    assert client.get(f"{B}/art-index").json() == {"ids": []}
    assert client.get(f"{B}/art/let_him_cook").json() == {"uri": None, "icon_path": None}
    (d / "let_him_cook.webp").write_bytes(b"RIFFabcdWEBP")
    assert client.get(f"{B}/art-index").json() == {"ids": ["let_him_cook"]}
    assert client.get(f"{B}/art/let_him_cook").json()["uri"].startswith("data:image/webp;base64,")
    assert client.get(f"{B}/art/not_a_real_id").status_code == 404


def test_store_fallback_when_plugin_db_missing(home, monkeypatch):
    from trophy_room_core import store
    store.close_all()
    monkeypatch.setitem(sys.modules, "plugins.plugin_storage", None)  # import fails
    s = store.get_store()
    from trophy_room_core.engine import Changes
    engine.apply(Changes(sums={"skill_created": 1}))
    assert (home / "plugin-data" / "trophy-room" / "data.db").exists()
    assert any(r[0] == "forge_apprentice" for r in s.unlock_rows())


def test_data_lives_under_the_temp_home(home):
    from trophy_room_core.engine import Changes
    engine.apply(Changes(sums={"skill_created": 1}))
    assert (home / "plugin-data" / "trophy-room" / "data.db").exists()


def test_signal_plugin_count_is_still_accepted(client, home):
    assert client.post(f"{B}/signal", json={"key": "plugin_count", "value": 4}).json()["ok"] is True
    assert get_store().counters(["plugin_count"])["plugin_count"] == 4


def test_second_import_is_refused(home):
    write_legacy(home)
    legacy.import_legacy()
    n = len(get_store().unlock_rows())
    r = legacy.import_legacy()
    assert r["ok"] is True and r["imported"] == 0 and r["already"] == 3 and r["note"] == "already imported"
    assert len(get_store().unlock_rows()) == n


def test_import_does_not_double_count_live_progress(home):
    from trophy_room_core.engine import Changes
    engine.apply(Changes(sums={"total_terminal_calls": 200}))  # we already counted 200 live
    write_legacy(home)  # the snapshot says the dashboard saw 300 terminal calls (discovered)
    legacy.import_legacy()
    assert get_store().baselines()["terminal_goblin"] == 100  # 300 minus the 200 already counted
    assert engine.build_state()["progress"]["terminal_goblin"]["value"] == 300
    engine.apply(Changes(sums={"total_terminal_calls": 450}))  # 300 + 450 = 750: Copper
    assert engine.build_state()["progress"]["terminal_goblin"]["tier"] == 0


def test_distinct_baseline_takes_the_larger_value_not_the_sum(home):
    from trophy_room_core.engine import Changes
    with get_store().tx() as conn:
        conn.execute("INSERT INTO baseline(id,value) VALUES('provider_polyglot', 4)")
    engine.apply(Changes(distinct=[("distinct_provider_count", "a"), ("distinct_provider_count", "b")]))
    assert engine.build_state()["progress"]["provider_polyglot"]["value"] == 4  # max(2, 4), not 6
    engine.apply(Changes(distinct=[(("distinct_provider_count"), f"p{i}") for i in range(5)]))
    assert engine.build_state()["progress"]["provider_polyglot"]["value"] == 7


def test_art_size_cap(home, tmp_path_factory, monkeypatch):
    d = tmp_path_factory.mktemp("art3")
    monkeypatch.setattr(art, "ART_DIR", d)
    assert art.MAX_BYTES == 600 * 1024
    (d / "let_him_cook.webp").write_bytes(b"x" * (60 * 1024))
    (d / "forge_apprentice.webp").write_bytes(b"x" * (601 * 1024))
    assert art.art_payload("let_him_cook")["uri"] is not None
    assert art.art_payload("forge_apprentice")["uri"] is None


def test_secret_art_stays_hidden_until_discovered(client, home, tmp_path_factory, monkeypatch):
    d = tmp_path_factory.mktemp("art4")
    monkeypatch.setattr(art, "ART_DIR", d)
    (d / "spring_cleaning.webp").write_bytes(b"RIFFabcdWEBP")  # a secret entry (memory removals)
    (d / "let_him_cook.webp").write_bytes(b"RIFFabcdWEBP")  # a normal one
    assert client.get(f"{B}/art-index").json() == {"ids": ["let_him_cook"]}
    assert client.get(f"{B}/art/spring_cleaning").json() == {"uri": None, "icon_path": None}
    assert client.get(f"{B}/art/let_him_cook").json()["uri"] is not None
    from trophy_room_core.engine import Changes
    engine.apply(Changes(sums={"memory_removals": 1}))  # first sign: it is discovered now
    assert set(client.get(f"{B}/art-index").json()["ids"]) == {"let_him_cook", "spring_cleaning"}
    assert client.get(f"{B}/art/spring_cleaning").json()["uri"].startswith("data:image/webp;base64,")


def test_reset_endpoint_clears_memory_so_nothing_re_unlocks(client, home):
    from trophy_room_core import hooks
    hooks.post_tool_call(tool_name="skill_manage", args={"action": "create", "name": "x"}, result="ok", session_id="r1")
    assert get_store().unlock_rows()
    assert hooks._SESSIONS
    assert client.post(f"{B}/reset", json={"confirm": "reset"}).json() == {"ok": True}
    assert not hooks._SESSIONS and not hooks._TURNS and hooks._PENDING is None
    assert get_store().unlock_rows() == []
    hooks.post_tool_call(tool_name="terminal", args={}, result="ok", session_id="r1")
    assert get_store().counters()["max_tool_calls_in_session"] == 1  # the old tally (1 call) did not carry over
