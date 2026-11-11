"""Trophy Room: Hermes achievements with live unlocks and a Desktop trophy room.

This file registers hooks only. Everything else lives in ``trophy_room_core`` (the engine),
``dashboard/plugin_api.py`` (REST for the Desktop half) and ``desktop/plugin.js`` (the UI).
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_ROOT = str(Path(__file__).resolve().parent)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

try:  # one module instance shared with dashboard/plugin_api.py
    from trophy_room_core import hooks as _hooks
except Exception:  # pragma: no cover - fallback when the root cannot be put on sys.path
    from .trophy_room_core import hooks as _hooks


def register(ctx) -> None:
    """Wire the lifecycle hooks. Registers no tools."""
    _hooks.set_context(ctx)
    for name, callback in _hooks.HOOKS.items():
        ctx.register_hook(name, callback)
    logger.debug("trophy-room: registered %d hooks", len(_hooks.HOOKS))
