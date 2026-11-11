"""Trophy Room REST, mounted by Hermes at /api/plugins/trophy-room/.

Imported by file path, so it puts the plugin root on sys.path and imports ``trophy_room_core``.
See docs/CONTRACT.md for the shapes.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Optional

_ROOT = str(Path(__file__).resolve().parents[1])
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from fastapi import APIRouter, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from trophy_room_core import art, engine, hooks, legacy, signals  # noqa: E402
from trophy_room_core.store import get_store  # noqa: E402

router = APIRouter()


class SeenBody(BaseModel):
    ids: Optional[list[str]] = None


class SignalBody(BaseModel):
    key: str
    value: Any = None


class ResetBody(BaseModel):
    confirm: str = ""


@router.get("/state")
def get_state() -> dict[str, Any]:
    return engine.build_state()


@router.post("/seen")
def post_seen(body: Optional[SeenBody] = None) -> dict[str, Any]:
    get_store().mark_seen(body.ids if body else None)
    return {"ok": True}


@router.post("/signal")
def post_signal(body: SignalBody) -> dict[str, Any]:
    try:
        unlocked = signals.apply_signal(body.key, body.value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True, "unlocked": [p["id"] for p in unlocked]}


@router.post("/import-legacy")
def post_import_legacy() -> dict[str, Any]:
    return legacy.import_legacy()


@router.post("/reset")
def post_reset(body: ResetBody) -> dict[str, Any]:
    if body.confirm != "reset":
        raise HTTPException(status_code=400, detail='send {"confirm": "reset"}')
    # Drop in-memory tallies and pending writes first, or the next hook would re-unlock everything.
    # Other processes (cron, a separate CLI) keep their own tallies until they restart.
    hooks.reset_memory_state()
    get_store().reset()
    return {"ok": True}


@router.get("/art-index")
def get_art_index() -> dict[str, Any]:
    return {"ids": art.art_ids(hide=engine.hidden_secret_ids())}


@router.get("/art/{achievement_id}")
def get_art(achievement_id: str) -> dict[str, Any]:
    if not art.valid_id(achievement_id):
        raise HTTPException(status_code=404, detail="unknown achievement")
    if achievement_id in engine.hidden_secret_ids():  # a secret stays secret until its first sign
        return {"uri": None, "icon_path": None}
    return art.art_payload(achievement_id)
