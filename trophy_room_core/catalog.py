"""Trophy Room achievement catalog: 120 entries.

60 legacy entries keep the ids, names, categories, thresholds and secret flags of the dashboard
plugin ``hermes-achievements`` by @PCinkusz (https://github.com/PCinkusz/hermes-achievements, MIT),
which ships bundled with Hermes Agent. The ids are the unlock keys, so they never change.
Live counting approximates that plugin's history scan: tool-name counts come from tool names, the
text metrics run the same regexes over each tool call's arguments and result, and the session
metrics come from per-session tallies.

60 entries are new: six in each of ten categories (the Desktop category holds five Desktop-signal
trophies plus the meta trophy "Trophy Hunter"). Each is earned from a real event.

A tiered entry has five thresholds (Copper, Silver, Gold, Diamond, Olympian). A multi-condition
entry has none: it unlocks once, at the Gold tier, when every requirement is met.
"""
from __future__ import annotations

from typing import Any, Optional

TIER_NAMES = ["Copper", "Silver", "Gold", "Diamond", "Olympian"]
MULTI_TIER = 2  # a multi-condition entry unlocks once, at Gold

GLYPHS = frozenset(
    "flame wing clock nodes key crystal hammer term eye chat board crown moon cog mic globe hand star "
    "shield scroll bug plug puzzle book brain cloud bolt lock rocket branch container image film "
    "speaker compass hourglass bell cube wrench feather laurel".split()
)

# Metrics stored as a set of distinct values: their value is the set's size.
DISTINCT_METRICS = frozenset({
    "distinct_model_count", "distinct_provider_count", "platforms", "profiles", "skills_touched",
    "mcp_servers", "tools_ever", "ext_tools", "cron_jobs", "pages", "bot_days",
})
# Metrics stored as a running maximum rather than a sum, besides every ``max_*`` metric.
MAX_METRICS = frozenset({"plugin_count"})
# Metrics computed from other tables.
DERIVED_METRICS = frozenset({"total_unlocked"})

# Labels for requirement lines of multi-condition entries and the `how` text of tiered ones.
METRIC_LABELS = {
    "max_terminal_calls_in_session": "terminal calls in one session",
    "max_file_tool_calls_in_session": "file/search/patch calls in one session",
    "max_web_browser_calls_in_session": "web search/extract or browser calls in one session",
    "install_error_events": "package-install failures",
    "install_success_events": "successful package installs after package work",
    "restart_after_error_events": "restart/reload actions after error clusters",
    "total_errors": "error/failed/traceback messages observed",
    "git_events": "git workflow commands",
    "max_tool_calls_in_session": "tool calls in one session",
    "tiny_patch_after_errors_events": "tiny typo-style fixes after error clusters",
    "skill_created": "skills created",
    "skill_patched": "skill edits",
    "skill_views": "skills opened",
    "image_generate_calls": "images generated",
    "video_generate_calls": "videos generated",
    "tts_calls": "text-to-speech or voice tool calls",
}


def _tier(id: str, name: str, description: str, category: str, glyph: str, metric: str,
          thresholds: list[int], how: str, secret: bool = False, source: str = "legacy") -> dict[str, Any]:
    if metric.startswith("max_"):
        kind = "best_session"
    elif metric in DISTINCT_METRICS:
        kind = "distinct"
    else:
        kind = "lifetime"
    return {"id": id, "name": name, "description": description, "category": category, "glyph": glyph,
            "secret": secret, "kind": kind, "metric": metric, "thresholds": list(thresholds),
            "how": how, "source": source, "requirements": None}


def _multi(id: str, name: str, description: str, category: str, glyph: str,
           reqs: list[tuple[str, int, str]], secret: bool = False, source: str = "legacy") -> dict[str, Any]:
    return {"id": id, "name": name, "description": description, "category": category, "glyph": glyph,
            "secret": secret, "kind": "multi_condition", "metric": None, "thresholds": [],
            "how": "; ".join(f"{label} >= {gte:,}" for _, gte, label in reqs), "source": source,
            "requirements": [{"metric": m, "gte": gte, "label": label} for m, gte, label in reqs]}


def _ntier(*a: Any, **k: Any) -> dict[str, Any]:
    return _tier(*a, source="new", **k)


def _nmulti(*a: Any, **k: Any) -> dict[str, Any]:
    return _multi(*a, source="new", **k)


