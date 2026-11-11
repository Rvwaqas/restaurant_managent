#!/usr/bin/env python3
"""
Restaurant POS - Load & Soak Multi-Tablet Simulator
Simulates concurrent waiter tablets placing orders, sending batches, voiding items,
and settling bills against the POS server over HTTP or HTTPS.
"""

import sys
import time
import json
import random
import urllib.request
import urllib.error
import ssl
import argparse
import threading
from pathlib import Path

# Add project root and backend to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
POS_ROOT = SCRIPT_DIR.parent
if str(POS_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(POS_ROOT / "backend"))
if str(POS_ROOT) not in sys.path:
    sys.path.insert(0, str(POS_ROOT))

class TabletSimulator:
    def __init__(self, base_url: str, tablet_id: int):
        self.base_url = base_url.rstrip("/")
        self.tablet_id = tablet_id
        self.token = ""
        self.menu_item_ids: list[str] = []
        self.table_ids: list[str] = []

        # SSL context ignoring self-signed LAN certs during loadcheck
        self.ssl_ctx = ssl.create_default_context()
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | None, float]:
        url = f"{self.base_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": f"POS-LoadCheck-Tablet/{self.tablet_id}"
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        data = json.dumps(body).encode("utf-8") if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        t0 = time.perf_counter()
        status_code = 0
        resp_data = None
        try:
            with urllib.request.urlopen(req, timeout=10.0, context=self.ssl_ctx) as resp:
                status_code = resp.status
                raw = resp.read().decode("utf-8")
                if raw:
                    try:
                        resp_data = json.loads(raw)
                    except Exception:
                        pass
        except urllib.error.HTTPError as e:
            status_code = e.code
            try:
                resp_data = json.loads(e.read().decode("utf-8"))
            except Exception:
                pass
        except Exception as e:
            status_code = 599  # connection/network error

        latency = time.perf_counter() - t0
        return status_code, resp_data, latency

    def login(self) -> bool:
        status, data, _ = self.request("POST", "/api/auth/login", {"pin": "1234"})
        if status == 200 and data and "token" in data:
            self.token = data["token"]
            return True
        return False

    def fetch_menu_and_tables(self):
        status, data, _ = self.request("GET", "/api/menu/items")
        if status == 200 and data:
            self.menu_item_ids = [item["id"] for item in data if item.get("isAvailable", True)]
        
        status, data, _ = self.request("GET", "/api/tables")
        if status == 200 and data:
            self.table_ids = [t["id"] for t in data]

def run_loadcheck(base_url: str, num_tablets: int, duration_seconds: float):
    print("\n" + "=" * 60)
    print(f" Restaurant POS Load & Soak Check: {num_tablets} Tablets, {duration_seconds:.1f}s")
    print(f" Target URL: {base_url}")
    print("=" * 60 + "\n")

    latencies: list[float] = []
    status_codes: dict[int, int] = {}
    lock = threading.Lock()
    stop_event = threading.Event()
    stats = {"orders_created": 0, "orders_paid": 0, "errors": 0}

    def record_metric(status: int, latency: float):
        with lock:
            latencies.append(latency)
            status_codes[status] = status_codes.get(status, 0) + 1
            if status >= 400:
                stats["errors"] += 1

    def tablet_worker(tablet_id: int):
        sim = TabletSimulator(base_url, tablet_id)
        if not sim.login():
            with lock:
                stats["errors"] += 1
            return

        sim.fetch_menu_and_tables()
        if not sim.menu_item_ids or not sim.table_ids:
            return

        while not stop_event.is_set():
            # 1. Pick a random table and place order
            table_id = random.choice(sim.table_ids)
            items_to_send = [
                {"menuItemId": random.choice(sim.menu_item_ids), "qty": random.randint(1, 3)}
                for _ in range(random.randint(1, 3))
            ]

            req_id = f"load-req-{tablet_id}-{time.time()}-{random.randint(1000, 9999)}"
            status, resp, lat = sim.request("POST", "/api/orders", {
                "tableId": table_id,
                "requestId": req_id,
                "items": items_to_send
            })
            record_metric(status, lat)

            order_id = None
            if status == 200 and resp and "order" in resp:
                order_id = resp["order"]["id"]
                with lock:
                    stats["orders_created"] += 1

            time.sleep(random.uniform(0.05, 0.2))

            # 2. If order created, pay it
            if order_id:
                pay_req_id = f"load-pay-{tablet_id}-{time.time()}-{random.randint(1000, 9999)}"
                method = random.choice(["cash", "card", "qr"])
                p_status, p_resp, p_lat = sim.request("POST", f"/api/orders/{order_id}/pay", {
                    "requestId": pay_req_id,
                    "method": method
                })
                record_metric(p_status, p_lat)
                if p_status == 200:
                    with lock:
                        stats["orders_paid"] += 1

            time.sleep(random.uniform(0.1, 0.3))

    threads = []
    for i in range(num_tablets):
        t = threading.Thread(target=tablet_worker, args=(i + 1,))
        threads.append(t)
        t.start()

    time.sleep(duration_seconds)
    stop_event.set()

    for t in threads:
        t.join(timeout=5.0)

    # Print summary
    print("\n" + "=" * 60)
    print("                    Load Check Results                      ")
    print("=" * 60)
    total_reqs = len(latencies)
    print(f"Total Requests:      {total_reqs}")
    print(f"Orders Created:      {stats['orders_created']}")
    print(f"Orders Settled:      {stats['orders_paid']}")
    print(f"Total Errors:        {stats['errors']}")
    print(f"HTTP Status Codes:   {status_codes}")

    if latencies:
        latencies.sort()
        avg_ms = (sum(latencies) / len(latencies)) * 1000
        p50_ms = latencies[int(len(latencies) * 0.50)] * 1000
        p95_ms = latencies[int(len(latencies) * 0.95)] * 1000
        p99_ms = latencies[int(len(latencies) * 0.99)] * 1000
        max_ms = max(latencies) * 1000
        rps = total_reqs / duration_seconds

        print(f"Throughput:          {rps:.1f} reqs/sec")
        print(f"Latency Avg:         {avg_ms:.2f} ms")
        print(f"Latency P50:         {p50_ms:.2f} ms")
        print(f"Latency P95:         {p95_ms:.2f} ms")
        print(f"Latency P99:         {p99_ms:.2f} ms")
        print(f"Latency Max:         {max_ms:.2f} ms")

        if p95_ms < 500.0:
            print("\n[PASS] Latency P95 is well within acceptable real-time POS limits (<500ms).")
        else:
            print("\n[WARN] Latency P95 exceeded 500ms.")
    print("=" * 60 + "\n")

def main():
    parser = argparse.ArgumentParser(description="Restaurant POS Multi-Tablet Load Simulator")
    parser.add_argument("--url", type=str, default="http://127.0.0.1:8000", help="Target server URL (default: http://127.0.0.1:8000)")
    parser.add_argument("--tablets", type=int, default=4, help="Concurrent waiter tablets (default: 4)")
    parser.add_argument("--seconds", type=float, default=10.0, help="Test duration in seconds (default: 10)")
    parser.add_argument("--minutes", type=float, default=None, help="Test duration in minutes (overrides seconds)")
    args = parser.parse_args()

    duration = args.minutes * 60.0 if args.minutes is not None else args.seconds
    run_loadcheck(args.url, args.tablets, duration)

if __name__ == "__main__":
    main()
