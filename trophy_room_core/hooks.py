"""Hermes hook callbacks. Every callback takes **kwargs, never raises, and stays fast.

Per-session tallies live in memory and are persisted every few calls, at session end and at
compaction, so a gateway restart in the middle of a session loses at most a few calls.
"""
from __future__ import annotations

import atexit
import json
import logging
import re
import threading
import time
import zlib
from collections import OrderedDict
from typing import Any, Optional

from . import engine
from .engine import Changes
from .store import get_store, profile_name

logger = logging.getLogger(__name__)

_CTX: Any = None
_LOCK = threading.RLock()
_SESSIONS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_SESSIONS_MAX = 200
_TURNS: "OrderedDict[str, int]" = OrderedDict()
_TURNS_DONE: "OrderedDict[str, bool]" = OrderedDict()
_ENDS = 0
TEXT_CAP = 20000
FLUSH_EVERY = 10

# ---- the legacy dashboard plugin's regexes, with bounded gaps so no input can run long ----
ERROR_RE = re.compile(r"\b(error|failed|failure|traceback|exception|permission denied|not found|eaddrinuse|already in use|timed out|blocked)\b", re.I)
PORT_RE = re.compile(r"\b(?:port\s+)?(?:3000|5173|8000|8080|9119)\b[^\n]{0,120}\b(?:in use|already|taken|eaddrinuse)\b|\beaddrinuse\b", re.I)
INSTALL_RE = re.compile(r"\b(?:npm|pnpm|yarn|pip|uv)\b[^\n]{0,80}\b(?:install|add)\b", re.I)
SUCCESS_RE = re.compile(r"\b(?:success|passed|built|compiled|done|exit_code[\"']?\s*[:=]\s*0|verified|ok)\b", re.I)
RESTART_RE = re.compile(r"\brestart|reload|kill|start\b", re.I)
TINY_RE = re.compile(r"one character|single character|typo", re.I)
FILE_RE = re.compile(r"(?:/home/|~/?|\./|/mnt/|[A-Za-z]:[\\/])[\w./\\ -]{1,200}?\.(?:py|js|ts|tsx|jsx|css|html|md|json|yaml|yml|svg|sql|sh)\b")