LEGACY: list[dict[str, Any]] = [
    _tier('let_him_cook', 'Let Him Cook', 'Let Hermes run a serious autonomous tool chain in one session.', 'Agent Autonomy', 'flame', 'max_tool_calls_in_session', [200, 500, 1200, 3000, 8000], 'Tool calls in one session'),
    _tier('autonomous_avalanche', 'Autonomous Avalanche', 'Accumulate a lifetime avalanche of Hermes tool calls across sessions.', 'Agent Autonomy', 'bolt', 'total_tool_calls', [1000, 3000, 8000, 20000, 50000], 'Lifetime Hermes tool calls'),
    _tier('toolchain_maxxer', 'Toolchain Maxxer', 'Use a wide spread of distinct Hermes tools in one session.', 'Agent Autonomy', 'nodes', 'max_distinct_tools_in_session', [18, 28, 45, 70, 100], 'Distinct Hermes tools used in one session'),
    _multi('full_send', 'Full Send', 'Terminal, files, and web/browser all get involved in one real run.', 'Agent Autonomy', 'rocket', [('max_terminal_calls_in_session', 180, 'terminal calls in one session'), ('max_file_tool_calls_in_session', 120, 'file/search/patch calls in one session'), ('max_web_browser_calls_in_session', 60, 'web search/extract or browser calls in one session')]),
    _tier('subagent_commander', 'Subagent Commander', 'Coordinate delegated agent work.', 'Agent Autonomy', 'branch', 'total_delegate_calls', [5, 40, 100, 1000, 5000], 'Lifetime delegate_task calls'),
    _tier('background_process_enjoyer', 'Background Process Enjoyer', 'Start or control enough long-running processes to deserve the title.', 'Agent Autonomy', 'cog', 'total_process_calls', [300, 800, 2000, 6000, 15000], 'Lifetime background process operations'),
    _tier('cron_necromancer', 'Cron Necromancer', 'Raise scheduled autonomous jobs from the dead.', 'Agent Autonomy', 'clock', 'total_cron_calls', [1000, 3000, 8000, 20000, 50000], 'Lifetime scheduled-job operations'),
    _tier('red_text_connoisseur', 'Red Text Connoisseur', 'Encounter enough errors to develop a palate for red text.', 'Debugging Chaos', 'bug', 'total_errors', [1500, 4000, 10000, 25000, 75000], 'Error/failed/traceback messages observed'),
    _tier('stack_trace_sommelier', 'Stack Trace Sommelier', 'Taste tracebacks by the flight, not by the sip.', 'Debugging Chaos', 'scroll', 'traceback_events', [300, 1000, 3000, 8000, 20000], 'Traceback or exception mentions'),
    _tier('actually_read_the_logs', 'Actually Read The Logs', 'Inspect logs repeatedly instead of guessing.', 'Debugging Chaos', 'book', 'log_read_events', [1000, 3000, 8000, 20000, 50000], 'Log inspections'),
    _tier('port_3000_taken', 'Port 3000 Is Taken', 'Discover dev-server port conflict patterns enough times to become numb.', 'Debugging Chaos', 'plug', 'port_conflict_events', [15, 40, 100, 300, 1000], 'Dev-server port conflict detections', secret=True),
    _tier('permission_denied_any_percent', 'Permission Denied Any%', 'Speedrun into permission walls.', 'Debugging Chaos', 'lock', 'permission_denied_events', [25, 75, 200, 600, 1500], 'Permission-denied errors', secret=True),
    _multi('dependency_hell_tourist', 'Dependency Hell Tourist', 'Package installs fail, then somehow life continues.', 'Debugging Chaos', 'cube', [('install_error_events', 25, 'package-install failures'), ('install_success_events', 10, 'successful package installs after package work')]),
    _multi('the_fix_was_restarting', 'The Fix Was Restarting It', 'Restart after enough error clusters to call it a technique.', 'Debugging Chaos', 'hourglass', [('restart_after_error_events', 50, 'restart/reload actions after error clusters'), ('total_errors', 4000, 'error/failed/traceback messages observed')]),
    _tier('forgot_the_env_var', 'Forgot The Env Var', 'Auth or configuration failed because an environment variable was missing.', 'Debugging Chaos', 'key', 'env_var_error_events', [5000, 15000, 40000, 100000, 250000], 'Missing auth/config/environment-variable events', secret=True),
    _tier('yaml_colon_incident', 'YAML Colon Incident', 'Configuration syntax bites back.', 'Debugging Chaos', 'scroll', 'yaml_error_events', [1000, 3000, 8000, 20000, 50000], 'YAML/config parse incidents', secret=True),
    _tier('docker_name_collision', 'Docker Name Collision', 'A container name already exists. Of course it does.', 'Debugging Chaos', 'container', 'docker_conflict_events', [75, 200, 600, 1500, 4000], 'Docker/container-name conflicts', secret=True),
    _tier('supposed_to_be_quick', 'This Was Supposed To Be Quick', 'A tiny ask becomes an entire expedition.', 'Vibe Coding', 'hourglass', 'max_messages_in_session', [300, 600, 1200, 2500, 6000], 'Messages in one session'),
    _tier('one_more_small_change', 'One More Small Change', 'Make enough file edits in one session to invalidate the phrase small change.', 'Vibe Coding', 'feather', 'max_file_tool_calls_in_session', [150, 400, 1000, 3000, 8000], 'File/search/patch calls in one session'),
    _tier('vibe_architect', 'Vibe Architect', 'Touch a broad surface area in one project session.', 'Vibe Coding', 'compass', 'max_files_touched_in_session', [300, 700, 1500, 4000, 10000], 'Files touched in one session'),
    _tier('pixel_goblin', 'Pixel Goblin', 'Do sustained frontend, CSS, SVG, or visual tuning.', 'Vibe Coding', 'image', 'frontend_activity_events', [20000, 50000, 120000, 300000, 800000], 'Frontend/CSS/SVG/React activity mentions'),
    _multi('ship_first_ask_later', 'Ship First, Ask Later', 'Git activity after a serious tool chain.', 'Vibe Coding', 'rocket', [('git_events', 50, 'git workflow commands'), ('max_tool_calls_in_session', 500, 'tool calls in one session')]),
    _tier('css_exorcist', 'CSS Exorcist', 'Cast repeated styling demons out of the interface.', 'Vibe Coding', 'bolt', 'css_activity_events', [10000, 30000, 80000, 200000, 500000], 'CSS, styling, Tailwind, or className activity'),
    _multi('one_character_fix', 'One Character Fix', 'A tiny edit after a pile of errors. Painful. Beautiful.', 'Vibe Coding', 'wrench', [('tiny_patch_after_errors_events', 5, 'tiny typo-style fixes after error clusters'), ('total_errors', 4000, 'error/failed/traceback messages observed')], secret=True),
    _tier('skillsmith', 'Skillsmith', 'Work with Hermes skills enough to leave fingerprints.', 'Hermes Native', 'hammer', 'skill_events', [5000, 15000, 40000, 100000, 250000], 'Hermes skill mentions or tool use'),
    _tier('skill_issue_skill_created', 'Skill Issue? Skill Created.', 'Create or patch durable procedures instead of repeating yourself.', 'Hermes Native', 'hammer', 'skill_manage_events', [25, 75, 200, 600, 1500], 'Skill_manage create/patch/delete operations'),
    _tier('memory_keeper', 'Memory Keeper', 'Persist durable knowledge with memory or Mnemosyne.', 'Hermes Native', 'crystal', 'memory_events', [100, 300, 1000, 3000, 8000], 'Memory or Mnemosyne tool events'),
    _tier('memory_palace', 'Memory Palace', 'Build a serious durable-memory trail.', 'Hermes Native', 'laurel', 'memory_write_events', [100, 300, 1000, 3000, 8000], 'Durable memory writes'),
    _tier('context_dragon', 'Context Dragon', 'Brush against compression, huge context, or token pressure repeatedly.', 'Hermes Native', 'brain', 'context_events', [5000, 15000, 40000, 100000, 250000], 'Context, compression, token, or cache-pressure mentions'),
    _tier('gateway_dweller', 'Gateway Dweller', 'Live through gateway-connected Hermes workflows.', 'Hermes Native', 'globe', 'gateway_events', [5000, 15000, 40000, 100000, 250000], 'Gateway/API/chat-platform activity'),
    _tier('plugin_goblin', 'Plugin Goblin', 'Use or develop plugins enough that the dashboard notices.', 'Hermes Native', 'puzzle', 'plugin_events', [1000, 3000, 8000, 20000, 50000], 'Dashboard plugin development or usage signals'),
    _tier('rollback_wizard', 'Rollback Wizard', 'Invoke rollback/checkpoint recovery magic.', 'Hermes Native', 'wing', 'rollback_events', [500, 1500, 4000, 10000, 25000], 'Rollback/checkpoint recovery mentions', secret=True),
    _tier('rabbit_hole_certified', 'Rabbit Hole Certified', 'Search or extract enough web content to qualify as a research spiral.', 'Research/Web', 'compass', 'total_web_calls', [400, 1200, 3000, 8000, 20000], 'Lifetime web_search/web_extract calls'),
    _tier('citation_goblin', 'Citation Goblin', 'Extract enough web pages to become a tiny librarian.', 'Research/Web', 'book', 'total_web_extract_calls', [100, 300, 1000, 3000, 8000], 'Lifetime web_extract calls'),
    _tier('docs_archaeologist', 'Docs Archaeologist', 'Dig through documentation sources over and over.', 'Research/Web', 'scroll', 'docs_activity_events', [5000, 15000, 40000, 100000, 250000], 'Documentation/README/docs activity'),
    _tier('browser_possession', 'Browser Possession', 'Possess a browser through automation repeatedly.', 'Research/Web', 'globe', 'browser_calls', [75, 200, 600, 1500, 4000], 'Lifetime browser automation calls'),
    _tier('terminal_goblin', 'Terminal Goblin', 'Spend serious time in shell-land.', 'Tool Mastery', 'term', 'total_terminal_calls', [750, 2000, 6000, 15000, 50000], 'Lifetime terminal calls'),
    _tier('patch_wizard', 'Patch Wizard', 'Bend files to your will with targeted patches.', 'Tool Mastery', 'wrench', 'total_patch_calls', [250, 750, 2000, 6000, 15000], 'Lifetime targeted patch edits'),
    _tier('file_archaeologist', 'File Archaeologist', 'Dig through the filesystem with reads and searches.', 'Tool Mastery', 'book', 'total_file_reads_searches', [750, 2000, 6000, 15000, 50000], 'Lifetime read_file/search_files calls'),
    _tier('image_whisperer', 'Image Whisperer', 'Use image generation or vision tools enough for visual work.', 'Tool Mastery', 'eye', 'image_vision_calls', [100, 300, 1000, 3000, 8000], 'Image generation or vision tool calls'),
    _tier('voice_of_the_machine', 'Voice Of The Machine', 'Use text-to-speech or voice tooling repeatedly.', 'Tool Mastery', 'speaker', 'tts_calls', [10, 30, 100, 300, 800], 'Text-to-speech or voice tool calls'),
    _tier('model_hopper', 'Model Hopper', 'Switch or inspect providers/models enough to count as a habit.', 'Model Lore', 'branch', 'model_events', [10000, 30000, 80000, 200000, 500000], 'Model/provider-related activity'),
    _tier('openrouter_enjoyer', 'OpenRouter Enjoyer', 'Route model work through OpenRouter repeatedly.', 'Model Lore', 'nodes', 'openrouter_events', [250, 750, 2000, 6000, 15000], 'OpenRouter mentions'),
    _tier('codex_conjurer', 'Codex Conjurer', 'Summon Codex-flavored assistance often enough for a ritual.', 'Model Lore', 'term', 'codex_events', [500, 1500, 4000, 10000, 25000], 'Codex mentions'),
    _tier('multi_model_mage', 'Multi-Model Mage', 'Use a real spread of distinct model names across Hermes history.', 'Model Lore', 'crystal', 'distinct_model_count', [10, 20, 40, 80, 160], 'Distinct model names seen in session metadata'),
    _tier('five_model_flight', 'Five-Model Flight', 'Try at least five distinct LLMs instead of marrying the first model that answers.', 'Model Lore', 'wing', 'distinct_model_count', [5, 10, 20, 40, 80], 'Distinct model names seen in session metadata'),
    _tier('provider_polyglot', 'Provider Polyglot', 'Use models from multiple providers across Hermes history.', 'Model Lore', 'branch', 'distinct_provider_count', [2, 3, 5, 8, 12], 'Distinct model providers inferred from session metadata'),
    _tier('model_sommelier', 'Model Sommelier', 'Taste enough model/provider conversations to develop preferences.', 'Model Lore', 'cube', 'model_events', [250, 750, 2000, 6000, 15000], 'Model/provider-related activity'),
    _tier('claude_confidant', 'Claude Confidant', 'Bring Claude-flavored reasoning into the workflow repeatedly.', 'Model Lore', 'chat', 'claude_events', [50, 150, 500, 1500, 4000], 'Claude/Anthropic model mentions'),
    _tier('gemini_cartographer', 'Gemini Cartographer', 'Map enough Gemini-related workflows to know the terrain.', 'Model Lore', 'compass', 'gemini_events', [50, 150, 500, 1500, 4000], 'Gemini/Google model mentions'),
    _tier('open_weights_pilgrim', 'Open Weights Pilgrim', 'Actually chat with local/open-weight models through Hermes session metadata.', 'Model Lore', 'feather', 'local_model_chat_sessions', [1, 3, 10, 30, 100], 'Hermes sessions whose model metadata is local/open-weight'),
    _tier('toolset_cartographer', 'Toolset Cartographer', 'Navigate Hermes toolsets deliberately instead of treating tools as a blur.', 'Hermes Native', 'compass', 'toolset_events', [20, 60, 200, 600, 1500], 'Toolset or tool-family mentions'),
    _tier('config_surgeon', 'Config Surgeon', 'Operate on real config files, manifests, env files, and dashboard settings without flinching.', 'Hermes Native', 'cog', 'config_events', [100, 300, 1000, 3000, 10000], 'Configuration/environment/manifest activity'),
    _tier('rebase_acrobat', 'Rebase Acrobat', 'Handle real git history surgery: rebase, conflict, merge, fetch, push.', 'Vibe Coding', 'branch', 'git_history_events', [10, 30, 100, 300, 800], 'Git history operations such as rebase, merge, fetch, push, or tag'),
    _tier('test_suite_tamer', 'Test Suite Tamer', 'Run enough verification commands that green text becomes part of the ritual.', 'Tool Mastery', 'shield', 'test_events', [100, 300, 800, 2400, 6000], 'Test/check/verification command mentions'),
    _tier('screenshot_hunter', 'Screenshot Hunter', 'Capture, inspect, and polish visual proof instead of just claiming it works.', 'Tool Mastery', 'eye', 'screenshot_events', [50, 150, 500, 1500, 5000], 'Screenshot, Playwright, PNG, or vision-inspection activity'),
    _tier('marathon_operator', 'Marathon Operator', 'Accumulate a serious number of Hermes sessions.', 'Lifestyle', 'hourglass', 'session_count', [75, 200, 500, 1500, 5000], 'Hermes sessions'),
    _tier('weekend_warrior', 'Weekend Warrior', 'Run Hermes on weekends enough times to make it a lifestyle.', 'Lifestyle', 'clock', 'weekend_sessions', [25, 75, 200, 600, 1500], 'Sessions started on weekends'),
    _tier('night_shift_operator', 'Night Shift Operator', 'Run sessions during gremlin hours repeatedly.', 'Lifestyle', 'moon', 'night_sessions', [25, 75, 200, 600, 1500], 'Sessions started late night or before dawn'),
    _tier('cache_hit_appreciator', 'Cache Hit Appreciator', 'Notice or benefit from prompt/cache behavior.', 'Lifestyle', 'cube', 'cache_events', [100, 300, 1000, 3000, 8000], 'Prompt-cache/cache-hit mentions', secret=True),
]

