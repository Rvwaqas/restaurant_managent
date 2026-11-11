#!/usr/bin/env python3
"""
CLI tool to trigger a test print to a thermal printer (via DB printer ID or direct IP).
Usage:
  python backend/scripts/print_test.py --printer prn-kitchen
  python backend/scripts/print_test.py --printer 192.168.1.101 --port 9100
"""

import sys
import os
import argparse

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models import Printer
from app.services.printing.driver import execute_test_print


def main():
    parser = argparse.ArgumentParser(description="Send test print slip to thermal printer")
    parser.add_argument("--printer", required=True, help="Printer ID from database or direct IPv4 address")
    parser.add_argument("--port", type=int, default=9100, help="TCP port (default 9100)")
    parser.add_argument("--name", default="Test Printer", help="Printer display name for direct IP")

    args = parser.parse_args()

    db = SessionLocal()
    try:
        # Check if argument matches printer ID or name
        printer = db.query(Printer).filter(
            (Printer.id == args.printer) | (Printer.name == args.printer)
        ).first()

        if not printer:
            # Create a transient printer object for direct IP testing
            printer = Printer(
                id=f"prn-direct-{args.printer.replace('.', '-')}",
                name=args.name,
                ip=args.printer,
                port=args.port,
                is_active=True,
                role="kitchen",
            )
            print(f"Direct IP mode: targeting {printer.ip}:{printer.port}")
        else:
            print(f"Database printer found: {printer.name} ({printer.ip}:{printer.port})")

        result = execute_test_print(printer, db)
        print(f"Result: status={result['status']}")
        print(f"Message: {result['message']}")

        if result["status"] != "ok":
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

