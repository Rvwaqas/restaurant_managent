#!/usr/bin/env python3
"""
CLI tool to query hardware and health status of a thermal printer.
Usage:
  python backend/scripts/printer_status.py --printer prn-kitchen
  python backend/scripts/printer_status.py --printer 192.168.1.101 --port 9100
"""

import sys
import os
import argparse

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models import Printer
from app.services.printing.network_driver import check_printer_hardware_status
from app.services.printing.health import get_printer_health


def main():
    parser = argparse.ArgumentParser(description="Check thermal printer hardware and health status")
    parser.add_argument("--printer", required=True, help="Printer ID from database or direct IPv4 address")
    parser.add_argument("--port", type=int, default=9100, help="TCP port (default 9100)")

    args = parser.parse_args()

    ip = args.printer
    port = args.port
    printer_id = args.printer
    printer_name = "Thermal Printer"

    db = SessionLocal()
    try:
        printer = db.query(Printer).filter(
            (Printer.id == args.printer) | (Printer.name == args.printer)
        ).first()
        if printer:
            ip = printer.ip
            port = printer.port or 9100
            printer_id = printer.id
            printer_name = f"{printer.name} ({printer.id})"
    finally:
        db.close()

    print("=" * 50)
    print(f"PRINTER STATUS: {printer_name}")
    print(f"Address: {ip}:{port}")
    print("=" * 50)

    # In-memory health status
    health = get_printer_health(printer_id)
    print("Application Health:")
    print(f"  State: {health.state.upper()}")
    print(f"  Consecutive Failures: {health.consecutive_failures}")
    print(f"  Last Success: {health.last_success_time or 'Never'}")
    print(f"  Last Failure: {health.last_failure_time or 'None'}")
    if health.last_failure_message:
        print(f"  Last Error: {health.last_failure_message}")

    print("\nHardware Query (ESC/POS DLE EOT):")
    hw = check_printer_hardware_status(ip, port)
    print(f"  Connection: {'REACHABLE' if hw['online'] or hw['raw_status1'] else 'UNREACHABLE / TIMEOUT'}")
    print(f"  Details: {hw['details']}")
    if hw["raw_status1"]:
        print(f"  Raw DLE EOT 1: {hw['raw_status1']}")
        print(f"  Online State: {'ONLINE' if hw['online'] else 'OFFLINE'}")
        print(f"  Cover Open: {'YES (COVER OPEN)' if hw['cover_open'] else 'NO (CLOSED)'}")
    if hw["raw_status4"]:
        print(f"  Raw DLE EOT 4: {hw['raw_status4']}")
        print(f"  Paper Out: {'YES (PAPER OUT)' if hw['paper_out'] else 'NO (PAPER OK)'}")

    print("=" * 50)


if __name__ == "__main__":
    main()
