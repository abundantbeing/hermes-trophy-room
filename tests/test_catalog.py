from collections import Counter

from trophy_room_core import catalog as cat

# ids of the dashboard plugin's catalog that we keep as unlock keys
LEGACY_IDS = {
    "let_him_cook", "autonomous_avalanche", "toolchain_maxxer", "full_send", "subagent_commander",
    "background_process_enjoyer", "cron_necromancer", "red_text_connoisseur", "stack_trace_sommelier",
    "actually_read_the_logs", "port_3000_taken", "permission_denied_any_percent", "dependency_hell_tourist",
    "the_fix_was_restarting", "forgot_the_env_var", "yaml_colon_incident", "docker_name_collision",
    "supposed_to_be_quick", "one_more_small_change", "vibe_architect", "pixel_goblin", "ship_first_ask_later",
    "css_exorcist", "one_character_fix", "skillsmith", "skill_issue_skill_created", "memory_keeper",
    "memory_palace", "context_dragon", "gateway_dweller", "plugin_goblin", "rollback_wizard",
    "rabbit_hole_certified", "citation_goblin", "docs_archaeologist", "browser_possession", "terminal_goblin",
    "patch_wizard", "file_archaeologist", "image_whisperer", "voice_of_the_machine", "model_hopper",
    "openrouter_enjoyer", "codex_conjurer", "multi_model_mage", "five_model_flight", "provider_polyglot",
    "model_sommelier", "claude_confidant", "gemini_cartographer", "open_weights_pilgrim", "toolset_cartographer",
    "config_surgeon", "rebase_acrobat", "test_suite_tamer", "screenshot_hunter", "marathon_operator",
    "weekend_warrior", "night_shift_operator", "cache_hit_appreciator",
}
NEW_CATEGORIES = ["Skills & Learning", "Memory", "Profiles & Bots", "Cron & Automation", "Plugins & MCP",
                  "Desktop", "Messaging", "Kanban & Subagents", "Browser & Computer Use", "Media & Voice"]


def test_counts():
    assert len(cat.CATALOG) == 120
    assert len(cat.LEGACY) == 60 and len(cat.NEW) == 60
    assert len({a["id"] for a in cat.CATALOG}) == 120


def test_legacy_ids_are_the_dashboard_ids():
    assert {a["id"] for a in cat.LEGACY} == LEGACY_IDS


def test_new_categories_have_six_each():
    counts = Counter(a["category"] for a in cat.NEW)
    assert sorted(counts) == sorted(NEW_CATEGORIES)
    assert set(counts.values()) == {6}


def test_thresholds_five_ascending_or_multi():
    for a in cat.CATALOG:
        if a["kind"] == "multi_condition":
            assert a["thresholds"] == [] and a["requirements"], a["id"]
        else:
            t = a["thresholds"]
            assert len(t) == 5, a["id"]
            assert all(x < y for x, y in zip(t, t[1:])), a["id"]
            assert a["metric"], a["id"]


def test_glyphs_and_text():
    for a in cat.CATALOG:
        assert a["glyph"] in cat.GLYPHS, a["id"]
        assert a["name"] and a["description"] and a["how"], a["id"]
        assert "—" not in a["name"] + a["description"] + a["how"], a["id"]  # no em dashes in UI text
        assert a["kind"] in ("lifetime", "best_session", "multi_condition", "distinct")
        assert a["source"] in ("legacy", "new")
        assert a["id"] != "hermes-achievements"


def test_kinds_follow_metric_type():
    for a in cat.CATALOG:
        if a["metric"]:
            mt = cat.metric_type(a["metric"])
            assert (a["kind"] == "best_session") == (a["metric"].startswith("max_")), a["id"]
            assert (a["kind"] == "distinct") == (mt == "distinct"), a["id"]


def test_secret_flags_and_categories():
    assert sum(1 for a in cat.CATALOG if a["secret"]) >= 10
    assert len(cat.CATEGORIES) == 18


def test_tier_helpers():
    assert cat.tier_for([5, 10, 20, 40, 80], 4) == -1
    assert cat.tier_for([5, 10, 20, 40, 80], 10) == 1
    assert cat.tier_for([5, 10, 20, 40, 80], 9999) == 4
    assert cat.next_threshold([5, 10, 20, 40, 80], -1) == 5
    assert cat.next_threshold([5, 10, 20, 40, 80], 4) is None
