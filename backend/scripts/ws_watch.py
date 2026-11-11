#!/usr/bin/env python3
"""
Real-time WebSocket event watcher CLI tool for Soufi Restaurant POS.
Connects to /ws, logs in to obtain a JWT token, subscribes to requested floors,
and pretty-prints incoming events in real time.
"""
import argparse
import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime

try:
    import websockets
except ImportError:
    print("Error: 'websockets' library is required. Install it using 'pip install websockets'.", file=sys.stderr)
    sys.exit(1)


def login_for_token(http_base: str, username: str, password: str) -> str:
    """Authenticates with the backend HTTP API to retrieve a JWT bearer token."""
    login_url = f"{http_base.rstrip('/')}/api/auth/login"
    req_body = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        login_url,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data.get("token") or (data.get("user") and data["user"].get("token"))
            if not token:
                raise ValueError("Login response did not contain a token")
            return token
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"HTTP login failed ({e.code}): {err_body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Failed to connect to {login_url}: {e}", file=sys.stderr)
        sys.exit(1)


async def watch_realtime(ws_url: str, token: str, floors: list[str]):
    """Connects to the WebSocket gateway and streams real-time events."""
    target_url = f"{ws_url}{'&' if '?' in ws_url else '?'}token={token}"
    print(f"Connecting to {ws_url} (token redacted)...")

    async with websockets.connect(target_url) as ws:
        # Await connection.ack
        first_msg = await ws.recv()
        ack = json.loads(first_msg)
        print(f"\n[CONNECTED] BootID: {ack.get('payload', {}).get('serverBootId')} | "
              f"User: {ack.get('payload', {}).get('userId')} ({ack.get('payload', {}).get('role')}) | "
              f"Heartbeat: {ack.get('payload', {}).get('heartbeatSeconds')}s")

        # Subscribe to requested floors
        for floor in floors:
            sub_msg = {"type": "subscribe", "floorId": floor}
            print(f"--> Subscribing to floor '{floor}'...")
            await ws.send(json.dumps(sub_msg))

        print("\nStreaming real-time events (Ctrl+C to quit)...")
        print("-" * 75)

        try:
            while True:
                raw = await ws.recv()
                event = json.loads(raw)
                seq = event.get("seq", "-")
                event_type = event.get("type", "unknown")
                ts = event.get("ts", "")
                payload = event.get("payload", {})

                # Format human readable output
                formatted_time = ts[11:19] if len(ts) >= 19 else ts
                print(f"[{formatted_time}] #{seq:<4} [{event_type.upper()}]")
                if event_type == "subscribed":
                    tables_count = len(payload.get("tables", []))
                    print(f"    Floor {payload.get('floorId')}: {tables_count} tables loaded")
                elif event_type == "table.updated":
                    table_info = payload.get("table")
                    if table_info:
                        print(f"    Table #{table_info.get('number')} ({table_info.get('id')}) -> status: {table_info.get('status')}, order: {table_info.get('currentOrderId')}")
                    else:
                        print(f"    Table {payload.get('tableId')} -> deleted / inactive")
                elif event_type == "order.updated":
                    order_info = payload.get("order")
                    if order_info:
                        print(f"    Order #{order_info.get('orderNumber')} (Table: {order_info.get('tableNumber')}) -> status: {order_info.get('status')}, total: RM {order_info.get('total')}")
                    else:
                        print(f"    Order {payload.get('orderId')} updated")
                elif event_type == "bill.paid":
                    print(f"    Bill #{payload.get('billNo')} PAID -> total: RM {payload.get('total')}, method: {payload.get('method')}")
                elif event_type == "printer.status":
                    print(f"    Printer {payload.get('printerId')} -> state: {payload.get('state')}, msg: {payload.get('message')}")
                elif event_type == "heartbeat":
                    print("    <ping/heartbeat>")
                elif event_type == "error":
                    print(f"    ERROR: [{payload.get('code')}] {payload.get('message')}")
                else:
                    print(f"    {json.dumps(payload, indent=2)}")

        except websockets.exceptions.ConnectionClosed as e:
            print(f"\n[DISCONNECTED] Code {e.code}: {e.reason}")


def main():
    parser = argparse.ArgumentParser(description="Soufi POS WebSocket Realtime CLI Watcher")
    parser.add_argument("--url", default="ws://127.0.0.1:8000/ws", help="WebSocket URL (default: ws://127.0.0.1:8000/ws)")
    parser.add_argument("--http-url", default="http://127.0.0.1:8000", help="Backend HTTP URL (default: http://127.0.0.1:8000)")
    parser.add_argument("--username", default="admin", help="Username for authentication (default: admin)")
    parser.add_argument("--password", default="admin123", help="Password for authentication (default: admin123)")
    parser.add_argument("--floor", action="append", dest="floors", help="Floor ID to subscribe (can specify multiple, default: f1)")

    args = parser.parse_args()
    floors = args.floors or ["f1"]

    token = login_for_token(args.http_url, args.username, args.password)
    try:
        asyncio.run(watch_realtime(args.url, token, floors))
    except KeyboardInterrupt:
        print("\nWatcher stopped by user.")


if __name__ == "__main__":
    main()

