#!/usr/bin/env python3
"""Minimal Telegram -> GitHub issue bridge.

This bot uses Telegram long polling and the GitHub REST API.
Secrets must come from environment variables on the server.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


TELEGRAM_API = "https://api.telegram.org"
GITHUB_API = "https://api.github.com"
POLL_TIMEOUT_SECONDS = 50
RETRY_DELAY_SECONDS = 5


@dataclass
class Config:
    telegram_bot_token: str
    telegram_allowed_chat_id: str
    github_token: str
    github_repo: str
    state_path: Path


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_config() -> Config:
    state_path = os.getenv(
        "TELEGRAM_STATE_PATH",
        str(Path(__file__).resolve().parents[1] / "backend" / "data" / "telegram_issue_bot_state.json"),
    )
    return Config(
        telegram_bot_token=require_env("TELEGRAM_BOT_TOKEN"),
        telegram_allowed_chat_id=require_env("TELEGRAM_ALLOWED_CHAT_ID"),
        github_token=require_env("GITHUB_TOKEN"),
        github_repo=os.getenv("GITHUB_REPO", "foudefun/go").strip() or "foudefun/go",
        state_path=Path(state_path),
    )


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"offset": 0}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"offset": 0}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    raw_data = None
    request_headers = headers.copy() if headers else {}
    if payload is not None:
        raw_data = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=raw_data, headers=request_headers, method=method)
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def telegram_request(config: Config, method: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{TELEGRAM_API}/bot{config.telegram_bot_token}/{method}"
    data = http_json(url, method="POST", payload=payload)
    if not data.get("ok"):
        raise RuntimeError(f"Telegram API error for {method}: {data}")
    return data


def github_create_issue(config: Config, title: str, body: str, labels: list[str]) -> dict[str, Any]:
    url = f"{GITHUB_API}/repos/{config.github_repo}/issues"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {config.github_token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "go-telegram-issue-bot",
    }
    payload: dict[str, Any] = {"title": title, "body": body}
    if labels:
        payload["labels"] = labels
    return http_json(url, method="POST", headers=headers, payload=payload)


def send_message(config: Config, text: str) -> None:
    telegram_request(
        config,
        "sendMessage",
        {"chat_id": config.telegram_allowed_chat_id, "text": text, "disable_web_page_preview": True},
    )


def normalize_text(message: dict[str, Any]) -> str:
    text = message.get("text") or ""
    return text.strip()


def classify_issue(text: str) -> tuple[str, list[str], str]:
    lowered = text.lower()
    labels: list[str] = []
    kind = "task"
    clean_text = text

    for prefix, detected_kind, detected_labels in (
        ("bug:", "bug", ["bug"]),
        ("feature:", "feature", ["enhancement"]),
        ("idea:", "idea", ["idea"]),
        ("urgent:", "urgent", ["urgent"]),
    ):
        if lowered.startswith(prefix):
            kind = detected_kind
            labels = detected_labels.copy()
            clean_text = text[len(prefix) :].strip()
            break

    if not clean_text:
        clean_text = text

    return kind, labels, clean_text


def build_issue_payload(message: dict[str, Any]) -> tuple[str, str, list[str]]:
    text = normalize_text(message)
    kind, labels, clean_text = classify_issue(text)
    labels = ["from-telegram", *labels]

    lines = [line.strip() for line in clean_text.splitlines() if line.strip()]
    title = lines[0] if lines else "New request from Telegram"
    if len(title) > 120:
        title = title[:117].rstrip() + "..."

    sender = message.get("from", {}) or {}
    sender_name = sender.get("username") or " ".join(
        part for part in [sender.get("first_name", ""), sender.get("last_name", "")] if part
    ).strip()
    sender_name = sender_name or "unknown"

    body_lines = [
        f"Imported from Telegram ({kind}).",
        "",
        f"- Sender: `{sender_name}`",
        f"- Chat ID: `{message.get('chat', {}).get('id', '')}`",
        f"- Message ID: `{message.get('message_id', '')}`",
        "",
        "## Request",
        clean_text,
    ]
    return title, "\n".join(body_lines), labels


def handle_command(config: Config, text: str) -> bool:
    lowered = text.lower()
    if lowered in {"/start", "/help"}:
        send_message(
            config,
            "Send a message and I will create a GitHub issue.\n"
            "Optional prefixes: bug:, feature:, idea:, urgent:",
        )
        return True
    if lowered == "/ping":
        send_message(config, "Bot is running.")
        return True
    return False


def process_message(config: Config, message: dict[str, Any]) -> None:
    chat_id = str(message.get("chat", {}).get("id", ""))
    if chat_id != config.telegram_allowed_chat_id:
        return

    text = normalize_text(message)
    if not text:
        send_message(config, "Please send text only. I will turn it into a GitHub issue.")
        return

    if handle_command(config, text):
        return

    title, body, labels = build_issue_payload(message)
    issue = github_create_issue(config, title, body, labels)
    issue_number = issue.get("number")
    issue_url = issue.get("html_url", "")
    issue_title = issue.get("title", title)
    send_message(
        config,
        f"Created GitHub issue #{issue_number} in {config.github_repo}:\n"
        f"{issue_title}\n{issue_url}",
    )


def poll_updates(config: Config, offset: int) -> tuple[list[dict[str, Any]], int]:
    data = telegram_request(
        config,
        "getUpdates",
        {"offset": offset, "timeout": POLL_TIMEOUT_SECONDS, "allowed_updates": ["message"]},
    )
    updates = data.get("result", []) or []
    next_offset = offset
    if updates:
        next_offset = int(updates[-1]["update_id"]) + 1
    return updates, next_offset


def main() -> int:
    config = load_config()
    state = load_state(config.state_path)
    offset = int(state.get("offset", 0))

    while True:
        try:
            updates, next_offset = poll_updates(config, offset)
            for update in updates:
                try:
                    message = update.get("message")
                    if message:
                        process_message(config, message)
                except Exception as exc:  # pragma: no cover
                    print(f"Message processing error: {exc}", file=sys.stderr)
                    try:
                        send_message(config, f"I could not create the GitHub issue right now: {exc}")
                    except Exception:
                        pass
                finally:
                    offset = int(update.get("update_id", offset - 1)) + 1
                    save_state(config.state_path, {"offset": offset})
            if next_offset > offset:
                offset = next_offset
                save_state(config.state_path, {"offset": offset})
        except urllib.error.HTTPError as exc:
            print(f"HTTP error: {exc}", file=sys.stderr)
            time.sleep(RETRY_DELAY_SECONDS)
        except urllib.error.URLError as exc:
            print(f"Network error: {exc}", file=sys.stderr)
            time.sleep(RETRY_DELAY_SECONDS)
        except Exception as exc:  # pragma: no cover
            print(f"Unexpected error: {exc}", file=sys.stderr)
            time.sleep(RETRY_DELAY_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
