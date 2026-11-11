import time

from trophy_room_core import engine, hooks
from trophy_room_core.store import get_store


def unlocked(home):
    return {r[0]: r[1] for r in get_store().unlock_rows()}


def tool(name, args=None, result="ok", sid="s1", **kw):
    hooks.post_tool_call(tool_name=name, args=args or {}, result=result, session_id=sid, **kw)


def counters():
    return get_store().counters()


def test_hooks_table_matches_manifest():
    import re
    from pathlib import Path
    text = (Path(__file__).resolve().parents[1] / "plugin.yaml").read_text(encoding="utf-8")
    declared = re.findall(r"^  - (\w+)$", text.split("provides_hooks:")[1], re.M)
    assert sorted(declared) == sorted(hooks.HOOKS)
    assert "provides_tools" not in text


def test_register_registers_only_hooks():
    import importlib.util
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    spec = importlib.util.spec_from_file_location("trophy_room_plugin", root / "__init__.py", submodule_search_locations=[str(root)])
    plugin = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plugin)

    class Ctx:
        def __init__(self):
            self.hooks, self.tools = {}, []

        def register_hook(self, name, cb, **k):
            self.hooks[name] = cb

        def register_tool(self, *a, **k):
            self.tools.append(a)
    ctx = Ctx()
    plugin.register(ctx)
    assert sorted(ctx.hooks) == sorted(hooks.HOOKS) and ctx.tools == []


def test_skill_manage_create_unlocks_forge_apprentice(home):
    tool("skill_manage", {"action": "create", "name": "release-notes"}, "created")
    assert unlocked(home).get("forge_apprentice") == 0
    assert counters()["skill_created"] == 1
    assert home.sent and home.sent[0]["id"] == "forge_apprentice"


def test_tool_name_counts_and_session_maxima(home):
    for _ in range(3):
        tool("terminal", {"command": "ls"}, "file.txt")
    tool("read_file", {"path": "C:/x/a.py"}, "code")
    tool("web_search", {"query": "x"}, "r")
    c = counters()
    assert c["total_tool_calls"] == 5 and c["total_terminal_calls"] == 3
    assert c["total_file_reads_searches"] == 1 and c["total_web_calls"] == 1
    assert c["max_tool_calls_in_session"] == 5 and c["max_terminal_calls_in_session"] == 3
    assert c["max_distinct_tools_in_session"] == 3
    tool("terminal", sid="s2")
    assert counters()["max_tool_calls_in_session"] == 5  # a shorter session never lowers the best


def test_text_metrics_use_args_and_result(home):
    tool("terminal", {"command": "npm install left-pad"}, "npm ERR! failed: permission denied (EACCES)")
    c = counters()
    assert c["total_errors"] == 1 and c["install_error_events"] == 1
    assert c["permission_denied_events"] >= 1
    tool("terminal", {"command": "npm install x"}, "added 1 package, done")
    assert counters()["install_success_events"] == 1
    tool("terminal", {"command": "npm run dev"}, "Error: port 3000 is already in use EADDRINUSE")
    assert counters()["port_conflict_events"] >= 1
    tool("terminal", {"command": "git commit -m x"}, "ok")
    assert counters()["git_events"] == 1


def test_restart_after_error(home):
    tool("terminal", {"command": "make"}, "build failed")
    tool("terminal", {"command": "systemctl restart app"}, "ok")
    assert counters()["restart_after_error_events"] == 1


def test_session_start_metrics(home):
    hooks.on_session_start(session_id="a", model="openrouter/anthropic/claude-sonnet", platform="telegram")
    hooks.on_session_start(session_id="b", model="ollama/llama3", platform="cli")
    c = counters()
    assert c["session_count"] == 2 and c["telegram_sessions"] == 1 and c["cli_sessions"] == 1
    assert c["platform_sessions"] == 1 and c["local_model_chat_sessions"] == 1
    assert c["claude_events"] >= 1 and c["openrouter_events"] >= 1
    st = engine.build_state()
    assert st["progress"]["everywhere_at_once"]["value"] == 2
    assert st["progress"]["provider_polyglot"]["value"] == 2
    assert st["progress"]["many_hats"]["value"] == 1  # profile "default"


def test_weekend_and_night_sessions(home, monkeypatch):
    sat_midnight = time.struct_time((2026, 11, 7, 0, 30, 0, 5, 311, 0))  # Saturday 00:30
    monkeypatch.setattr(hooks.time, "localtime", lambda *a: sat_midnight)
    hooks.on_session_start(session_id="x", model="m", platform="cli")
    c = counters()
    assert c["weekend_sessions"] == 1 and c["night_sessions"] == 1


