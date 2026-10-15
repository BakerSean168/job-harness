#!/usr/bin/env python3
"""Install/check the nonsecret Oracle2 Browser Bridge runtime files.

This script never touches Chromium profile data, extension Agent Tokens,
Docker Compose credentials, or recruiting site state. Stop only the
job-harness-remote-chromium-bridge.service before updating runtime scripts;
reload and restart that user service after updating.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent.parent / "deploy" / "oracle2-remote-chromium"
DEFAULT_ROOT = Path("/opt/remote-browser/config/job-harness-bridge")
DEFAULT_UNIT_DIR = Path.home() / ".config" / "systemd" / "user"
UNIT = "job-harness-remote-chromium-bridge.service"
RUNTIME = {
    "run.sh": 0o755,
    "stop.sh": 0o755,
    "tcp-relay.py": 0o644,
}


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise RuntimeError(reason)


def ensure_safe_dir(directory: Path, create: bool) -> None:
    require(not directory.is_symlink(), f"Directory symlink is not allowed: {directory}")
    if not directory.exists():
        require(create, f"Missing directory: {directory}")
        directory.mkdir(parents=True, mode=0o750)
    require(directory.is_dir(), f"Expected directory: {directory}")


def sync_file(source: Path, destination: Path, mode: int, apply: bool) -> bool:
    require(source.is_file() and not source.is_symlink(), f"Missing or unsafe source: {source}")
    require(not destination.is_symlink(), f"Destination symlink is not allowed: {destination}")
    require(not destination.exists() or destination.is_file(), f"Destination must be a file: {destination}")
    data = source.read_bytes()
    differs = not destination.is_file() or destination.read_bytes() != data or (destination.stat().st_mode & 0o777) != mode
    if not differs or not apply:
        return differs

    fd, temporary = tempfile.mkstemp(dir=destination.parent, prefix=".bridge-runtime-sync-")
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as output:
            output.write(data)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


def is_live_service() -> bool:
    result = subprocess.run(
        ["systemctl", "--user", "is-active", "--quiet", UNIT],
        capture_output=True, check=False, timeout=5,
    )
    return result.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--unit-dir", type=Path, default=DEFAULT_UNIT_DIR)
    args = parser.parse_args()

    expected = {name: (SOURCE / name, args.root / name, file_mode)
                for name, file_mode in RUNTIME.items()}
    expected[UNIT] = (SOURCE / UNIT, args.unit_dir / UNIT, 0o644)
    require({p.name for p in SOURCE.iterdir() if p.is_file()} == set(expected),
            "Unexpected runtime template file set")

    # Inspect first; never partially mutate an invalid target tree.
    for directory in (args.root, args.unit_dir):
        ensure_safe_dir(directory, create=args.apply)
    changed = []
    for name, (source, destination, file_mode) in expected.items():
        if sync_file(source, destination, file_mode, apply=False):
            changed.append(name)

    if args.check:
        require(not changed, f"Oracle2 Browser Bridge runtime drift: {changed}")
        print(f"RUNTIME_SYNC_OK: {len(expected)} files; only dedicated browser config managed")
        return

    # If touching the actual service, require it to be stopped before writes.
    if changed and args.root == DEFAULT_ROOT and args.unit_dir == DEFAULT_UNIT_DIR:
        require(not is_live_service(),
                f"Stop the dedicated user service first: systemctl --user stop {UNIT}")
    for name in changed:
        source, destination, file_mode = expected[name]
        sync_file(source, destination, file_mode, apply=True)
    print(f"RUNTIME_SYNC_UPDATED: changed {changed or 'none'}; "
          f"{len(expected)} managed files; browser profile and secrets untouched")
    print("After updates: systemctl --user daemon-reload && "
          f"systemctl --user start {UNIT}")


if __name__ == "__main__":
    main()