_TEXT_PATTERNS: list[tuple[str, str]] = [
    ("traceback_events", r"traceback|exception"),
    ("log_read_events", r"gateway\.log|errors\.log|agent\.log|/api/logs|\blogs\b"),
    ("permission_denied_events", r"permission denied|eacces|operation not permitted"),
    ("env_var_error_events", r"api key|environment variable|not configured|unauthorized|auth|missing [^\n]{0,80}env"),
    ("docker_conflict_events", r"docker[^\n]{0,200}(?:name|container)[^\n]{0,200}already|container name conflict|conflict\. the container"),
    ("frontend_activity_events", r"\.(?:css|svg|tsx|jsx)|frontend|tailwind|react"),
    ("css_activity_events", r"\.css|tailwind|style|classname|visual"),
    ("git_events", r"\bgit\s+(?:commit|push|merge|rebase|status|diff)"),
    ("context_events", r"compress|context window|token|cache"),
    ("gateway_events", r"gateway|discord|telegram|slack|api_server"),
    ("plugin_events", r"plugin|dashboard-plugins|__hermes_plugin|manifest\.json"),
    ("rollback_events", r"rollback|checkpoint"),
    ("docs_activity_events", r"docs|documentation|docusaurus|readme"),
    ("model_events", r"model|provider|openrouter|codex|gemini|claude|anthropic|openai|mistral|qwen|deepseek|llama|ollama|vllm|gguf"),
    ("openrouter_events", r"openrouter"),
    ("codex_events", r"codex"),
    ("claude_events", r"claude|anthropic"),
    ("gemini_events", r"gemini|google ai|google model"),
    ("local_model_events", r"ollama|llama\.cpp|gguf|vllm|local model|open[- ]weight|open weights"),
    ("toolset_events", r"toolset|enabled_toolsets|browser tool|terminal tool|file tool|web tool"),
    ("config_events", r"config\.ya?ml|\b[a-z0-9_-]+config\.(?:js|ts|json|ya?ml)|\.env(?:\b|\.)|manifest\.json|settings\.json|pyproject\.toml|package\.json"),
    ("git_history_events", r"\bgit\s+(?:rebase|merge|fetch|pull|push|tag|checkout)|merge conflict|conflict\s*\(|rebase --continue"),
    ("test_events", r"pytest|unittest|vitest|playwright|npm test|pnpm test|node --check|py_compile|tests? passed|\bok\b"),
    ("screenshot_events", r"screenshot|playwright|vision_analyze|browser_vision|\.png|image data"),
    ("release_events", r"\bgit\s+tag|release|version bump|changelog|publish|pushed? tag"),
    ("cache_events", r"cache hit|prompt caching|cache_read"),
    ("skill_events", r"\bskill"),
    ("process_events", r"background\s*=\s*true"),
]
# A pattern only runs when one of its literal hints occurs in the (lowercased) text: a substring
# test is orders of magnitude cheaper than a regex scan over 20k characters.
_HINTS: dict[str, tuple[str, ...]] = {
    "traceback_events": ("traceback", "exception"),
    "log_read_events": ("gateway.log", "errors.log", "agent.log", "/api/logs", "logs"),
    "permission_denied_events": ("permission denied", "eacces", "operation not permitted"),
    "env_var_error_events": ("missing ", "api key", "environment variable", "not configured", "unauthorized", "auth"),
    "docker_conflict_events": ("docker", "container name conflict", "conflict. the container"),
    "frontend_activity_events": (".css", ".svg", ".tsx", ".jsx", "frontend", "tailwind", "react"),
    "css_activity_events": (".css", "tailwind", "style", "classname", "visual"),
    "git_events": ("git ",),
    "context_events": ("compress", "context window", "token", "cache"),
    "gateway_events": ("gateway", "discord", "telegram", "slack", "api_server"),
    "plugin_events": ("plugin", "dashboard-plugins", "__hermes_plugin", "manifest.json"),
    "rollback_events": ("rollback", "checkpoint"),
    "docs_activity_events": ("docs", "documentation", "docusaurus", "readme"),
    "model_events": ("model", "provider", "openrouter", "codex", "gemini", "claude", "anthropic", "openai", "mistral", "qwen", "deepseek", "llama", "ollama", "vllm", "gguf"),
    "openrouter_events": ("openrouter",),
    "codex_events": ("codex",),
    "claude_events": ("claude", "anthropic"),
    "gemini_events": ("gemini", "google ai", "google model"),
    "local_model_events": ("ollama", "llama.cpp", "gguf", "vllm", "local model", "open-weight", "open weight"),
    "toolset_events": ("toolset", "enabled_toolsets", "browser tool", "terminal tool", "file tool", "web tool"),
    "config_events": ("config.", ".env", "manifest.json", "settings.json", "pyproject.toml", "package.json"),
    "git_history_events": ("git ", "merge conflict", "conflict", "rebase --continue"),
    "test_events": ("pytest", "unittest", "vitest", "playwright", "npm test", "pnpm test", "node --check", "py_compile", "test passed", "tests passed", "ok"),
    "screenshot_events": ("screenshot", "playwright", "vision_analyze", "browser_vision", ".png", "image data"),
    "release_events": ("git tag", "release", "version bump", "changelog", "publish", "tag"),
    "cache_events": ("cache hit", "prompt caching", "cache_read"),
    "skill_events": ("skill",),
    "process_events": ("background",),
}
TEXT_RX = [(m, re.compile(p), _HINTS[m]) for m, p in _TEXT_PATTERNS]
_YAML_RX = re.compile(r"yaml|yml|colon|parse error", re.I)