def test_kanban_and_platform_hooks(home):
    for _ in range(5):
        hooks.kanban_task_completed(task_id="t")
    hooks.kanban_task_claimed(task_id="t")
    hooks.kanban_task_blocked(task_id="t")
    hooks.gateway_platform_event(platform="telegram", event_type="reaction", payload={})
    c = counters()
    assert c["kanban_completed"] == 5 and c["kanban_claimed"] == 1 and c["kanban_blocked"] == 1 and c["platform_events"] == 1
    u = unlocked(home)
    assert u["task_force"] == 0 and u["roadblock"] == 0 and "group_chat_goblin" not in u  # needs 5 events


def test_hive_mind_three_delegations_in_a_turn(home):
    tool("delegate_task", {"goal": "a"}, turn_id="turn1")
    tool("delegate_task", {"goal": "b"}, turn_id="turn1")
    assert "hive_turns" not in counters()
    tool("delegate_task", {"goal": "c"}, turn_id="turn1")
    tool("delegate_task", {"goal": "d"}, turn_id="turn1")
    assert counters()["hive_turns"] == 1  # counted once per turn
    assert unlocked(home)["hive_mind"] == 0
    tool("delegate_task", {"tasks": [{"goal": "1"}, {"goal": "2"}, {"goal": "3"}]}, turn_id="turn2")
    assert counters()["hive_turns"] == 2
    assert counters()["max_delegations_in_session"] == 7


def test_memory_writes_survive_compaction(home):
    for _ in range(3):
        tool("memory", {"action": "add", "content": "x"})
    assert "memory_survived" not in counters()
    hooks.post_compaction(session_id="s1", old_session_id="s1", before_tokens=120000, after_tokens=30000)
    c = counters()
    assert c["memory_survived"] == 3 and c["compactions"] == 1 and c["max_tokens_saved_in_compaction"] == 90000
    hooks.post_compaction(session_id="s1", old_session_id="s1", before_tokens=100, after_tokens=50)
    assert counters()["memory_survived"] == 3  # nothing new written since
    u = unlocked(home)
    assert u["elephant_never_forgets"] == 0 and u["heavy_lifting"] == 1


def test_memory_batch_and_removals(home):
    tool("memory", {"action": "batch", "operations": [{"action": "remove", "old_text": "a"}, {"action": "add", "content": "b"}]})
    c = counters()
    assert c["memory_removals"] == 1 and c["memory_tool_calls"] == 1
    assert unlocked(home)["spring_cleaning"] == 0


def test_compaction_carries_session_tally_to_new_id(home):
    tool("terminal", sid="old")
    tool("terminal", sid="old")
    hooks.post_compaction(session_id="new", old_session_id="old", before_tokens=10, after_tokens=5)
    tool("terminal", sid="new")
    assert counters()["max_tool_calls_in_session"] == 3


def test_cron_context(home):
    class Ctx:
        def current_cron_execution(self):
            return {"job_id": "nightly"}
    hooks.set_context(Ctx())
    hooks.on_session_start(session_id="c1", model="m", platform="cron")
    assert counters()["cron_runs"] == 1
    assert engine.build_state()["progress"]["many_schedules"]["value"] == 1
    hooks.on_session_end(session_id="c1")
    hooks.set_context(None)
    hooks.on_session_start(session_id="n1", model="m", platform="cli")
    assert counters()["cron_runs"] == 1  # outside cron nothing changes


def test_overnight_cron_end(home, monkeypatch):
    class Ctx:
        def current_cron_execution(self):
            return object()
    hooks.set_context(Ctx())
    night = time.struct_time((2026, 11, 8, 2, 0, 0, 6, 312, 0))  # Sunday 02:00
    monkeypatch.setattr(hooks.time, "localtime", lambda *a: night)
    hooks.on_session_end(session_id="c1")
    c = counters()
    assert c["overnight_cron_runs"] == 1 and c["cron_weekend_runs"] == 1


def test_cronjob_actions(home):
    tool("cronjob", {"action": "create", "schedule": "* * * * *"})
    tool("cronjob", {"action": "pause", "id": "1"})
    c = counters()
    assert c["cron_created"] == 1 and c["cron_managed"] == 1 and c["total_cron_calls"] == 2
    assert unlocked(home)["set_it_and_forget_it"] == 0


def test_media_and_browser_tools(home):
    tool("image_generate", {"prompt": "x"})
    tool("video_generate", {"prompt": "x"})
    tool("text_to_speech", {"text": "hello there"})
    tool("computer_use", {"action": "click"})
    tool("browser_cdp", {"x": 1})
    tool("browser_vault", {"x": 1})
    tool("vision_analyze", {"image": "a"})
    c = counters()
    assert c["image_generate_calls"] == 1 and c["video_generate_calls"] == 1 and c["tts_chars"] == 11 and c["tts_calls"] == 1
    assert c["computer_use_calls"] == 1 and c["browser_cdp_calls"] == 1 and c["browser_vault_calls"] == 1 and c["browser_sessions"] == 1
    assert c["max_media_in_session"] == 2
    u = unlocked(home)
    for k in ("directors_cut", "ghost_in_the_browser", "vault_opener", "tab_hoarder"):
        assert u[k] == 0, k


