from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_step(label: str, command: list[str], cwd: Path) -> int:
    print(f"\n== {label} ==")
    print(" ".join(command))
    completed = subprocess.run(command, cwd=cwd)
    return completed.returncode


def main() -> int:
    failures: list[str] = []

    code = run_step("Secret scan", [sys.executable, str(ROOT / "scripts" / "secret_scan.py"), "--tracked-only"], ROOT)
    if code:
        failures.append("Secret scan")

    pip_audit = shutil.which("pip-audit")
    pip_audit_command = [pip_audit] if pip_audit else [sys.executable, "-m", "pip_audit"]
    code = run_step(
        "Python dependencies",
        [*pip_audit_command, "-r", str(ROOT / "backend" / "requirements.txt")],
        ROOT,
    )
    if code:
        print("\n== Python dependencies ==")
        print("pip-audit is not installed. Install it with: python -m pip install pip-audit")
        failures.append("Python dependency audit")

    npm = shutil.which("npm")
    if npm:
        code = run_step("Frontend dependencies", [npm, "audit", "--audit-level=moderate"], ROOT / "frontend")
        if code:
            failures.append("Frontend dependency audit")
    else:
        print("\n== Frontend dependencies ==")
        print("npm is not available on PATH.")
        failures.append("Frontend dependency audit")

    if failures:
        print("\nSecurity audit failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nSecurity audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
