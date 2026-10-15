#!/usr/bin/env python3
"""Sync the canonical Browser Bridge into Oracle2's dedicated cloud Chromium.

The generic MV3 extension retains optional-only host permissions. This generates
a separate deployment overlay limited to the Oracle2 loopback Bridge and three
supported recruiting-site families. Does not touch Chromium's profile/token.
Stop the dedicated user service before applying, then restart it.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile

SOURCE = Path(__file__).resolve().parent.parent / "integrations" / "browser-extension"
DEFAULT_TARGET = Path("/opt/remote-browser/config/job-harness-bridge/extension")
ORACLE2_HOST_PERMISSIONS = [
    "http://127.0.0.1/*",
    "https://*.liepin.com/*",
    "https://*.zhipin.com/*",
    "https://*.zhaopin.com/*",
]
EXPECTED_FILES = frozenset({
    "manifest.json", "background.js", "boss-driver.js", "form-engine.js",
    "options.html", "options.js", "page-driver.js", "popup.html",
    "popup.js", "ui.css", "README.md",
})


def generated_files() -> dict[str, bytes]:
    names = {path.name for path in SOURCE.iterdir() if path.is_file()}
    if names != EXPECTED_FILES:
        raise RuntimeError(f"Unexpected canonical Bridge source files: {sorted(names ^ EXPECTED_FILES)}")
    output: dict[str, bytes] = {}
    for name in sorted(EXPECTED_FILES):
        path = SOURCE / name
        if path.is_symlink():
            raise RuntimeError(f"Refusing source symlink: {path}")
        output[name] = path.read_bytes()
    manifest = json.loads(output["manifest.json"])
    if manifest.get("manifest_version") != 3 or "host_permissions" in manifest:
        raise RuntimeError("Canonical Browser Bridge must remain optional-host MV3")
    manifest["host_permissions"] = ORACLE2_HOST_PERMISSIONS
    output["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="verify deployed files against canonical source + overlay")
    mode.add_argument("--apply", action="store_true", help="update only the extension source files, never the browser profile")
    args = parser.parse_args()
    destination: Path = args.target
    if not destination.is_dir() or destination.is_symlink():
        raise RuntimeError(f"Missing or unsafe extension target: {destination}")
    expected = generated_files()
    changed = []
    for name, content in expected.items():
        path = destination / name
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise RuntimeError(f"Unexpected deployed file type: {path}")
        if not path.is_file() or path.read_bytes() != content:
            changed.append(name)
    if args.check:
        if changed:
            raise RuntimeError(f"Browser Bridge deployment drift: {changed}")
        version = json.loads(expected["manifest.json"])["version"]
        print(f"BRIDGE_DEPLOYMENT_OK: {len(expected)} files, version {version}, limited Oracle2 host permissions")
        return

    for name in changed:
        path = destination / name
        fd, tmp = tempfile.mkstemp(prefix=".bridge-sync-", dir=str(destination))
        try:
            os.fchmod(fd, 0o644)
            with os.fdopen(fd, "wb") as f:
                f.write(expected[name])
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
    print(f"BRIDGE_DEPLOYMENT_UPDATED: changed {changed or 'none'}; {len(expected)} managed files; profile untouched")


if __name__ == "__main__":
    main()
