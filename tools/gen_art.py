"""Generate the Trophy Room pictures with the local Hermes agent's image_generate tool.

Reads art/briefs.jsonl, builds the prompt (master preamble + the brief's subject + negative list
from docs/ART-STYLE.md), asks `hermes chat` to call image_generate once per trophy, then converts
the result to art/<id>.webp (512 px) and art/icons/<id>.png (128 px, for OS notifications).
Raw 1254 px originals are kept in notes/artwork/raw/ (not published).

Usage:
  python tools/gen_art.py                 # every trophy that has no art yet, 3 at a time
  python tools/gen_art.py --ids let_him_cook,memory_keeper
  python tools/gen_art.py --force --ids let_him_cook      # regenerate one
  python tools/gen_art.py --convert-only                  # re-convert raw originals
  python tools/gen_art.py --workers 2 --limit 10

Uses the owner's own Hermes install and image provider; nothing here touches the network itself.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "art"
ICONS = ART / "icons"
RAW = ROOT / "notes" / "artwork" / "raw"
DOC = ROOT / "docs" / "ART-STYLE.md"
PATH_RE = re.compile(r"([A-Za-z]:[\\/][^\r\n]+?\.(?:png|jpg|jpeg|webp))", re.I)
LOCK = threading.Lock()


def section(doc: str, heading: str) -> str:
    m = re.search(r"## " + heading + r".*?\n\n(.*?)(?=\n## |\Z)", doc, re.S)
    if not m:
        raise SystemExit(f"missing section {heading!r} in {DOC}")
    return m.group(1).strip()


def build_prompt(subject: str) -> str:
    doc = DOC.read_text(encoding="utf-8")
    return f"{section(doc, 'Master prompt preamble')} {subject} Avoid: {section(doc, 'Negative list')}"


def convert(raw: Path, art_id: str) -> None:
    img = Image.open(raw).convert("RGB")
    ART.mkdir(exist_ok=True)
    ICONS.mkdir(exist_ok=True)
    img.resize((512, 512), Image.LANCZOS).save(ART / f"{art_id}.webp", "WEBP", quality=86, method=6)
    img.resize((128, 128), Image.LANCZOS).save(ICONS / f"{art_id}.png", "PNG", optimize=True)


def generate(entry: dict, attempts: int = 3) -> tuple[str, bool, str]:
    art_id = entry["id"]
    query = (
        "Use the image_generate tool exactly once, square aspect ratio, with this exact prompt, "
        "then reply with only the saved file path and nothing else.\n\nPROMPT:\n" + build_prompt(entry["subject"])
    )
    last = ""
    for n in range(1, attempts + 1):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as fh:
            fh.write(query)
            qfile = fh.name
        try:
            proc = subprocess.run(
                ["hermes", "chat", "--query-file", qfile, "-t", "image_gen", "--oneshot", "-Q", "--max-turns", "4"],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=420,
            )
            out = (proc.stdout or "") + "\n" + (proc.stderr or "")
            found = PATH_RE.findall(out)
            src = Path(found[0].strip()) if found else None
            if src and src.exists():
                RAW.mkdir(parents=True, exist_ok=True)
                raw = RAW / f"{art_id}.png"
                shutil.copyfile(src, raw)
                convert(raw, art_id)
                return art_id, True, str(src)
            last = out.strip()[-300:] or f"exit {proc.returncode}, no path"
        except subprocess.TimeoutExpired:
            last = "timeout"
        finally:
            Path(qfile).unlink(missing_ok=True)
    return art_id, False, last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--convert-only", action="store_true")
    args = ap.parse_args()

    briefs = [json.loads(line) for line in (ART / "briefs.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    want = {x for x in args.ids.split(",") if x}
    todo = [b for b in briefs if (not want or b["id"] in want)]

    if args.convert_only:
        for b in todo:
            raw = RAW / f"{b['id']}.png"
            if raw.exists():
                convert(raw, b["id"])
                print("converted", b["id"])
        return 0

    if not args.force:
        todo = [b for b in todo if not (ART / f"{b['id']}.webp").exists()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} to generate, {args.workers} at a time", flush=True)
    failed = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(generate, b): b for b in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            art_id, ok, info = fut.result()
            print(f"[{i}/{len(todo)}] {'ok  ' if ok else 'FAIL'} {art_id} {'' if ok else info}", flush=True)
            if not ok:
                failed.append(art_id)
    if failed:
        print("failed:", ",".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
