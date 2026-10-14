#!/usr/bin/env python3
"""Validate the four official one-page PDF exports after V5.1 final polish.

Usage: python3 scripts/resume-v51-pdf-qa.py /path/to/four/pdfs
Checks PDF structure, extractable text, the two project URLs, and
critical truth-in-advertising/skills assertions. Visual inspection remains separate.
"""
import json
import pathlib
import re
import subprocess
import sys

PROFILES = [
    "ai-frontend-v5-1", "ai-fullstack-v5-1",
    "ai-fullstack-agent-v5-1", "ai-agent-app-v5-1",
]
PROJECT_URLS = [
    "https://github.com/BakerSean168/memoflow",
    "https://github.com/BakerSean168/BodySense",
]
def run(*args):
    return subprocess.check_output(args, text=True, encoding="utf-8")

def check(directory):
    result = []
    for profile in PROFILES:
        path = directory / (profile + ".pdf")
        if not path.is_file():
            raise AssertionError("Missing PDF: " + str(path))
        info = run("pdfinfo", str(path))
        extracted = run("pdftotext", "-layout", str(path), "-")
        urls = run("pdfinfo", "-url", str(path))
        m = re.search(r"^Pages:\s*(\d+)\s*$", info, re.M)
        pages = int(m.group(1)) if m else -1
        assert pages == 1, (profile, "pages", pages)
        assert re.search(r"Page size:\s+595\.\d+ x 842\.\d+ pts \(A4\)", info), profile
        for keyword in ("2026", "MemoFlow", "BodySense"):
            assert keyword in extracted, (profile, "missing", keyword)
        assert "1500+" not in extracted, (profile, "unsubstantiated test count")
        assert "万篇" not in extracted, (profile, "unsubstantiated document scale")
        for url in PROJECT_URLS:
            assert url in urls, (profile, "missing live PDF link", url)
        if profile == "ai-frontend-v5-1":
            for keyword in ("Figma", "Penpot", "JavaScript", "TypeScript", "HTML5/CSS3"):
                assert keyword in extracted, (profile, "missing approved skill", keyword)
            assert "Promise" not in extracted, (profile, "unapproved Promise keyword")
        annotations = urls.count("Annotation")
        assert annotations >= 7, (profile, "too few clickable links", annotations)
        result.append({
            "profile": profile, "pages": pages, "paper": "A4",
            "pdf_bytes": path.stat().st_size, "url_annotations": annotations,
            "extractable_characters": len(extracted),
        })
    return result

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/resume-v51-pdf-qa.py <export-directory>")
    print("PDF_QA_OK", json.dumps(check(pathlib.Path(sys.argv[1])), ensure_ascii=False))
