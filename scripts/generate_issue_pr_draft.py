#!/usr/bin/env python3
"""Generate a safe AI draft-PR proposal from a GitHub issue.

This script does not modify product code directly. It creates a markdown proposal
file that is committed on a branch and opened as a draft PR. This keeps the
automation reviewable and low-risk while still accelerating implementation.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
OPENAI_API_URL = "https://api.openai.com/v1/responses"

IGNORED_DIRS = {
    ".git",
    ".github",
    "__pycache__",
    ".venv",
    "node_modules",
    "backend/data",
    "frontend/assets",
    "tmp",
    "test-results",
    ".pdf_preview",
    "extracted_pdf_pages",
}


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def sanitize_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:40] or "update"


def iter_repo_paths(limit: int = 250) -> list[str]:
    paths: list[str] = []
    for path in sorted(REPO_ROOT.rglob("*")):
        relative = path.relative_to(REPO_ROOT).as_posix()
        if any(relative == ignored or relative.startswith(f"{ignored}/") for ignored in IGNORED_DIRS):
            continue
        if path.is_file():
            paths.append(relative)
        if len(paths) >= limit:
            break
    return paths


def call_openai(issue_number: str, issue_title: str, issue_body: str, repo_name: str) -> dict:
    api_key = require_env("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-5.4").strip() or "gpt-5.4"
    file_tree = "\n".join(f"- {path}" for path in iter_repo_paths())

    prompt = f"""Repository: {repo_name}
Issue number: {issue_number}
Issue title: {issue_title}

Issue body:
{issue_body}

Relevant repository file tree snapshot:
{file_tree}

Generate a safe draft PR proposal for this issue.
Do not claim code is already implemented.
Prefer a compact plan that a coding agent can execute next.
"""

    payload = {
        "model": model,
        "instructions": (
            "You are preparing a safe draft pull request proposal from a GitHub issue. "
            "Return only valid JSON that follows the schema. "
            "Be concrete about likely files to touch, testing ideas, and risks. "
            "Assume this is a web app with a frontend, backend, and GitHub workflows."
        ),
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "draft_pr_proposal",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "branch_suffix": {"type": "string"},
                        "pr_title": {"type": "string"},
                        "pr_body": {"type": "string"},
                        "summary": {"type": "string"},
                        "likely_files": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "implementation_steps": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "validation_steps": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "risk_notes": {
                            "type": "array",
                            "items": {"type": "string"}
                        }
                    },
                    "required": [
                        "branch_suffix",
                        "pr_title",
                        "pr_body",
                        "summary",
                        "likely_files",
                        "implementation_steps",
                        "validation_steps",
                        "risk_notes"
                    ],
                    "additionalProperties": False
                }
            }
        }
    }

    request = urllib.request.Request(
        OPENAI_API_URL,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        data=json.dumps(payload).encode("utf-8"),
    )

    with urllib.request.urlopen(request, timeout=180) as response:
        raw = json.loads(response.read().decode("utf-8"))

    for item in raw.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                return json.loads(text)

    raise RuntimeError("OpenAI response did not contain a JSON text payload")


def write_proposal(issue_number: str, issue_title: str, proposal: dict) -> tuple[str, Path, str, str]:
    suffix = sanitize_slug(proposal["branch_suffix"])
    branch_name = f"auto/issue-{issue_number}-{suffix}"
    proposal_dir = REPO_ROOT / "automation" / f"issue-{issue_number}"
    proposal_dir.mkdir(parents=True, exist_ok=True)
    proposal_path = proposal_dir / "draft-pr-proposal.md"

    md = [
        f"# Draft PR Proposal for issue #{issue_number}",
        "",
        f"## Issue",
        f"- Title: {issue_title}",
        "",
        "## Summary",
        proposal["summary"].strip(),
        "",
        "## Likely files",
        *[f"- `{path}`" for path in proposal["likely_files"]],
        "",
        "## Implementation steps",
        *[f"- {step}" for step in proposal["implementation_steps"]],
        "",
        "## Validation steps",
        *[f"- {step}" for step in proposal["validation_steps"]],
        "",
        "## Risks / open points",
        *[f"- {note}" for note in proposal["risk_notes"]],
        "",
        "## Proposed PR body",
        proposal["pr_body"].strip(),
        "",
        "_Generated automatically from the GitHub issue. Review before coding or merging._",
    ]
    proposal_path.write_text("\n".join(md).strip() + "\n", encoding="utf-8")
    return branch_name, proposal_path, proposal["pr_title"].strip(), proposal["pr_body"].strip()


def write_github_output(branch_name: str, proposal_path: Path, pr_title: str, pr_body: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as fh:
        fh.write(f"branch_name={branch_name}\n")
        fh.write(f"proposal_path={proposal_path.relative_to(REPO_ROOT).as_posix()}\n")
        fh.write(f"pr_title<<EOF\n{pr_title}\nEOF\n")
        fh.write(f"pr_body<<EOF\n{pr_body}\nEOF\n")


def main() -> int:
    issue_number = require_env("ISSUE_NUMBER")
    issue_title = require_env("ISSUE_TITLE")
    issue_body = os.getenv("ISSUE_BODY", "").strip()
    repo_name = require_env("GITHUB_REPOSITORY")

    proposal = call_openai(issue_number, issue_title, issue_body, repo_name)
    branch_name, proposal_path, pr_title, pr_body = write_proposal(issue_number, issue_title, proposal)
    write_github_output(branch_name, proposal_path, pr_title, pr_body)
    print(json.dumps({
        "branch_name": branch_name,
        "proposal_path": proposal_path.relative_to(REPO_ROOT).as_posix(),
        "pr_title": pr_title,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
