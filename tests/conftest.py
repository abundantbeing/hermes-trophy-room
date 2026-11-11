"""Shared fixtures: every test runs against a throwaway HERMES_HOME so ~/.hermes is never touched."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class Home:
    """The temp HERMES_HOME plus the list of broadcast payloads captured so far."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.sent: list = []

    def __truediv__(self, other):
        return self.path / other

    def __fspath__(self) -> str:
        return str(self.path)

    def __str__(self) -> str:
        return str(self.path)


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    from trophy_room_core import engine, hooks, store

    store.close_all()
    hooks.reset_memory_state()
    hooks.set_context(None)
    monkeypatch.setattr(hooks, "COALESCE_SECONDS", 0)  # write every hook immediately in tests
    h = Home(tmp_path)
    if not hasattr(engine, "real_broadcast"):
        engine.real_broadcast = engine.broadcast  # type: ignore[attr-defined]
    monkeypatch.setattr(engine, "broadcast", lambda payload: h.sent.append(payload) or True)
    yield h
    store.close_all()
    hooks.reset_memory_state()
