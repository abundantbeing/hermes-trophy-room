"""SQLite storage for Trophy Room.

Uses Hermes's per-plugin database (``plugins.plugin_storage.plugin_db``) so the data lives in
``<hermes home>/plugin-data/trophy-room/data.db`` and survives plugin updates. When that import is
unavailable (tests, a stripped environment) it falls back to a plain sqlite3 file in the same place.

Everything here is short transactions behind one lock per connection. Nothing raises into a hook:
callers get a safe default when the database is unavailable.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

PLUGIN_ID = "trophy-room"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS distinct_sets (key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (key, value));
CREATE TABLE IF NOT EXISTS session_stats (session_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS unlocks (id TEXT NOT NULL, tier INTEGER NOT NULL, at INTEGER NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (id, tier));
CREATE TABLE IF NOT EXISTS baseline (id TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""

_SESSION_KEEP = 400


def hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home
        return Path(get_hermes_home())
    except Exception:
        return Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes"))


def profile_name() -> str:
    home = hermes_home()
    return home.name if home.parent.name == "profiles" else "default"


def _open() -> sqlite3.Connection:
    try:
        from plugins.plugin_storage import plugin_db
        return plugin_db(PLUGIN_ID)
    except Exception as exc:  # fall back to a plain file
        logger.debug("plugin_db unavailable (%s); using a plain sqlite3 file", exc)
        folder = hermes_home() / "plugin-data" / PLUGIN_ID
        folder.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(folder / "data.db"), timeout=5.0, check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn


class Store:
    """One open connection, one lock. Methods swallow database errors and return defaults."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._conn: Optional[sqlite3.Connection] = None
        self.home = str(hermes_home())

    # -- connection ---------------------------------------------------------
    def _db(self) -> sqlite3.Connection:
        if self._conn is None:
            conn = _open()
            conn.executescript(_SCHEMA)
            conn.commit()
            self._conn = conn
        return self._conn

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        """A write transaction. Commits on success, rolls back on error, always releases the lock."""
        with self._lock:
            conn = self._db()
            try:
                conn.execute("BEGIN IMMEDIATE")
                yield conn
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                raise

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                try:
                    self._conn.close()
                except Exception:
                    pass
                self._conn = None

    def _read(self, sql: str, args: tuple = ()) -> list[tuple]:
        with self._lock:
            try:
                return list(self._db().execute(sql, args).fetchall())
            except Exception as exc:
                logger.debug("trophy-room read failed: %s", exc)
                return []

    # -- counters -----------------------------------------------------------
    def counters(self, keys: Optional[list[str]] = None) -> dict[str, int]:
        if keys is not None:
            if not keys:
                return {}
            marks = ",".join("?" * len(keys))
            rows = self._read(f"SELECT key, value FROM counters WHERE key IN ({marks})", tuple(keys))
        else:
            rows = self._read("SELECT key, value FROM counters")
        return {k: int(v) for k, v in rows}

    @staticmethod
    def add(conn: sqlite3.Connection, key: str, n: int) -> None:
        conn.execute("INSERT INTO counters(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value", (key, int(n)))

    @staticmethod
    def maximum(conn: sqlite3.Connection, key: str, n: int) -> None:
        conn.execute("INSERT INTO counters(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=MAX(value, excluded.value)", (key, int(n)))

    # -- distinct sets ------------------------------------------------------
    @staticmethod
    def distinct_add(conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute("INSERT OR IGNORE INTO distinct_sets(key,value) VALUES(?,?)", (key, str(value)[:120]))

    def distinct_counts(self, keys: list[str]) -> dict[str, int]:
        if not keys:
            return {}
        marks = ",".join("?" * len(keys))
        rows = self._read(f"SELECT key, COUNT(*) FROM distinct_sets WHERE key IN ({marks}) GROUP BY key", tuple(keys))
        return {k: int(v) for k, v in rows}

    # -- unlocks ------------------------------------------------------------
    def unlock_rows(self) -> list[tuple[str, int, int, int]]:
        return [(r[0], int(r[1]), int(r[2]), int(r[3])) for r in self._read("SELECT id, tier, at, seen FROM unlocks ORDER BY at, tier")]

    def unseen(self) -> list[dict[str, int | str]]:
        """Highest unseen tier per achievement, oldest first."""
        rows = self._read("SELECT id, MAX(tier), MIN(at) FROM unlocks WHERE seen=0 GROUP BY id ORDER BY MIN(at)")
        return [{"id": r[0], "tier": int(r[1]), "at": int(r[2])} for r in rows]

    @staticmethod
    def unlock_insert(conn: sqlite3.Connection, id: str, tier: int, at: int, seen: int = 0) -> bool:
        cur = conn.execute("INSERT OR IGNORE INTO unlocks(id,tier,at,seen) VALUES(?,?,?,?)", (id, tier, int(at), int(seen)))
        return cur.rowcount > 0

    def mark_seen(self, ids: Optional[list[str]] = None) -> None:
        try:
            with self.tx() as conn:
                if ids is None:
                    conn.execute("UPDATE unlocks SET seen=1 WHERE seen=0")
                else:
                    for i in ids[:500]:
                        conn.execute("UPDATE unlocks SET seen=1 WHERE id=? AND seen=0", (str(i),))
        except Exception as exc:
            logger.debug("mark_seen failed: %s", exc)

    # -- baseline -----------------------------------------------------------
    def baselines(self) -> dict[str, int]:
        return {k: int(v) for k, v in self._read("SELECT id, value FROM baseline")}

    # -- meta ---------------------------------------------------------------
    def meta_get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        rows = self._read("SELECT value FROM meta WHERE key=?", (key,))
        return rows[0][0] if rows else default

    @staticmethod
    def meta_set(conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    # -- per-session tallies --------------------------------------------------
    def session_get(self, session_id: str) -> Optional[dict[str, Any]]:
        rows = self._read("SELECT data FROM session_stats WHERE session_id=?", (session_id,))
        if not rows:
            return None
        try:
            return json.loads(rows[0][0])
        except Exception:
            return None

    @staticmethod
    def session_put(conn: sqlite3.Connection, session_id: str, data: dict[str, Any]) -> None:
        conn.execute("INSERT INTO session_stats(session_id,data,updated) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET data=excluded.data, updated=excluded.updated",
                     (session_id, json.dumps(data, separators=(",", ":")), int(time.time())))

    @staticmethod
    def session_prune(conn: sqlite3.Connection) -> None:
        conn.execute("DELETE FROM session_stats WHERE session_id NOT IN (SELECT session_id FROM session_stats ORDER BY updated DESC LIMIT ?)", (_SESSION_KEEP,))

    # -- reset ----------------------------------------------------------------
    def reset(self) -> None:
        with self.tx() as conn:
            for table in ("counters", "distinct_sets", "session_stats", "unlocks", "baseline", "meta"):
                conn.execute(f"DELETE FROM {table}")


_STORES: dict[str, Store] = {}
_STORES_LOCK = threading.Lock()


def get_store() -> Store:
    """The store for the active Hermes home (follows profile switches, one connection per home)."""
    home = str(hermes_home())
    with _STORES_LOCK:
        store = _STORES.get(home)
        if store is None:
            store = _STORES[home] = Store()
        return store


def close_all() -> None:
    with _STORES_LOCK:
        for store in _STORES.values():
            store.close()
        _STORES.clear()