NEW: list[dict[str, Any]] = [
    # ---- Skills & Learning ----
    _ntier("forge_apprentice", "Forge Apprentice", "Teach Hermes a new skill and watch it stick.", "Skills & Learning", "hammer", "skill_created", [1, 5, 15, 40, 100], "Skills you created with skill_manage"),
    _ntier("whetstone", "Whetstone", "Sharpen the skills you already have instead of starting over.", "Skills & Learning", "wrench", "skill_patched", [3, 15, 50, 150, 400], "Skill edits and patches"),
    _ntier("open_book", "Open Book", "Open skills often enough that the pages fall open by themselves.", "Skills & Learning", "book", "skill_views", [10, 50, 200, 600, 2000], "Skills opened with skill_view"),
    _ntier("card_catalog", "Card Catalog", "Work with a wide shelf of different skills.", "Skills & Learning", "scroll", "skills_touched", [3, 10, 25, 50, 100], "Distinct skills opened or edited"),
    _ntier("arsenal_inventory", "Arsenal Inventory", "Take stock of what Hermes knows before asking it to do things.", "Skills & Learning", "shield", "skill_list_calls", [3, 15, 50, 150, 400], "Skill list lookups"),
    _nmulti("teach_test_tweak", "Teach, Test, Tweak", "Create, edit and reuse skills until the loop closes on itself.", "Skills & Learning", "laurel",
            [("skill_created", 3, "skills created"), ("skill_patched", 3, "skill edits"), ("skill_views", 10, "skills opened")], secret=True),

    # ---- Memory ----
    _ntier("elephant_never_forgets", "Elephant Never Forgets", "Write memories that are still there after the context gets squeezed.", "Memory", "crystal", "memory_survived", [1, 10, 40, 120, 400], "Memory writes that survived a compaction"),
    _ntier("note_to_self", "Note To Self", "Use the memory tool as a habit, not an afterthought.", "Memory", "feather", "memory_tool_calls", [5, 25, 100, 300, 1000], "Memory tool calls"),
    _ntier("deja_vu", "Deja Vu", "Search your own past sessions before solving the same thing twice.", "Memory", "hourglass", "session_search_calls", [3, 15, 60, 200, 600], "Session searches"),
    _ntier("squeeze_play", "Squeeze Play", "Live through context compactions and keep going.", "Memory", "brain", "compactions", [1, 5, 20, 60, 200], "Context compactions"),
    _ntier("heavy_lifting", "Heavy Lifting", "One compaction that frees a mountain of tokens.", "Memory", "cube", "max_tokens_saved_in_compaction", [10000, 50000, 100000, 250000, 500000], "Tokens saved by a single compaction"),
    _ntier("spring_cleaning", "Spring Cleaning", "Remove stale memories so the good ones stay sharp.", "Memory", "wrench", "memory_removals", [1, 5, 20, 60, 150], "Memory entries removed", secret=True),

    # ---- Profiles & Bots ----
    _ntier("many_hats", "Many Hats", "Run Hermes under more than one profile.", "Profiles & Bots", "hand", "profiles", [2, 3, 5, 8, 12], "Distinct profiles you have used"),
    _ntier("home_turf", "Home Turf", "Do real work in a profile that is not the default.", "Profiles & Bots", "shield", "profile_sessions", [10, 50, 200, 600, 2000], "Sessions in a non-default profile"),
    _ntier("bot_whisperer", "Bot Whisperer", "Talk to Hermes from the chat apps you already live in.", "Profiles & Bots", "chat", "platform_sessions", [10, 50, 200, 800, 3000], "Sessions started from a messaging platform"),
    _nmulti("hat_trick", "Hat Trick", "Three profiles, each with real mileage.", "Profiles & Bots", "crown",
            [("profiles", 3, "distinct profiles"), ("profile_sessions", 30, "sessions in a non-default profile")]),
    _ntier("always_on", "Always On", "Be reachable on a chat platform day after day.", "Profiles & Bots", "bell", "bot_days", [3, 10, 30, 90, 200], "Distinct days with a messaging session"),
    _nmulti("split_personality", "Split Personality", "Five profiles and five models: Hermes wears many faces.", "Profiles & Bots", "star",
            [("profiles", 5, "distinct profiles"), ("distinct_model_count", 5, "distinct models")], secret=True),

    # ---- Cron & Automation ----
    _ntier("set_it_and_forget_it", "Set It And Forget It", "Schedule jobs so Hermes works while you are away.", "Cron & Automation", "clock", "cron_created", [1, 5, 15, 40, 100], "Scheduled jobs you created"),
    _ntier("clockwork", "Clockwork", "Let scheduled runs do the work on their own.", "Cron & Automation", "cog", "cron_runs", [1, 10, 50, 200, 1000], "Scheduled runs that started"),
    _ntier("overnight_shift", "Overnight Shift", "Scheduled runs that finish between midnight and five.", "Cron & Automation", "moon", "overnight_cron_runs", [1, 10, 30, 80, 200], "Scheduled runs finished at night"),
    _ntier("many_schedules", "Many Schedules", "A calendar of different scheduled jobs, all running.", "Cron & Automation", "board", "cron_jobs", [2, 5, 12, 30, 75], "Distinct scheduled jobs that ran"),
    _ntier("pause_button", "Pause Button", "Tune the schedule: pause, resume, update, remove.", "Cron & Automation", "hourglass", "cron_managed", [3, 15, 50, 150, 400], "Schedule management actions"),
    _ntier("ghost_in_the_schedule", "Ghost In The Schedule", "Scheduled runs that fire on a weekend while you are away.", "Cron & Automation", "wing", "cron_weekend_runs", [1, 5, 25, 80, 200], "Scheduled runs on weekends", secret=True),

    # ---- Plugins & MCP ----
    _ntier("plugin_hand", "Plugin Hand", "Reach for tools that came from plugins or MCP servers.", "Plugins & MCP", "puzzle", "ext_tools", [1, 3, 6, 10, 20], "Distinct plugin or MCP tools used"),
    _ntier("bridge_builder", "Bridge Builder", "Call tools that live behind MCP servers.", "Plugins & MCP", "plug", "mcp_calls", [5, 30, 120, 400, 1500], "MCP tool calls"),
    _ntier("many_doors", "Many Doors", "Connect more than one MCP server.", "Plugins & MCP", "key", "mcp_servers", [1, 3, 6, 10, 20], "Distinct MCP servers used"),
    _ntier("third_party", "Third Party", "Use tools that came from plugins, not from core.", "Plugins & MCP", "nodes", "plugin_tool_calls", [10, 50, 200, 800, 3000], "Calls to tools from plugins"),
    _ntier("tool_collector", "Tool Collector", "Meet a wide range of different tools.", "Plugins & MCP", "cube", "tools_ever", [10, 25, 50, 100, 200], "Distinct tools seen"),
    _ntier("tool_spelunker", "Tool Spelunker", "Search the tool catalog instead of guessing what exists.", "Plugins & MCP", "compass", "tool_bridge_calls", [3, 15, 60, 200, 600], "Tool search and describe calls", secret=True),

    # ---- Desktop ----
    _ntier("trophy_room", "Trophy Room", "Visit your own trophy room.", "Desktop", "laurel", "trophy_room_open", [1, 10, 40, 100, 300], "Times you opened the Trophy Room"),
    _ntier("wardrobe_change", "Wardrobe Change", "Switch profiles in the app.", "Desktop", "hand", "profile_switches", [3, 15, 50, 150, 400], "Profile switches seen in Desktop"),
    _ntier("sightseer", "Sightseer", "Visit the different pages of the app.", "Desktop", "compass", "pages", [3, 6, 10, 15, 25], "Distinct Desktop pages visited"),
    _ntier("page_turner", "Page Turner", "Move around the app all day.", "Desktop", "book", "page_visit_total", [25, 150, 600, 2000, 6000], "Page visits in Desktop"),
    _ntier("tinkerer", "Tinkerer", "Open Settings more often than is strictly necessary.", "Desktop", "cog", "settings_visits", [3, 15, 60, 200, 600], "Visits to Settings", secret=True),
    _ntier("trophy_hunter", "Trophy Hunter", "Collect trophies for the sake of collecting trophies.", "Desktop", "crown", "total_unlocked", [10, 25, 50, 75, 100], "Total trophies unlocked"),

    # ---- Messaging ----
    _ntier("everywhere_at_once", "Everywhere At Once", "Run Hermes on several platforms: CLI, Telegram, Discord and more.", "Messaging", "globe", "platforms", [2, 3, 5, 7, 10], "Distinct platforms Hermes has run on"),
    _ntier("telegram_regular", "Telegram Regular", "Make Telegram a home base.", "Messaging", "chat", "telegram_sessions", [10, 50, 150, 500, 1500], "Sessions started from Telegram"),
    _ntier("discord_dweller", "Discord Dweller", "Hang out with Hermes on Discord.", "Messaging", "speaker", "discord_sessions", [10, 50, 150, 500, 1500], "Sessions started from Discord"),
    _ntier("group_chat_goblin", "Group Chat Goblin", "Platform reactions and events pile up around you.", "Messaging", "bell", "platform_events", [5, 25, 100, 400, 1500], "Platform events delivered to Hermes"),
    _ntier("terminal_native", "Terminal Native", "Start sessions from the command line like a purist.", "Messaging", "term", "cli_sessions", [10, 50, 200, 800, 3000], "Sessions started from the CLI"),
    _ntier("smoke_signals", "Smoke Signals", "Reach Hermes through a private messenger or email.", "Messaging", "feather", "private_messenger_sessions", [1, 10, 50, 200, 600], "Sessions from Signal, WhatsApp, email or SMS", secret=True),

    # ---- Kanban & Subagents ----
    _ntier("task_force", "Task Force", "Finish work on the kanban board.", "Kanban & Subagents", "board", "kanban_completed", [5, 25, 60, 150, 400], "Kanban tasks completed"),
    _ntier("clocked_in", "Clocked In", "Have workers pick up tasks the moment they are ready.", "Kanban & Subagents", "clock", "kanban_claimed", [5, 25, 100, 300, 1000], "Kanban tasks claimed by a worker"),
    _ntier("roadblock", "Roadblock", "Hit a blocker, name it, and move on.", "Kanban & Subagents", "lock", "kanban_blocked", [1, 5, 20, 60, 150], "Kanban tasks blocked"),
    _ntier("hive_mind", "Hive Mind", "Launch three or more subagents in a single turn.", "Kanban & Subagents", "nodes", "hive_turns", [1, 5, 20, 60, 150], "Turns with 3+ delegated subagents"),
    _ntier("org_chart", "Org Chart", "Delegate a lot of work inside one session.", "Kanban & Subagents", "branch", "max_delegations_in_session", [3, 10, 30, 80, 200], "Delegated subagent calls in one session"),
    _ntier("peer_review", "Peer Review", "Send work back for changes and review it again.", "Kanban & Subagents", "shield", "kanban_reviews", [1, 5, 20, 60, 150], "Kanban review requests and change requests", secret=True),

    # ---- Browser & Computer Use ----
    _ntier("ghost_in_the_browser", "Ghost In The Browser", "Let Hermes drive the computer with computer use.", "Browser & Computer Use", "hand", "computer_use_calls", [1, 20, 100, 400, 1500], "Computer-use actions"),
    _ntier("tab_hoarder", "Tab Hoarder", "Send Hermes to the browser in session after session.", "Browser & Computer Use", "globe", "browser_sessions", [1, 5, 20, 60, 200], "Sessions that used the browser"),
    _ntier("dev_tools_devotee", "Dev Tools Devotee", "Go under the hood of the browser with raw CDP.", "Browser & Computer Use", "term", "browser_cdp_calls", [5, 30, 120, 400, 1500], "Browser CDP and script calls"),
    _ntier("dialog_dodger", "Dialog Dodger", "Handle the pop-ups the web throws at you.", "Browser & Computer Use", "bell", "browser_dialog_calls", [1, 5, 20, 60, 150], "Browser dialogs handled"),
    _ntier("eagle_eye", "Eagle Eye", "Look at pictures and pages with vision.", "Browser & Computer Use", "eye", "vision_calls", [5, 25, 100, 300, 1000], "Vision analysis calls"),
    _ntier("vault_opener", "Vault Opener", "Use the browser vault to log in without typing a password.", "Browser & Computer Use", "lock", "browser_vault_calls", [1, 5, 20, 60, 150], "Browser vault calls", secret=True),

    # ---- Media & Voice ----
    _ntier("directors_cut", "Director's Cut", "Generate video with Hermes.", "Media & Voice", "film", "video_generate_calls", [1, 5, 15, 40, 100], "Videos you generated"),
    _ntier("gallery_owner", "Gallery Owner", "Fill a gallery with generated images.", "Media & Voice", "image", "image_generate_calls", [5, 25, 100, 300, 1000], "Images you generated"),
    _ntier("radio_voice", "Radio Voice", "Make Hermes talk, and keep it talking.", "Media & Voice", "mic", "tts_chars", [500, 5000, 25000, 100000, 400000], "Characters sent to text-to-speech"),
    _ntier("studio_session", "Studio Session", "Make a pile of images and videos in one sitting.", "Media & Voice", "star", "max_media_in_session", [3, 10, 30, 80, 200], "Images and videos generated in one session"),
    _nmulti("multimedia_mage", "Multimedia Mage", "Images, video and voice: all three, for real.", "Media & Voice", "crystal",
            [("image_generate_calls", 10, "images generated"), ("video_generate_calls", 3, "videos generated"), ("tts_calls", 5, "text-to-speech calls")]),
    _nmulti("auteur", "Auteur", "Ten videos and fifty images in: you are making a body of work.", "Media & Voice", "laurel",
            [("video_generate_calls", 10, "videos generated"), ("image_generate_calls", 50, "images generated")], secret=True),
]