# (metric, name needles): counted once per tool call whose lowercased name contains a needle
TOOL_COUNTERS: list[tuple[str, tuple[str, ...]]] = [
    ("total_terminal_calls", ("terminal",)),
    ("total_web_calls", ("web_search", "web_extract")),
    ("total_web_extract_calls", ("web_extract",)),
    ("browser_calls", ("browser",)),
    ("total_patch_calls", ("patch",)),
    ("total_file_reads_searches", ("read_file", "search_files")),
    ("total_delegate_calls", ("delegate_task",)),
    ("total_process_calls", ("process",)),
    ("total_cron_calls", ("cronjob",)),
    ("image_vision_calls", ("image", "vision")),
    ("tts_calls", ("tts", "text_to_speech")),
    ("skill_events", ("skill",)),
    ("skill_manage_events", ("skill_manage",)),
    ("memory_events", ("memory", "mnemosyne")),
    ("memory_write_events", ("mnemosyne_remember", "memory")),
]
FILE_TOOLS = ("read_file", "write_file", "patch", "search_files")

CORE_EXACT = frozenset({
    "terminal", "process", "read_file", "write_file", "patch", "search_files", "web_search", "web_extract",
    "computer_use", "delegate_task", "execute_code", "image_generate", "video_generate", "vision_analyze",
    "text_to_speech", "memory", "session_search", "skills_list", "cronjob", "clarify", "todo", "send_message",
    "tool_search", "tool_describe", "tool_call",
})
CORE_PREFIX = ("browser_", "kanban_", "skill_", "mcp_", "mcp__")

MESSAGING_EXCLUDE = frozenset({"", "cli", "tui", "desktop", "api_server", "webapp", "web", "acp", "cron", "local"})
PRIVATE_MESSENGERS = frozenset({"signal", "whatsapp", "email", "sms", "imessage", "bluebubbles"})

_PROVIDER_MARKERS = ["openai", "anthropic", "google", "gemini", "mistral", "meta", "qwen", "deepseek", "xai", "nous", "ollama", "groq", "openrouter", "codex"]
_LOCAL_MARKERS = ["ollama", "llama.cpp", "localhost", "127.0.0.1", "local/", "local:", "gguf", "vllm-local"]


def model_provider(model_name: str) -> Optional[str]:
    name = (model_name or "").strip().lower()
    if not name or name == "none":
        return None
    if "/" in name:
        return name.split("/", 1)[0]
    for provider in _PROVIDER_MARKERS:
        if provider in name:
            return "google" if provider == "gemini" else provider
    return name.split(":", 1)[0].split("-", 1)[0]


def is_local_model(model_name: str) -> bool:
    name = (model_name or "").strip().lower()
    return bool(name) and name != "none" and any(m in name for m in _LOCAL_MARKERS)


def _is_ext_tool(name: str) -> bool:
    """True for a tool that came from a plugin or an MCP server rather than from Hermes core."""
    if not name:
        return False
    if name.startswith(("mcp_", "mcp__")):
        return name not in ("mcp_event", "mcp_elicitation")
    if "__" in name:
        return True
    return name not in CORE_EXACT and not name.startswith(("browser_", "kanban_", "skill_"))


def set_context(ctx: Any) -> None:
    global _CTX
    _CTX = ctx


def cron_info() -> Optional[str]:
    """The id of the scheduled job this hook fires inside, or None outside cron."""
    fn = getattr(_CTX, "current_cron_execution", None)
    if not callable(fn):
        return None
    try:
        ex = fn()
    except Exception:
        return None
    if not ex:
        return None
    for attr in ("job_id", "id", "name"):
        val = ex.get(attr) if isinstance(ex, dict) else getattr(ex, attr, None)
        if val:
            return str(val)
    return "cron"


# ---- session tallies --------------------------------------------------------
def _new_tally() -> dict[str, Any]:
    return {"tc": 0, "tools": [], "term": 0, "filet": 0, "webb": 0, "msgs": 0, "files": [], "deleg": 0, "media": 0,
            "mem": 0, "mem_cred": 0, "err": 0, "br": 0, "n": 0}


def _tally(sid: str) -> dict[str, Any]:
    with _LOCK:
        t = _SESSIONS.get(sid)
        if t is not None:
            _SESSIONS.move_to_end(sid)
            return t
    loaded: Any = None
    try:  # a DB read that can wait on other processes: never done while holding the module lock
        loaded = get_store().session_get(sid)
    except Exception:
        loaded = None
    fresh = loaded if isinstance(loaded, dict) else _new_tally()
    for k, v in _new_tally().items():
        fresh.setdefault(k, v)
    with _LOCK:
        t = _SESSIONS.setdefault(sid, fresh)
        _SESSIONS.move_to_end(sid)
        while len(_SESSIONS) > _SESSIONS_MAX:
            _SESSIONS.popitem(last=False)
        return t


