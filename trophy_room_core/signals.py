"""Desktop-observed signals (POST /signal). Whitelisted keys only."""
from __future__ import annotations

from typing import Any

from . import engine
from .engine import Changes

KEYS = ("trophy_room_open", "profile_seen", "plugin_count", "page_visit")


def apply_signal(key: str, value: Any = None) -> list[dict[str, Any]]:
    """Apply one signal and return the unlock payloads. Raises ValueError for an unknown key."""
    if key not in KEYS:
        raise ValueError(f"unknown signal {key!r}")
    ch = Changes()
    if key == "trophy_room_open":
        ch.bump("trophy_room_open")
    elif key == "profile_seen":
        name = _short(value)
        if not name:
            raise ValueError("profile_seen needs a profile name")
        ch.add("profiles", name)
        ch.bump("profile_switches")
    elif key == "plugin_count":
        try:
            n = int(value)
        except (TypeError, ValueError):
            raise ValueError("plugin_count needs an integer")
        ch.top("plugin_count", max(0, min(n, 10000)))
    elif key == "page_visit":
        page = _short(value)
        if not page:
            raise ValueError("page_visit needs a page name")
        ch.add("pages", page.lower())
        ch.bump("page_visit_total")
        if page.lower() == "settings":
            ch.bump("settings_visits")
    return engine.apply(ch)


def _short(value: Any) -> str:
    return str(value).strip()[:64] if value is not None else ""