CATALOG: list[dict[str, Any]] = LEGACY + NEW
CATALOG_BY_ID: dict[str, dict[str, Any]] = {a["id"]: a for a in CATALOG}
CATEGORIES: list[str] = list(dict.fromkeys(a["category"] for a in CATALOG))

# metric -> ids of achievements that read it (drives the targeted re-evaluation)
METRIC_TO_IDS: dict[str, list[str]] = {}
for _a in CATALOG:
    for _m in ([_a["metric"]] if _a["metric"] else [r["metric"] for r in _a["requirements"] or []]):
        METRIC_TO_IDS.setdefault(_m, []).append(_a["id"])


def metric_type(metric: str) -> str:
    """'distinct' | 'max' | 'derived' | 'sum'"""
    if metric in DISTINCT_METRICS:
        return "distinct"
    if metric in DERIVED_METRICS:
        return "derived"
    if metric.startswith("max_") or metric in MAX_METRICS:
        return "max"
    return "sum"


def tier_for(thresholds: list[int], value: int) -> int:
    """Highest tier index whose threshold is met, or -1."""
    tier = -1
    for i, t in enumerate(thresholds):
        if value >= t:
            tier = i
    return tier


def next_threshold(thresholds: list[int], tier: int) -> Optional[int]:
    """Threshold of the tier after ``tier`` (the first one when tier is -1), or None at the top."""
    return thresholds[tier + 1] if 0 <= tier + 1 < len(thresholds) else None