def test_mcp_and_plugin_tools(home):
    tool("mcp_github_list_issues", {})
    tool("mcp__linear__search", {})
    tool("my_plugin_tool", {})
    tool("tool_search", {"q": "x"})
    c = counters()
    assert c["mcp_calls"] == 2 and c["plugin_tool_calls"] == 1 and c["tool_bridge_calls"] == 1
    st = engine.build_state()
    assert st["progress"]["many_doors"]["value"] == 2
    assert st["progress"]["tool_collector"]["value"] == 4


def test_hooks_never_raise_on_garbage(home):
    hooks.post_tool_call()
    hooks.post_tool_call(tool_name=None, args=object(), result=object(), session_id=None)
    hooks.on_session_start(session_id=None, model=None, platform=None)
    hooks.on_session_end()
    hooks.post_compaction(before_tokens="x", after_tokens=None)
    hooks.post_llm_call(session_id=12)
    hooks.kanban_task_completed()
    assert counters()["total_tool_calls"] == 2


def test_hooks_survive_a_broken_store(home, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("db gone")
    monkeypatch.setattr(engine, "apply", boom)
    tool("terminal")  # must not raise
    hooks.on_session_start(session_id="z", model="m", platform="cli")


def test_hook_cost_is_a_few_milliseconds(home):
    big = "line of output with an error and a tool call and git status and docs " * 250  # ~17k chars
    tool("terminal", {"command": "echo"}, big)  # warm up: opens the db
    start = time.perf_counter()
    n = 40
    for i in range(n):
        tool("terminal", {"command": f"cmd {i}"}, big)
    per_call_ms = (time.perf_counter() - start) * 1000 / n
    print(f"post_tool_call: {per_call_ms:.2f} ms per call")
    assert per_call_ms < 25


def test_tool_call_writes_coalesce_and_flush(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)
    for _ in range(10):
        tool("terminal", {"command": "ls"}, "ok")
    assert counters().get("total_tool_calls", 0) == 0  # still pending in memory
    hooks.flush()
    assert counters()["total_tool_calls"] == 10
    hooks.flush()  # nothing pending: harmless
    assert counters()["total_tool_calls"] == 10


def test_timer_flushes_without_another_hook(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 0.15)
    tool("skill_manage", {"action": "create", "name": "x"}, "created")
    assert "forge_apprentice" not in unlocked(home)
    deadline = time.time() + 3
    while time.time() < deadline and "forge_apprentice" not in unlocked(home):
        time.sleep(0.05)
    assert unlocked(home).get("forge_apprentice") == 0


def test_every_hook_queues_instead_of_writing_in_the_agent_thread(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)
    hooks.on_session_start(session_id="s1", model="m", platform="telegram")
    tool("terminal", {"command": "ls"}, "ok")
    hooks.post_llm_call(session_id="s1")
    hooks.kanban_task_completed(task_id="t")
    hooks.kanban_task_claimed(task_id="t")
    hooks.kanban_task_blocked(task_id="t")
    hooks.gateway_platform_event(platform="telegram")
    hooks.post_compaction(session_id="s1", old_session_id="s1", before_tokens=10, after_tokens=5)
    hooks.on_session_end(session_id="s1")
    assert counters() == {}  # nothing written yet
    assert hooks._TIMER is not None  # one timer is armed
    hooks.flush()
    c = counters()
    assert c["session_count"] == 1 and c["total_tool_calls"] == 1 and c["kanban_completed"] == 1
    assert c["kanban_claimed"] == 1 and c["kanban_blocked"] == 1 and c["platform_events"] == 1 and c["compactions"] == 1


def test_default_cost_with_coalescing(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)
    big = "line of output with an error and a tool call and git status and docs " * 250
    tool("terminal", {"command": "echo"}, big)
    start = time.perf_counter()
    for i in range(40):
        tool("terminal", {"command": f"cmd {i}"}, big)
    ms = (time.perf_counter() - start) * 1000 / 40
    print(f"coalesced post_tool_call: {ms:.2f} ms per call")
    typical = "ok " * 80
    start = time.perf_counter()
    for i in range(200):
        tool("read_file", {"path": f"/tmp/f{i}.txt"}, typical)
    ms2 = (time.perf_counter() - start) * 1000 / 200
    print(f"typical post_tool_call: {ms2:.2f} ms per call")
    assert ms < 15 and ms2 < 3
    hooks.flush()


# ---- review fixes ----
def test_failed_write_is_put_back_and_retried(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)
    real = engine.apply
    calls = {"n": 0}

    def flaky(ch, *a, **k):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("database is locked")
        return real(ch, *a, **k)
    monkeypatch.setattr(engine, "apply", flaky)
    for _ in range(4):
        tool("terminal", {"command": "ls"}, "ok")
    hooks.flush()
    assert hooks._PENDING is not None and hooks._PENDING.tries == 1  # kept, not dropped
    tool("terminal", {"command": "ls"}, "ok")  # new calls merge into the kept batch
    hooks.flush()
    assert hooks._PENDING is not None and hooks._PENDING.tries == 2
    hooks.flush()  # third attempt succeeds
    assert hooks._PENDING is None
    assert counters()["total_tool_calls"] == 5  # nothing lost along the way


def test_batch_is_dropped_after_three_failures(home, monkeypatch):
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)

    def boom(*a, **k):
        raise RuntimeError("db gone")
    monkeypatch.setattr(engine, "apply", boom)
    tool("terminal", {"command": "ls"}, "ok")
    for _ in range(3):
        hooks.flush()
    assert hooks._PENDING is None and hooks._TIMER is None


