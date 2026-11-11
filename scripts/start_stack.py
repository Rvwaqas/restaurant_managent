"""
Python process manager for starting backend and frontend completely detached.
Supports custom ports, scratch databases, and simulated printer failure for live E2E testing.
"""
import os
import sys
import subprocess
import time
import json
import argparse

parser = argparse.ArgumentParser(description="Start POS backend and frontend stack detached.")
parser.add_argument("--backend-port", type=int, default=int(os.environ.get("BACKEND_PORT", 8000)))
parser.add_argument("--frontend-port", type=int, default=int(os.environ.get("FRONTEND_PORT", 3000)))
parser.add_argument("--scratch-db", type=str, default=os.environ.get("SCRATCH_DB", ""))
parser.add_argument("--pids-file", type=str, default=os.environ.get("STACK_PIDS_FILE", ""))
parser.add_argument("--fail-printers", type=str, default=os.environ.get("SIMULATE_FAIL_PRINTERS", ""))
parser.add_argument("--print-sim-dir", type=str, default=os.environ.get("PRINT_SIM_DIR", ""))
parser.add_argument("--write-stack-json", type=str, default=os.environ.get("WRITE_STACK_JSON", ""))
parser.add_argument("--wait-healthy", action="store_true", default=False)
parser.add_argument("--backend-only", action="store_true")

args = parser.parse_args()

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
run_dir = os.path.join(root_dir, "run")
logs_dir = os.path.join(run_dir, "logs")
pids_file = args.pids_file or os.path.join(run_dir, "stack.pids")
scratch_db = args.scratch_db or os.path.join(run_dir, "scratch", "scratch_pos.db")
print_sim_dir = args.print_sim_dir or os.path.join(root_dir, "data", "print_sim")

os.makedirs(logs_dir, exist_ok=True)
os.makedirs(os.path.dirname(scratch_db), exist_ok=True)
os.makedirs(print_sim_dir, exist_ok=True)

# Flags to detach completely on Windows
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0

backend_log = open(os.path.join(logs_dir, f"backend_{args.backend_port}.log"), "a", encoding="utf-8")
backend_err = open(os.path.join(logs_dir, f"backend_{args.backend_port}_err.log"), "a", encoding="utf-8")

# Backend environment
backend_env = os.environ.copy()
scratch_uri = "sqlite:///" + scratch_db.replace("\\", "/")
backend_env["DATABASE_URL"] = scratch_uri
backend_env["PRINT_MODE"] = "simulate"
backend_env["PRINT_SIM_DIR"] = print_sim_dir
backend_env["AUTO_MIGRATE"] = "false"
backend_env["PYTHONPATH"] = os.path.join(root_dir, "backend")
backend_env["SIMULATE_FAIL_PRINTERS"] = args.fail_printers

# 1. Start Backend
backend_cmd = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    str(args.backend_port),
]
backend_proc = subprocess.Popen(
    backend_cmd,
    cwd=os.path.join(root_dir, "backend"),
    env=backend_env,
    stdout=backend_log,
    stderr=backend_err,
    creationflags=flags,
)

frontend_proc = None
if not args.backend_only:
    # 2. Start Frontend
    frontend_log = open(os.path.join(logs_dir, f"frontend_{args.frontend_port}.log"), "a", encoding="utf-8")
    frontend_err = open(os.path.join(logs_dir, f"frontend_{args.frontend_port}_err.log"), "a", encoding="utf-8")
    frontend_env = os.environ.copy()
    frontend_env["PORT"] = str(args.frontend_port)
    frontend_env["NEXT_PUBLIC_API_URL"] = f"http://localhost:{args.backend_port}/api"
    frontend_env["NEXT_PUBLIC_USE_MOCK"] = "false"

    next_bin = os.path.join(root_dir, "node_modules", "next", "dist", "bin", "next")
    frontend_cmd = ["node", next_bin, "start", "-p", str(args.frontend_port)]
    frontend_proc = subprocess.Popen(
        frontend_cmd,
        cwd=root_dir,
        env=frontend_env,
        stdout=frontend_log,
        stderr=frontend_err,
        creationflags=flags,
    )

# Record PIDs
pids_data = {
    "backend": backend_proc.pid,
    "frontend": frontend_proc.pid if frontend_proc else None,
    "backendPort": args.backend_port,
    "frontendPort": args.frontend_port,
    "scratchDb": scratch_db,
    "printSimDir": print_sim_dir,
    "startedAt": time.time(),
}
with open(pids_file, "w", encoding="utf-8") as f:
    json.dump(pids_data, f, indent=2)

if args.write_stack_json:
    os.makedirs(os.path.dirname(os.path.abspath(args.write_stack_json)), exist_ok=True)
    stack_json_data = {
        "backendPort": args.backend_port,
        "frontendPort": args.frontend_port,
        "backendPid": backend_proc.pid,
        "frontendPid": frontend_proc.pid if frontend_proc else None,
        "scratchFolder": os.path.dirname(scratch_db),
        "scratchDb": scratch_db,
        "printSimFolder": print_sim_dir,
    }
    with open(args.write_stack_json, "w", encoding="utf-8") as f:
        json.dump(stack_json_data, f, indent=2)

frontend_msg = f", Frontend PID={frontend_proc.pid} (: {args.frontend_port})" if frontend_proc else ""
print(f"[START_STACK] Spawned detached: Backend PID={backend_proc.pid} (:{args.backend_port}){frontend_msg}")

if args.wait_healthy:
    import urllib.request
    print(f"[START_STACK] Waiting for stack health (ports {args.backend_port}, {args.frontend_port})...")
    backend_ok = False
    frontend_ok = not frontend_proc
    start_time = time.time()
    while time.time() - start_time < 30:
        if not backend_ok:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{args.backend_port}/api/health", timeout=1) as resp:
                    if resp.status == 200:
                        backend_ok = True
                        print(f"  [OK] Backend healthy on {args.backend_port}")
            except Exception:
                pass
        if not frontend_ok and frontend_proc:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{args.frontend_port}/", timeout=1) as resp:
                    if 200 <= resp.status < 400:
                        frontend_ok = True
                        print(f"  [OK] Frontend healthy on {args.frontend_port}")
            except Exception:
                pass
        if backend_ok and frontend_ok:
            break
        time.sleep(0.5)

    if not backend_ok or not frontend_ok:
        print("[ERROR] Stack failed to become healthy within timeout.")
        sys.exit(1)
    print("READY")
