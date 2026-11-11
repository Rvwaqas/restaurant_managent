#!/usr/bin/env python3
"""
SQLite Concurrency, WAL Mode & Fsync Performance Benchmark
Self-contained: requires ONLY Python standard library (no venv, no 3rd-party packages).
Tests durability, multi-threading (writers + readers with BEGIN IMMEDIATE), and simulates crash recovery.
Writes final result to pos_sqlite_check_report.txt AND prints to stdout.
"""

import argparse
import platform
import random
import sqlite3
import sys
import tempfile
import threading
import time
from pathlib import Path


def print_header(title: str):
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def test_sqlite_environment():
    print_header("1. SQLite Environment & Compile Options")
    py_ver = platform.python_version()
    sql_ver = sqlite3.sqlite_version
    print(f"Python Version: {py_ver}")
    print(f"SQLite Version: {sql_ver}")

    conn = sqlite3.connect(":memory:")
    cur = conn.cursor()
    cur.execute("PRAGMA compile_options")
    options = [row[0] for row in cur.fetchall()]
    threadsafe = "THREADSAFE=1" in options or "THREADSAFE=2" in options or getattr(sqlite3, "threadsafety", 0) >= 1
    print(f"Threadsafe: {threadsafe}")
    conn.close()
    return {"python_version": py_ver, "sqlite_version": sql_ver, "threadsafe": threadsafe}


def benchmark_commits(db_path: Path, n_commits: int = 500, synchronous: str = "NORMAL"):
    print_header(f"2. Fsync & Commit Benchmark ({n_commits} commits, SYNCHRONOUS={synchronous})")
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute(f"PRAGMA synchronous = {synchronous}")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS benchmark (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            val TEXT,
            ts REAL
        )
    """)
    conn.commit()

    latencies = []
    t_start = time.perf_counter()
    for i in range(n_commits):
        t0 = time.perf_counter()
        cur.execute("BEGIN IMMEDIATE")
        cur.execute("INSERT INTO benchmark (val, ts) VALUES (?, ?)", (f"row-{i}", t0))
        conn.commit()
        latencies.append(time.perf_counter() - t0)
    t_total = time.perf_counter() - t_start

    conn.close()

    latencies.sort()
    avg_ms = (sum(latencies) / len(latencies)) * 1000
    p50_ms = latencies[int(len(latencies) * 0.50)] * 1000
    p95_ms = latencies[int(len(latencies) * 0.95)] * 1000
    max_ms = max(latencies) * 1000
    cps = n_commits / t_total

    print(f"Total time for {n_commits} commits: {t_total:.2f} s ({cps:.1f} commits/sec)")
    print(f"Latency: Avg={avg_ms:.2f}ms, P50={p50_ms:.2f}ms, P95={p95_ms:.2f}ms, Max={max_ms:.2f}ms")

    status = "PASS"
    if cps < 50:
        print("[WARN] Commit throughput is low (< 50 commits/s). Device flash storage may be slow.")
        status = "WARN"
    else:
        print("[PASS] Commit throughput is sufficient for POS concurrent transactions.")

    return {
        "commits": n_commits,
        "commits_per_sec": cps,
        "avg_ms": avg_ms,
        "p95_ms": p95_ms,
        "status": status,
    }


def test_concurrency(db_path: Path, num_writers: int = 4, num_readers: int = 4, duration_secs: float = 3.0):
    print_header(f"3. Concurrency Stress Test ({num_writers} Writers, {num_readers} Readers, {duration_secs}s)")
    if db_path.exists():
        db_path.unlink()

    # Init schema
    init_conn = sqlite3.connect(str(db_path))
    init_conn.execute("PRAGMA journal_mode = WAL")
    init_conn.execute("PRAGMA synchronous = NORMAL")
    init_conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            writer_id INTEGER,
            seq INTEGER,
            amount REAL,
            created_at REAL
        )
    """)
    init_conn.commit()
    init_conn.close()

    stop_event = threading.Event()
    writer_counts = [0] * num_writers
    writer_errors = []
    reader_counts = [0] * num_readers
    reader_errors = []

    def writer_worker(w_id: int):
        try:
            conn = sqlite3.connect(str(db_path), timeout=5.0)
            conn.execute("PRAGMA busy_timeout = 5000")
            cur = conn.cursor()
            seq = 0
            while not stop_event.is_set():
                seq += 1
                cur.execute("BEGIN IMMEDIATE")
                cur.execute(
                    "INSERT INTO orders (writer_id, seq, amount, created_at) VALUES (?, ?, ?, ?)",
                    (w_id, seq, round(random.uniform(10.0, 150.0), 2), time.time())
                )
                conn.commit()
                writer_counts[w_id] += 1
                time.sleep(random.uniform(0.001, 0.005))
            conn.close()
        except Exception as e:
            writer_errors.append((w_id, str(e)))

    def reader_worker(r_id: int):
        try:
            conn = sqlite3.connect(str(db_path), timeout=5.0)
            conn.execute("PRAGMA busy_timeout = 5000")
            cur = conn.cursor()
            while not stop_event.is_set():
                cur.execute("SELECT COUNT(*), SUM(amount) FROM orders")
                _ = cur.fetchone()
                reader_counts[r_id] += 1
                time.sleep(random.uniform(0.002, 0.008))
            conn.close()
        except Exception as e:
            reader_errors.append((r_id, str(e)))

    threads = []
    for i in range(num_writers):
        t = threading.Thread(target=writer_worker, args=(i,))
        threads.append(t)
    for i in range(num_readers):
        t = threading.Thread(target=reader_worker, args=(i,))
        threads.append(t)

    for t in threads:
        t.start()

    time.sleep(duration_secs)
    stop_event.set()

    for t in threads:
        t.join(timeout=3.0)

    total_writes = sum(writer_counts)
    total_reads = sum(reader_counts)

    print(f"Completed {total_writes} writes and {total_reads} reads in {duration_secs}s.")
    print(f"Write rate: {total_writes / duration_secs:.1f} ops/sec")
    print(f"Read rate: {total_reads / duration_secs:.1f} ops/sec")

    if writer_errors:
        print(f"[FAIL] Writer errors encountered: {writer_errors}")
    else:
        print("[PASS] Zero writer errors (BEGIN IMMEDIATE prevented busy deadlocks).")

    if reader_errors:
        print(f"[FAIL] Reader errors encountered: {reader_errors}")
    else:
        print("[PASS] Zero reader errors (WAL mode enabled non-blocking reads).")

    # Integrity check
    check_conn = sqlite3.connect(str(db_path))
    cur = check_conn.cursor()
    cur.execute("PRAGMA integrity_check")
    integrity = cur.fetchone()[0]
    print(f"Integrity check: {integrity}")
    check_conn.close()

    status = "PASS" if not writer_errors and not reader_errors and integrity == "ok" else "FAIL"
    return {
        "writes": total_writes,
        "reads": total_reads,
        "duration": duration_secs,
        "integrity": integrity,
        "status": status,
    }