def _flush(ch: Changes, sid: str, t: dict[str, Any], force: bool = False) -> None:
    t["n"] = t.get("n", 0) + 1
    if force or t["n"] % FLUSH_EVERY == 0:
        ch.sessions[sid] = json.loads(json.dumps(t))


COALESCE_SECONDS = 1.0  # every hook queues; one transaction is written per this many seconds
MAX_RETRIES = 3
_PENDING: Optional[Changes] = None
_TIMER: Optional[threading.Timer] = None
_APPLY_LOCK = threading.Lock()  # held while a batch is being written; exit and reset wait on it


def _merge(into: Changes, other: Changes) -> None:
    for m, n in other.sums.items():
        into.sums[m] = into.sums.get(m, 0) + n
    for m, v in other.maxes.items():
        into.maxes[m] = max(into.maxes.get(m, 0), v)
    into.distinct.extend(other.distinct)
    into.sessions.update(other.sessions)
    into.prune = into.prune or other.prune
    into.tries = max(into.tries, other.tries)


def _start_timer_locked() -> None:
    global _TIMER
    if COALESCE_SECONDS > 0 and _TIMER is None:
        _TIMER = threading.Timer(COALESCE_SECONDS, flush)
        _TIMER.daemon = True
        _TIMER.start()


def flush() -> None:
    """Write whatever is pending. Called by the timer and at exit.

    Takes _APPLY_LOCK, so an exit flush waits for a batch the timer thread is writing. A failed
    write puts the batch back (up to MAX_RETRIES attempts) instead of losing it.
    """
    global _PENDING, _TIMER
    with _APPLY_LOCK:
        with _LOCK:
            pending, _PENDING = _PENDING, None
            timer, _TIMER = _TIMER, None
        if timer is not None:
            timer.cancel()
        if pending is None or pending.empty():
            return
        try:
            engine.apply(pending)
        except Exception as exc:
            pending.tries += 1
            if pending.tries >= MAX_RETRIES:
                logger.warning("trophy-room: dropped a batch after %d failed writes: %s", pending.tries, exc)
                return
            logger.debug("trophy-room: write failed (%s); will retry (%d/%d)", exc, pending.tries, MAX_RETRIES)
            with _LOCK:
                if _PENDING is not None:
                    _merge(pending, _PENDING)
                _PENDING = pending
                _start_timer_locked()


def _apply(ch: Changes) -> None:
    """Queue a batch and (re)start the timer. With COALESCE_SECONDS <= 0 (tests) it writes at once."""
    global _PENDING
    with _LOCK:
        if _PENDING is None:
            _PENDING = ch
        else:
            _merge(_PENDING, ch)
        _start_timer_locked()
    if COALESCE_SECONDS <= 0:
        flush()


atexit.register(flush)


