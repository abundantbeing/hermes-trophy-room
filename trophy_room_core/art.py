"""Art lookup: pictures shipped in the repo's ``art/`` folder.

``art/<id>.webp`` (or png, jpg, jpeg) is the picture for the gallery and the pop-up.
``art/icons/<id>.png`` is the small icon used by the OS notification. Anything missing returns None
and the Desktop half draws a placeholder glyph instead, so a missing picture never breaks the plugin.
"""
from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Optional

from . import catalog as cat

ART_DIR = Path(__file__).resolve().parents[1] / "art"
EXTS = ("webp", "png", "jpg", "jpeg")
MIME = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg"}
MAX_BYTES = 600 * 1024  # real pictures are about 60 KB; this keeps the JSON reply small
_ID_RE = re.compile(r"^[a-z0-9_]{1,64}$")


def valid_id(id_: str) -> bool:
    return bool(_ID_RE.match(id_ or "")) and id_ in cat.CATALOG_BY_ID


def find_art(id_: str, art_dir: Optional[Path] = None) -> Optional[Path]:
    if not valid_id(id_):
        return None
    base = art_dir or ART_DIR
    for ext in EXTS:
        p = base / f"{id_}.{ext}"
        if p.is_file():
            return p
    return None


def art_payload(id_: str, art_dir: Optional[Path] = None) -> dict[str, Optional[str]]:
    base = art_dir or ART_DIR
    p = find_art(id_, base)
    uri = None
    if p is not None:
        try:
            if p.stat().st_size <= MAX_BYTES:
                uri = f"data:{MIME[p.suffix.lstrip('.').lower()]};base64," + base64.b64encode(p.read_bytes()).decode("ascii")
        except OSError:
            uri = None
    icon = base / "icons" / f"{id_}.png" if valid_id(id_) else None
    icon_path = str(icon) if icon is not None and icon.is_file() else None
    if icon_path is None and p is not None and p.suffix.lower() in (".png", ".jpg", ".jpeg"):
        icon_path = str(p)
    return {"uri": uri, "icon_path": icon_path}


def art_ids(art_dir: Optional[Path] = None, hide: frozenset[str] | set[str] = frozenset()) -> list[str]:
    """Ids that have a real picture, leaving out ``hide`` (secret entries not yet discovered)."""
    base = art_dir or ART_DIR
    return [a["id"] for a in cat.CATALOG if a["id"] not in hide and find_art(a["id"], base) is not None]