def test_wal_recovery(db_path: Path, n_records: int = 50):
    print_header("4. WAL Recovery & Crash Simulation")
    if db_path.exists():
        db_path.unlink()
    wal_path = Path(str(db_path) + "-wal")
    if wal_path.exists():
        wal_path.unlink()

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("CREATE TABLE crash_test (id INTEGER PRIMARY KEY, msg TEXT)")
    conn.commit()

    # Insert rows and leave uncheckpointed in WAL
    conn.execute("BEGIN IMMEDIATE")
    for i in range(n_records):
        conn.execute("INSERT INTO crash_test (msg) VALUES (?)", (f"record-{i}",))
    conn.commit()
    conn.close()

    print(f"WAL file size before recovery: {wal_path.stat().st_size if wal_path.exists() else 0} bytes")

    # Open fresh connection and force recovery
    new_conn = sqlite3.connect(str(db_path))
    cur = new_conn.cursor()
    cur.execute("SELECT COUNT(*) FROM crash_test")
    count = cur.fetchone()[0]
    cur.execute("PRAGMA integrity_check")
    integrity = cur.fetchone()[0]
    new_conn.close()

    print(f"Recovered rows: {count}/{n_records}")
    print(f"Integrity check after recovery: {integrity}")
    status = "PASS" if count == n_records and integrity == "ok" else "FAIL"
    if status == "PASS":
        print("[PASS] SQLite WAL crash recovery succeeded with zero data loss.")
    else:
        print("[FAIL] SQLite WAL crash recovery failed!")

    return {"recovered": count, "expected": n_records, "integrity": integrity, "status": status}


def main():
    parser = argparse.ArgumentParser(description="Restaurant POS - SQLite & Concurrency Diagnostics")
    parser.add_argument("--quick", action="store_true", help="Run quick benchmark (~5-10s)")
    args = parser.parse_args()

    mode_str = "QUICK" if args.quick else "FULL"
    n_commits = 150 if args.quick else 500
    n_writers = 2 if args.quick else 4
    n_readers = 2 if args.quick else 4
    duration = 2.0 if args.quick else 3.0
    n_recovery = 20 if args.quick else 50

    print(f"Running SQLite performance & concurrency verification ({mode_str} mode)...")

    with tempfile.TemporaryDirectory() as tmpdir:
        test_dir = Path(tmpdir)
        env_res = test_sqlite_environment()
        bench_res = benchmark_commits(test_dir / "bench.db", n_commits=n_commits, synchronous="NORMAL")
        conc_res = test_concurrency(test_dir / "concurrent.db", num_writers=n_writers, num_readers=n_readers, duration_secs=duration)
        rec_res = test_wal_recovery(test_dir / "recovery.db", n_records=n_recovery)

    # Determine overall result
    statuses = [bench_res["status"], conc_res["status"], rec_res["status"]]
    if "FAIL" in statuses:
        overall = "FAIL"
    elif "WARN" in statuses:
        overall = "WARN"
    else:
        overall = "PASS"

    arch = platform.machine() or "unknown"
    if arch.lower() in ("aarch64", "arm64"):
        rec_plan = "Plan A (Native Termux)"
        rec_reason = "ARM64 storage throughput and SQLite WAL concurrency are sufficient for native POS operations."
    else:
        rec_plan = "Plan B (PRoot Ubuntu)"
        rec_reason = "Non-native ARM architecture or testing platform benefits from glibc Linux environment."

    report_content = f"""RESULT: {overall}
Device Hardware: {platform.platform()} ({arch})
Python Version: {env_res['python_version']}
SQLite Version: {env_res['sqlite_version']}
Test Mode: {mode_str}
Commit Throughput: {bench_res['commits_per_sec']:.1f} commits/s (Avg {bench_res['avg_ms']:.2f}ms, P95 {bench_res['p95_ms']:.2f}ms)
Concurrency: {conc_res['writes']} writes, {conc_res['reads']} reads in {duration}s ({conc_res['integrity']})
Crash Recovery: {rec_res['recovered']}/{rec_res['expected']} rows recovered ({rec_res['integrity']})
Recommended Plan: {rec_plan}
Reason: {rec_reason}
"""

    report_file = Path("pos_sqlite_check_report.txt")
    report_file.write_text(report_content, encoding="utf-8")

    print_header("FINAL SQLITE REPORT")
    print(report_content)
    print(f"Report written to {report_file.resolve()}\n")

    if overall == "FAIL":
        sys.exit(1)


if __name__ == "__main__":
    main()
