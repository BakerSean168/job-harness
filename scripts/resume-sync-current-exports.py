#!/usr/bin/env python3
"""Publish exactly four version-free external PDF files from frozen Artifact bytes.

Usage:
  python3 scripts/resume-sync-current-exports.py check --db /data/job-harness.db --data-dir /data
  python3 scripts/resume-sync-current-exports.py sync --db /data/job-harness.db --data-dir /data
Only replaces the four canonical filenames; historical files remain untouched.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import tempfile

PROFILES = {
    "ai-frontend-v5-1": "\u5362\u697c\u8c6a-\u524d\u7aef\u5f00\u53d1\u5de5\u7a0b\u5e08.pdf",
    "ai-fullstack-v5-1": "\u5362\u697c\u8c6a-\u5168\u6808\u5f00\u53d1\u5de5\u7a0b\u5e08.pdf",
    "ai-fullstack-agent-v5-1": "\u5362\u697c\u8c6a-AI\u5168\u6808\u5f00\u53d1\u5de5\u7a0b\u5e08.pdf",
    "ai-agent-app-v5-1": "\u5362\u697c\u8c6a-AIAgent\u5e94\u7528\u5f00\u53d1\u5de5\u7a0b\u5e08.pdf",
}

def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 512), b""):
            digest.update(chunk)
    return digest.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("check", "sync"))
    parser.add_argument("--db", required=True)
    parser.add_argument("--data-dir", required=True)
    args = parser.parse_args()
    root = pathlib.Path(args.data_dir).resolve(strict=True)
    db = sqlite3.connect("file:" + args.db + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    output = root / "resumes-current"
    report = []
    try:
        active = db.execute("SELECT id, version, profile_json FROM resume_profiles WHERE archived_at IS NULL").fetchall()
        if set(r["id"] for r in active) != set(PROFILES):
            raise RuntimeError("Unexpected active Profile IDs")
        library_version = db.execute("SELECT version FROM resume_libraries WHERE id='primary'").fetchone()[0]
        if library_version != 19:
            raise RuntimeError("Unexpected Library version")
        files = []
        for row in active:
            p = json.loads(row["profile_json"])
            name = p["output"]["pdfName"]["zh-CN"] + ".pdf"
            if name != PROFILES[row["id"]] or "v5.1" in p["name"]["zh-CN"].lower():
                raise RuntimeError("Public name not canonical: " + row["id"])
            artifact = db.execute("""
                SELECT a.storage_uri, a.sha256, a.byte_size
                FROM resume_artifacts a JOIN resume_revisions r ON r.id = a.revision_id
                WHERE r.profile_id=? AND r.profile_version=? AND r.library_version=?
                  AND a.kind='pdf'
                ORDER BY r.revision_number DESC, a.created_at DESC LIMIT 1
            """, (row["id"], row["version"], library_version)).fetchone()
            if artifact is None:
                raise RuntimeError("No PDF for current published revision: " + row["id"])
            uri = artifact["storage_uri"]
            if not uri.startswith("file:///data/resume-artifacts/"):
                raise RuntimeError("Unexpected PDF storage URI: " + uri)
            path = (root / uri.removeprefix("file:///data/")).resolve(strict=True)
            if not path.is_relative_to((root / "resume-artifacts").resolve(strict=True)):
                raise RuntimeError("Artifact escaped the allowed data directory")
            if hash_file(path) != artifact["sha256"].lower() or path.stat().st_size != artifact["byte_size"]:
                raise RuntimeError("PDF Artifact integrity mismatch: " + row["id"])
            info = subprocess.check_output(["pdfinfo", str(path)], text=True)
            if "Pages:           1" not in info or "(A4)" not in info:
                raise RuntimeError("Invalid one-page A4: " + row["id"])
            files.append((row["id"], path, name, artifact["sha256"].lower()))
        if args.mode == "sync":
            output.mkdir(mode=0o755, exist_ok=True)
            for profile_id, src, name, sha in files:
                target = output / name
                fd, tmp = tempfile.mkstemp(dir=output, prefix=".current-", suffix=".pdf")
                try:
                    with os.fdopen(fd, "wb") as dest, src.open("rb") as original:
                        for chunk in iter(lambda: original.read(1024 * 512), b""):
                            dest.write(chunk)
                    os.chmod(tmp, 0o644)
                    if hash_file(pathlib.Path(tmp)) != sha:
                        raise RuntimeError("Staged copy checksum mismatch: " + profile_id)
                    os.replace(tmp, target)
                finally:
                    if pathlib.Path(tmp).exists():
                        os.unlink(tmp)
                if hash_file(target) != sha:
                    raise RuntimeError("Published copy checksum mismatch: " + name)
        else:
            # Check the artifact baseline without modifying disk.
            pass
        report = [{"profileId": identity, "filename": filename, "sha256": sha}
                  for identity, _src, filename, sha in files]
        if args.mode == "sync":
            current = {p.name for p in output.glob("*.pdf")}
            if current != set(PROFILES.values()):
                raise RuntimeError("Unexpected files in public current export directory")
        print(("SYNC_OK " if args.mode == "sync" else "CHECK_OK ") + json.dumps(report, ensure_ascii=False))
    finally:
        db.close()

if __name__ == "__main__":
    main()