# ---- helpers ----------------------------------------------------------------
def _text(args: Any, result: Any) -> tuple[str, str]:
    try:
        a = args if isinstance(args, str) else json.dumps(args, default=str, ensure_ascii=False)
    except Exception:
        a = str(args)
    r = result if isinstance(result, str) else (json.dumps(result, default=str, ensure_ascii=False) if result is not None else "")
    return a[: TEXT_CAP // 3], r[: TEXT_CAP - min(len(a), TEXT_CAP // 3)]


def _arg(args: Any, key: str) -> Any:
    return args.get(key) if isinstance(args, dict) else None


def _actions(args: Any) -> list[str]:
    ops = _arg(args, "operations")
    if isinstance(ops, list) and ops:
        return [str((o or {}).get("action", "add")).lower() for o in ops if isinstance(o, dict)] or ["add"]
    return [str(_arg(args, "action") or "add").lower()]


# ---- hook: post_tool_call ----------------------------------------------------
def post_tool_call(tool_name: Any = None, args: Any = None, result: Any = None, session_id: Any = None,
                   task_id: Any = None, turn_id: Any = None, status: Any = None, **_: Any) -> None:
    try:
        _post_tool_call(str(tool_name or ""), args, result, str(session_id or task_id or "_"), turn_id, status)
    except Exception as exc:
        logger.debug("trophy-room post_tool_call failed: %s", exc)


def _post_tool_call(tool: str, args: Any, result: Any, sid: str, turn_id: Any, status: Any) -> None:
    name = tool.lower()
    ch = Changes()
    t = _tally(sid)
    args_text, result_text = _text(args, result)
    full = args_text + "\n" + result_text
    low_full = full.lower()

    ch.bump("total_tool_calls")
    t["tc"] += 1
    t["msgs"] += 2
    if name and name not in t["tools"] and len(t["tools"]) < 300:
        t["tools"].append(name)
    ch.add("tools_ever", name)
    if _is_ext_tool(name):
        ch.add("ext_tools", name)

    for metric, needles in TOOL_COUNTERS:
        if any(n in name for n in needles):
            ch.bump(metric)
    if any(n in name for n in ("terminal",)):
        t["term"] += 1
    if any(n in name for n in FILE_TOOLS):
        t["filet"] += 1
    if any(n in name for n in ("web_search", "web_extract", "browser")):
        t["webb"] += 1

    # text metrics: same regexes as the dashboard plugin, hits capped per call
    for metric, rx, hints in TEXT_RX:
        for h in hints:
            if h in low_full:
                hits = len(rx.findall(low_full))
                if hits:
                    ch.bump("total_process_calls" if metric == "process_events" else metric, min(hits, 25))
                break
    error = bool(ERROR_RE.search(result_text)) or str(status or "").lower() == "error"
    if error:
        ch.bump("total_errors")
        if _YAML_RX.search(full):
            ch.bump("yaml_error_events", min(len(_YAML_RX.findall(full)), 25))
        if INSTALL_RE.search(args_text):
            ch.bump("install_error_events")
    elif INSTALL_RE.search(args_text) and SUCCESS_RE.search(result_text):
        ch.bump("install_success_events")
    if t["err"] > 0 and RESTART_RE.search(args_text):
        ch.bump("restart_after_error_events")
    if t["err"] >= 5 and TINY_RE.search(full):
        ch.bump("tiny_patch_after_errors_events")
    if PORT_RE.search(full):
        ch.bump("port_conflict_events")
    if error:
        t["err"] += 1

    files = t["files"]
    if len(files) < 2000:
        for m in FILE_RE.findall(full)[:50]:
            h = zlib.crc32(m.encode("utf-8", "ignore"))
            if h not in files:
                files.append(h)

    # --- new achievements: events keyed by tool name ---
    action = str(_arg(args, "action") or "").lower()
    if name == "skill_manage":
        if action == "create":
            ch.bump("skill_created")
        elif action in ("patch", "edit", "write_file", "update"):
            ch.bump("skill_patched")
        ch.add("skills_touched", _arg(args, "name"))
    elif name == "skill_view":
        ch.bump("skill_views")
        ch.add("skills_touched", _arg(args, "name"))
    elif name == "skills_list":
        ch.bump("skill_list_calls")
    elif name == "memory":
        acts = _actions(args)
        ch.bump("memory_tool_calls")
        writes = sum(1 for a in acts if a in ("add", "replace", "write", "update"))
        t["mem"] += writes
        ch.bump("memory_removals", sum(1 for a in acts if a in ("remove", "delete")))
    elif name == "session_search":
        ch.bump("session_search_calls")
    elif name == "cronjob":
        if action == "create":
            ch.bump("cron_created")
        elif action in ("pause", "resume", "remove", "delete", "update", "edit"):
            ch.bump("cron_managed")
    elif name.startswith(("mcp_", "mcp__")) and name not in ("mcp_event", "mcp_elicitation"):
        ch.bump("mcp_calls")
        parts = name.split("__") if "__" in name else name.split("_", 2)
        if len(parts) >= 2:
            ch.add("mcp_servers", parts[1])
    elif name in ("tool_search", "tool_describe", "tool_call"):
        ch.bump("tool_bridge_calls")
    elif name == "computer_use":
        ch.bump("computer_use_calls")
    elif name.startswith("browser_"):
        if not t["br"]:
            t["br"] = 1
            ch.bump("browser_sessions")
        if name in ("browser_cdp", "browser_exec"):
            ch.bump("browser_cdp_calls")
        elif name == "browser_dialog":
            ch.bump("browser_dialog_calls")
        elif name == "browser_vault":
            ch.bump("browser_vault_calls")
    elif name == "vision_analyze":
        ch.bump("vision_calls")
    elif name in ("image_generate", "video_generate"):
        ch.bump(name + "_calls")
        t["media"] += 1
    elif name == "text_to_speech":
        body = _arg(args, "text") or _arg(args, "input") or ""
        ch.bump("tts_chars", len(str(body)))
    elif name == "delegate_task":
        n = _arg(args, "tasks")
        n = len(n) if isinstance(n, list) and n else 1
        t["deleg"] += n
        key = str(turn_id or sid)
        with _LOCK:
            _TURNS[key] = _TURNS.get(key, 0) + n
            while len(_TURNS) > 300:
                _TURNS.popitem(last=False)
            if _TURNS[key] >= 3 and key not in _TURNS_DONE:
                _TURNS_DONE[key] = True
                while len(_TURNS_DONE) > 300:
                    _TURNS_DONE.popitem(last=False)
                ch.bump("hive_turns")
    elif name in ("kanban_request_review", "kanban_request_changes"):
        ch.bump("kanban_reviews")
    if name and name not in CORE_EXACT and not name.startswith(CORE_PREFIX):
        ch.bump("plugin_tool_calls")

    # --- session maxima ---
    ch.top("max_tool_calls_in_session", t["tc"])
    ch.top("max_distinct_tools_in_session", len(t["tools"]))
    ch.top("max_messages_in_session", t["msgs"])
    ch.top("max_terminal_calls_in_session", t["term"])
    ch.top("max_file_tool_calls_in_session", t["filet"])
    ch.top("max_web_browser_calls_in_session", t["webb"])
    ch.top("max_files_touched_in_session", len(files))
    if t["deleg"]:
        ch.top("max_delegations_in_session", t["deleg"])
    if t["media"]:
        ch.top("max_media_in_session", t["media"])
    _flush(ch, sid, t)
    _apply(ch)


# ---- hook: on_session_start ----------------------------------------------------
def on_session_start(session_id: Any = None, model: Any = None, platform: Any = None, **_: Any) -> None:
    try:
        _on_session_start(str(session_id or "_"), str(model or ""), str(platform or "").lower())
    except Exception as exc:
        logger.debug("trophy-room on_session_start failed: %s", exc)


def _on_session_start(sid: str, model: str, platform: str) -> None:
    ch = Changes()
    now = time.localtime()
    ch.bump("session_count")
    if now.tm_wday >= 5:
        ch.bump("weekend_sessions")
    if now.tm_hour >= 23 or now.tm_hour < 5:
        ch.bump("night_sessions")
    if model and model.lower() != "none":
        ch.add("distinct_model_count", model.lower())
        prov = model_provider(model)
        ch.add("distinct_provider_count", prov)
        if is_local_model(model):
            ch.bump("local_model_chat_sessions")
        low = model.lower()
        for metric, rx, _hints in TEXT_RX:
            if metric in ("model_events", "openrouter_events", "codex_events", "claude_events", "gemini_events", "local_model_events"):
                if rx.search(low):
                    ch.bump(metric)
    if platform:
        ch.add("platforms", platform)
        if platform == "telegram":
            ch.bump("telegram_sessions")
        elif platform == "discord":
            ch.bump("discord_sessions")
        elif platform == "cli":
            ch.bump("cli_sessions")
        if platform in PRIVATE_MESSENGERS:
            ch.bump("private_messenger_sessions")
        if platform not in MESSAGING_EXCLUDE:
            ch.bump("platform_sessions")
            ch.add("bot_days", time.strftime("%Y-%m-%d"))
    prof = profile_name()
    ch.add("profiles", prof)
    if prof != "default":
        ch.bump("profile_sessions")
    job = cron_info()
    if job is not None:
        ch.bump("cron_runs")
        ch.add("cron_jobs", job)
    _apply(ch)


# ---- hook: on_session_end ------------------------------------------------------
def on_session_end(session_id: Any = None, **_: Any) -> None:
    global _ENDS
    try:
        sid = str(session_id or "_")
        _end_turn(sid)
        ch = Changes()
        t = _tally(sid)
        _flush(ch, sid, t, force=True)
        if cron_info() is not None:
            now = time.localtime()
            if now.tm_hour < 5:
                ch.bump("overnight_cron_runs")
            if now.tm_wday >= 5:
                ch.bump("cron_weekend_runs")
        _ENDS += 1
        if _ENDS % 50 == 0:
            ch.prune = True
        _apply(ch)
    except Exception as exc:
        logger.debug("trophy-room on_session_end failed: %s", exc)


def _end_turn(sid: str, turn_id: Any = None) -> None:
    """A turn ended: forget its delegate counter so the next turn counts afresh."""
    with _LOCK:
        for key in {sid, str(turn_id)} if turn_id else {sid}:
            _TURNS.pop(key, None)
            _TURNS_DONE.pop(key, None)


# ---- hook: post_llm_call -------------------------------------------------------
def post_llm_call(session_id: Any = None, turn_id: Any = None, **_: Any) -> None:
    try:
        sid = str(session_id or "_")
        _end_turn(sid, turn_id)
        t = _tally(sid)
        t["msgs"] += 2
        ch = Changes()
        ch.top("max_messages_in_session", t["msgs"])
        _apply(ch)
    except Exception as exc:
        logger.debug("trophy-room post_llm_call failed: %s", exc)


# ---- hook: post_compaction -----------------------------------------------------
def post_compaction(session_id: Any = None, old_session_id: Any = None, before_tokens: Any = None,
                    after_tokens: Any = None, **_: Any) -> None:
    try:
        new_sid = str(session_id or "_")
        old_sid = str(old_session_id or new_sid)
        ch = Changes()
        ch.bump("compactions")
        if isinstance(before_tokens, int) and isinstance(after_tokens, int) and before_tokens > after_tokens:
            ch.top("max_tokens_saved_in_compaction", before_tokens - after_tokens)
        t = _tally(old_sid)
        credit = t["mem"] - t["mem_cred"]
        if credit > 0:
            t["mem_cred"] = t["mem"]
            ch.bump("memory_survived", credit)
        if new_sid != old_sid:
            with _LOCK:
                _SESSIONS[new_sid] = t  # the new session id carries the same tallies forward
        _flush(ch, new_sid, t, force=True)
        _apply(ch)
    except Exception as exc:
        logger.debug("trophy-room post_compaction failed: %s", exc)


# ---- hooks: kanban, platform events ---------------------------------------------
def _simple(metric: str):
    def hook(**_: Any) -> None:
        try:
            ch = Changes()
            ch.bump(metric)
            _apply(ch)
        except Exception as exc:
            logger.debug("trophy-room %s failed: %s", metric, exc)
    hook.__name__ = f"hook_{metric}"
    return hook


kanban_task_completed = _simple("kanban_completed")
kanban_task_claimed = _simple("kanban_claimed")
kanban_task_blocked = _simple("kanban_blocked")
gateway_platform_event = _simple("platform_events")

HOOKS = {
    "post_tool_call": post_tool_call,
    "on_session_start": on_session_start,
    "on_session_end": on_session_end,
    "post_llm_call": post_llm_call,
    "post_compaction": post_compaction,
    "kanban_task_completed": kanban_task_completed,
    "kanban_task_claimed": kanban_task_claimed,
    "kanban_task_blocked": kanban_task_blocked,
    "gateway_platform_event": gateway_platform_event,
}


def reset_memory_state() -> None:
    """Forget in-memory tallies, turn counters and pending writes (reset, tests, profile switches).

    Waits for a write that is already in flight. Other processes (cron, a CLI session) keep their
    own in-memory tallies and start again from empty when they next restart.
    """
    global _PENDING, _TIMER
    with _APPLY_LOCK:
        with _LOCK:
            _PENDING = None
            if _TIMER is not None:
                _TIMER.cancel()
                _TIMER = None
            _SESSIONS.clear()
            _TURNS.clear()
            _TURNS_DONE.clear()
