#!/usr/bin/env python3
"""
Restaurant POS - Health & Memory Watchdog
Monitors /api/health endpoint, checks memory usage, and triggers restarts
after 3 consecutive failures.
"""

import sys
import os
import time
import argparse
import urllib.request
import urllib.error
import json
import subprocess
from pathlib import Path

# Add project root and backend to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
POS_ROOT = SCRIPT_DIR.parent
if str(POS_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(POS_ROOT / "backend"))
if str(POS_ROOT) not in sys.path:
    sys.path.insert(0, str(POS_ROOT))

from app.core.config import settings

def get_server_url() -> str:
    if settings.SERVER_MODE == "https":
        return f"https://127.0.0.1:{settings.HTTPS_PORT}/api/health"
    return f"http://127.0.0.1:{settings.HTTP_PORT}/api/health"

def check_health(timeout: float = 5.0) -> tuple[bool, str]:
    url = get_server_url()
    try:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # Loopback self-test

        req = urllib.request.Request(url, headers={"User-Agent": "POS-Watchdog/1.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return True, data.get("status", "ok")
            return False, f"HTTP status {resp.status}"
    except Exception as e:
        return False, str(e)

def get_process_memory_mb(pid: int) -> float:
    try:
        # Check Linux /proc/<pid>/statm or status
        statm_path = Path(f"/proc/{pid}/statm")
        if statm_path.exists() and hasattr(os, "sysconf"):
            pages = int(statm_path.read_text().split()[1])
            page_size_kb = getattr(os, "sysconf")("SC_PAGE_SIZE") / 1024
            return (pages * page_size_kb) / 1024
    except Exception:
        pass
    return 0.0

def restart_service():
    print("[WATCHDOG] Initiating service restart...")
    run_server = SCRIPT_DIR / "run_server.sh"
    if run_server.exists():
        subprocess.run(["bash", str(run_server), "restart"], check=False)
    else:
        print("[WATCHDOG] Error: scripts/run_server.sh not found.")

def main():
    parser = argparse.ArgumentParser(description="Restaurant POS Watchdog")
    parser.add_argument("--once", action="store_true", help="Perform single health check and exit")
    parser.add_argument("--interval", type=int, default=60, help="Check interval in seconds (default: 60)")
    parser.add_argument("--max-failures", type=int, default=3, help="Consecutive failures before restart (default: 3)")
    parser.add_argument("--mem-warn-mb", type=float, default=500.0, help="RSS memory warning threshold in MB (default: 500)")
    args = parser.parse_args()

    if args.once:
        ok, msg = check_health()
        print(f"Health: {'OK' if ok else 'FAIL'} - {msg}")
        sys.exit(0 if ok else 1)

    print(f"Starting POS watchdog (interval={args.interval}s, max_failures={args.max_failures})...")
    consecutive_failures = 0

    while True:
        ok, msg = check_health()
        pid_file = POS_ROOT / "run" / "server.pid"
        server_pid = int(pid_file.read_text().strip()) if pid_file.exists() else 0

        mem_mb = get_process_memory_mb(server_pid) if server_pid else 0.0

        if ok:
            consecutive_failures = 0
            if mem_mb > args.mem_warn_mb:
                print(f"[WARN] Memory usage elevated: {mem_mb:.1f} MB (PID {server_pid})")
        else:
            consecutive_failures += 1
            print(f"[WARN] Health check failure ({consecutive_failures}/{args.max_failures}): {msg}")
            if consecutive_failures >= args.max_failures:
                print(f"[ALERT] {args.max_failures} consecutive failures! Triggering restart.")
                restart_service()
                consecutive_failures = 0

        time.sleep(args.interval)

if __name__ == "__main__":
    main()
