from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAX_FILE_BYTES = 2 * 1024 * 1024

EXCLUDED_DIRS = {
    ".git",
    ".pytest_cache",
    ".ruff_cache",
    "node_modules",
    "dist",
    "test-results",
    "tmp",
    "__pycache__",
}

EXCLUDED_SUFFIXES = {
    ".db",
    ".gif",
    ".ico",
    ".jpg",
    ".jpeg",
    ".lock",
    ".pdf",
    ".png",
    ".pyd",
    ".pyc",
    ".sqlite",
    ".svg",
    ".webp",
    ".zip",
}

ALLOWLISTED_FILES = {
    ".env.production.example",
    ".env.telegram-bot.example",
}

HIGH_CONFIDENCE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("private key", re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}")),
    ("Telegram bot token", re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{30,}\b")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("OpenAI API key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
]

ENV_FILE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        "assigned secret",
        re.compile(
            r"(?i)\b(?:api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*['\"]?(?!replace_me\b|changeme\b|example\b|test\b|correct-password\b)[^'\"\s#]{12,}"
        ),
    ),
]


def should_scan(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if any(part in EXCLUDED_DIRS for part in relative.parts):
        return False
    if path.name.startswith("tmp_") or path.name.startswith(".tmp_") or path.name.endswith("_check.js"):
        return False
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    if path.name in ALLOWLISTED_FILES:
        return False
    try:
        return path.is_file() and path.stat().st_size <= MAX_FILE_BYTES
    except OSError:
        return False


def scan_file(path: Path) -> list[tuple[int, str]]:
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            content = path.read_text(encoding="utf-16")
        except UnicodeDecodeError:
            return []
    except OSError:
        return []

    findings: list[tuple[int, str]] = []
    patterns = list(HIGH_CONFIDENCE_PATTERNS)
    if path.name.startswith(".env") or path.suffix.lower() in {".env"}:
        patterns.extend(ENV_FILE_PATTERNS)
    for line_number, line in enumerate(content.splitlines(), start=1):
        for label, pattern in patterns:
            if pattern.search(line):
                findings.append((line_number, label))
    return findings


def iter_candidate_paths(tracked_only: bool) -> list[Path]:
    if not tracked_only:
        return list(ROOT.rglob("*"))

    completed = subprocess.run(
        ["git", "ls-files"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        print("Could not list tracked files with git ls-files.", file=sys.stderr)
        return []
    return [ROOT / line.strip() for line in completed.stdout.splitlines() if line.strip()]


def main() -> int:
    tracked_only = "--tracked-only" in sys.argv[1:]
    findings: list[tuple[Path, int, str]] = []
    for path in iter_candidate_paths(tracked_only):
        if not should_scan(path):
            continue
        for line_number, label in scan_file(path):
            findings.append((path.relative_to(ROOT), line_number, label))

    if findings:
        print("Potential secrets found. Values are intentionally not printed.")
        for path, line_number, label in findings:
            print(f"- {path}:{line_number} ({label})")
        return 1

    scope = "tracked files" if tracked_only else "workspace files"
    print(f"No potential secrets found in {scope}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
