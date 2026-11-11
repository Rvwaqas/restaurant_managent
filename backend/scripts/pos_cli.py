#!/usr/bin/env python3
"""
Restaurant POS - Unified CLI Management Tool
Handles start, stop, restart, status, logs, doctor, backup, update, rollback, certs, urls, and version.
"""

import os
import sys
import json
import shutil
import tarfile
import argparse
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
POS_ROOT = SCRIPT_DIR.parent
if str(POS_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(POS_ROOT / "backend"))
if str(POS_ROOT) not in sys.path:
    sys.path.insert(0, str(POS_ROOT))

from app.core.config import settings

def run_cmd(cmd: list[str], check: bool = True, cwd: Path = POS_ROOT) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, cwd=cwd)

def cmd_status():
    status_file = POS_ROOT / "run" / "status.json"
    pid_file = POS_ROOT / "run" / "server.pid"
    print("\n--- Restaurant POS Status ---")
    if status_file.exists():
        try:
            data = json.loads(status_file.read_text(encoding="utf-8"))
            print(f"State:        {data.get('state', 'unknown').upper()}")
            print(f"PID:          {data.get('pid', 'N/A')}")
            print(f"Restarts:     {data.get('restarts', 0)}")
            print(f"Last Exit:    {data.get('last_exit_code', 0)}")
            print(f"Updated At:   {data.get('updated_at', 'N/A')}")
        except Exception:
            print(status_file.read_text(encoding="utf-8"))
    elif pid_file.exists():
        print(f"State: RUNNING (PID {pid_file.read_text().strip()})")
    else:
        print("State: STOPPED")

    print(f"Server Mode:  {settings.SERVER_MODE.upper()}")
    print(f"Database:     {settings.DATABASE_PATH}")
    print("-----------------------------\n")

def cmd_start():
    run_server = SCRIPT_DIR / "run_server.sh"
    if run_server.exists() and os.name != "nt":
        subprocess.run(["bash", str(run_server), "start"], check=True)
    else:
        print("Starting uvicorn server directly...")
        subprocess.Popen([sys.executable, "-m", "app.serve"], cwd=POS_ROOT)

def cmd_stop():
    run_server = SCRIPT_DIR / "run_server.sh"
    if run_server.exists() and os.name != "nt":
        subprocess.run(["bash", str(run_server), "stop"], check=True)
    else:
        pid_file = POS_ROOT / "run" / "server.pid"
        if pid_file.exists():
            pid = int(pid_file.read_text().strip())
            try:
                import signal
                os.kill(pid, signal.SIGTERM)
                print(f"Stopped PID {pid}.")
            except Exception as e:
                print(f"Error stopping process: {e}")
            pid_file.unlink(missing_ok=True)
        else:
            print("Server is not running.")

def cmd_restart():
    cmd_stop()
    import time
    time.sleep(1)
    cmd_start()

def cmd_logs(lines: int = 50, follow: bool = False):
    log_file = POS_ROOT / "data" / "logs" / "server.log"
    if not log_file.exists():
        log_file = POS_ROOT / "data" / "logs" / "pos.log"
    if not log_file.exists():
        print("No log files found in data/logs/.")
        return

    if follow and os.name != "nt":
        subprocess.run(["tail", f"-n{lines}", "-f", str(log_file)])
    else:
        content = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
        print("\n".join(content[-lines:]))

def cmd_doctor():
    subprocess.run([sys.executable, str(SCRIPT_DIR / "doctor.py")])

def cmd_backup():
    print("Backing up SQLite database...")
    subprocess.run([sys.executable, str(SCRIPT_DIR / "backup.py")])
    print("Backing up config and certificates...")
    subprocess.run([sys.executable, str(SCRIPT_DIR / "backup_config.py")])

def cmd_urls(qr: bool = False):
    cmd = [sys.executable, str(SCRIPT_DIR / "show_urls.py")]
    if qr:
        cmd.append("--qr")
    subprocess.run(cmd)

def cmd_certs(args: list[str]):
    subprocess.run([sys.executable, str(SCRIPT_DIR / "certs.py")] + args)