def test_flush_waits_for_a_write_in_flight(home, monkeypatch):
    import threading
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 30.0)
    tool("terminal", {"command": "ls"}, "ok")
    gate = threading.Event()
    real = engine.apply
    started = threading.Event()

    def slow(ch, *a, **k):
        started.set()
        gate.wait(5)
        return real(ch, *a, **k)
    monkeypatch.setattr(engine, "apply", slow)
    timer_like = threading.Thread(target=hooks.flush)  # stands in for the Timer thread
    timer_like.start()
    assert started.wait(3)
    done = threading.Event()
    exit_flush = threading.Thread(target=lambda: (hooks.flush(), done.set()))  # stands in for atexit
    exit_flush.start()
    assert not done.wait(0.4)  # blocked while the other write is mid-transaction
    gate.set()
    assert done.wait(5)
    timer_like.join()
    assert counters()["total_tool_calls"] == 1


def test_tally_does_not_hold_the_module_lock_during_the_db_read(home, monkeypatch):
    import threading
    from trophy_room_core import store as store_mod
    seen = {}

    def slow_read(self, sid):
        def probe():  # can another thread take the module lock while this DB read is running?
            ok = hooks._LOCK.acquire(timeout=1)
            seen["free"] = ok
            if ok:
                hooks._LOCK.release()
        t = threading.Thread(target=probe)
        t.start()
        t.join()
        return None
    monkeypatch.setattr(store_mod.Store, "session_get", slow_read)
    hooks._tally("brand-new-session")
    assert seen["free"] is True


def test_hive_mind_counts_each_turn_without_turn_ids(home):
    for _ in range(3):
        tool("delegate_task", {"goal": "x"})  # no turn_id: the key falls back to the session
    assert counters()["hive_turns"] == 1
    for _ in range(2):
        tool("delegate_task", {"goal": "x"})
    assert counters()["hive_turns"] == 1  # same turn: 5 delegations still count once
    hooks.post_llm_call(session_id="s1")  # turn boundary
    for _ in range(3):
        tool("delegate_task", {"goal": "x"})
    assert counters()["hive_turns"] == 2
    hooks.on_session_end(session_id="s1")  # also a boundary
    for _ in range(3):
        tool("delegate_task", {"goal": "x"})
    assert counters()["hive_turns"] == 3


def test_plugin_hand_is_earned_from_plugin_and_mcp_tools(home):
    tool("terminal", {"command": "ls"})
    tool("read_file", {"path": "a"})
    assert engine.build_state()["progress"]["plugin_hand"]["value"] == 0  # core tools do not count
    tool("my_plugin_tool", {})
    tool("mcp_github_list_issues", {})
    tool("some__namespaced_tool", {})
    tool("my_plugin_tool", {})  # same tool again: no double count
    p = engine.build_state()["progress"]["plugin_hand"]
    assert p["value"] == 3 and p["tier"] == 1
    assert unlocked(home)["plugin_hand"] == 1


def test_prune_runs_through_the_queue(home, monkeypatch):
    monkeypatch.setattr(hooks, "_ENDS", 49)
    hooks.on_session_end(session_id="p1")
    from trophy_room_core.store import get_store
    assert get_store().session_get("p1") is not None  # persisted by the end-of-session flush


def test_reset_clears_in_memory_state(home):
    tool("terminal", {"command": "ls"})
    tool("delegate_task", {"goal": "x"})
    assert hooks._SESSIONS and hooks._TURNS
    hooks.reset_memory_state()
    assert not hooks._SESSIONS and not hooks._TURNS and hooks._PENDING is None