def cmd_update(bundle_path_str: str):
    bundle_path = Path(bundle_path_str).resolve()
    if not bundle_path.exists():
        print(f"[FAIL] Release bundle not found: {bundle_path}")
        sys.exit(1)

    print(f"Starting update with bundle: {bundle_path.name}")
    
    # 1. Automatic pre-update backup
    print(">>> [1/5] Performing pre-update backup...")
    cmd_backup()

    # 2. Extract into releases/<version>
    releases_dir = POS_ROOT / "releases"
    releases_dir.mkdir(parents=True, exist_ok=True)

    # Inspect tarball to determine version
    rel_name = bundle_path.stem.replace(".tar", "")
    target_rel_dir = releases_dir / rel_name
    print(f">>> [2/5] Extracting into {target_rel_dir}...")
    if target_rel_dir.exists():
        shutil.rmtree(target_rel_dir)
    target_rel_dir.mkdir(parents=True)

    with tarfile.open(bundle_path, "r:gz") as tar:
        tar.extractall(target_rel_dir)

    # 3. Smoke migrations on target release
    print(">>> [3/5] Running database migrations...")
    try:
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{target_rel_dir / 'backend'}:{target_rel_dir}"
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=target_rel_dir / "backend",
            env=env,
            check=True
        )
    except Exception as e:
        print(f"[FAIL] Migration failed: {e}. Aborting update!")
        shutil.rmtree(target_rel_dir, ignore_errors=True)
        sys.exit(1)

    # 4. Atomic symlink switch
    current_symlink = POS_ROOT / "current"
    prev_symlink = POS_ROOT / "previous"
    print(">>> [4/5] Updating release symlink...")
    if current_symlink.exists() or current_symlink.is_symlink():
        if prev_symlink.exists() or prev_symlink.is_symlink():
            prev_symlink.unlink()
        try:
            target_prev = current_symlink.resolve()
            prev_symlink.symlink_to(target_prev, target_is_directory=True)
        except Exception:
            pass
        current_symlink.unlink()

    try:
        current_symlink.symlink_to(target_rel_dir, target_is_directory=True)
    except Exception as e:
        print(f"[WARN] Symlink creation: {e}")

    # 5. Restart service
    print(">>> [5/5] Restarting service...")
    cmd_restart()
    print("\n[PASS] POS update completed successfully!")

def cmd_rollback():
    prev_symlink = POS_ROOT / "previous"
    current_symlink = POS_ROOT / "current"
    if not (prev_symlink.exists() or prev_symlink.is_symlink()):
        print("[FAIL] No previous release found for rollback.")
        sys.exit(1)

    print("Rolling back to previous release...")
    target_prev = prev_symlink.resolve()
    if current_symlink.exists() or current_symlink.is_symlink():
        current_symlink.unlink()
    current_symlink.symlink_to(target_prev, target_is_directory=True)
    cmd_restart()
    print(f"[PASS] Successfully rolled back to: {target_prev.name}")

def main():
    parser = argparse.ArgumentParser(description="Restaurant POS Management CLI")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("start", help="Start POS server")
    subparsers.add_parser("stop", help="Stop POS server")
    subparsers.add_parser("restart", help="Restart POS server")
    subparsers.add_parser("status", help="Show POS status")
    
    logs_p = subparsers.add_parser("logs", help="View server logs")
    logs_p.add_argument("-n", "--lines", type=int, default=50, help="Number of lines")
    logs_p.add_argument("-f", "--follow", action="store_true", help="Follow log output")

    subparsers.add_parser("doctor", help="Run POS diagnostics")
    subparsers.add_parser("backup", help="Run database & config backup")

    urls_p = subparsers.add_parser("urls", help="Display access URLs")
    urls_p.add_argument("--qr", action="store_true", help="Display terminal QR code")

    update_p = subparsers.add_parser("update", help="Update POS from release bundle")
    update_p.add_argument("bundle", type=str, help="Path to release tar.gz")

    subparsers.add_parser("rollback", help="Roll back to previous release")

    certs_p = subparsers.add_parser("certs", help="Manage TLS certificates")
    certs_p.add_argument("cert_args", nargs=argparse.REMAINDER, help="Arguments passed to certs tool")

    subparsers.add_parser("version", help="Show version information")

    args = parser.parse_args()

    if args.command == "start":
        cmd_start()
    elif args.command == "stop":
        cmd_stop()
    elif args.command == "restart":
        cmd_restart()
    elif args.command == "status":
        cmd_status()
    elif args.command == "logs":
        cmd_logs(lines=args.lines, follow=args.follow)
    elif args.command == "doctor":
        cmd_doctor()
    elif args.command == "backup":
        cmd_backup()
    elif args.command == "urls":
        cmd_urls(qr=args.qr)
    elif args.command == "update":
        cmd_update(args.bundle)
    elif args.command == "rollback":
        cmd_rollback()
    elif args.command == "certs":
        cmd_certs(args.cert_args)
    elif args.command == "version":
        print(f"Restaurant POS v{getattr(settings, 'APP_VERSION', '1.0.0')}")
        cur = POS_ROOT / "current"
        if cur.exists() and cur.is_symlink():
            print(f"Active release: {cur.resolve().name}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
