#!/usr/bin/env python3
"""
Restaurant POS - Network URLs and Tablet Onboarding Helper
Displays local and LAN URLs for waiter tablets and admin access, with optional QR code.
"""

import argparse
import socket
import sys
from pathlib import Path

# Add project root and backend to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
POS_ROOT = SCRIPT_DIR.parent
if str(POS_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(POS_ROOT / "backend"))
if str(POS_ROOT) not in sys.path:
    sys.path.insert(0, str(POS_ROOT))

from app.core.config import settings


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def print_qr(url: str):
    try:
        import segno
        qr = segno.make(url)
        print("\n--- Terminal QR Code ---")
        qr.terminal(compact=True)
        print("------------------------\n")
    except ImportError:
        print("\n[NOTE] Install 'segno' to render QR codes directly in terminal:")
        print("       pip install segno\n")

def main():
    parser = argparse.ArgumentParser(description="Show Restaurant POS Network URLs")
    parser.add_argument("--qr", action="store_true", help="Display ASCII QR code for waiter tablet URL")
    args = parser.parse_args()

    lan_ip = get_lan_ip()
    mode = settings.SERVER_MODE

    print("\n" + "=" * 60)
    print("      Restaurant POS - Tablet & Network Access URLs      ")
    print("=" * 60)

    if mode == "https":
        primary_url = f"https://{lan_ip}:{settings.HTTPS_PORT}/"
        setup_url = f"http://{lan_ip}:{settings.HELPER_HTTP_PORT}/"
        ca_cert_url = f"http://{lan_ip}:{settings.HELPER_HTTP_PORT}/pos-ca.crt"

        print("Server Mode:         HTTPS (Secure LAN)")
        print(f"Device IP:           {lan_ip}")
        print("")
        print("1. Tablet Onboarding & CA Setup:")
        print(f"   --> {setup_url}")
        print("   (Open this on new tablets to download and trust the CA certificate)")
        print("")
        print("2. Direct CA Certificate Download:")
        print(f"   --> {ca_cert_url}")
        print("")
        print("3. POS Application (Waiter & Admin):")
        print(f"   --> {primary_url}")
        print(f"   --> Localhost: https://127.0.0.1:{settings.HTTPS_PORT}/")
    else:
        primary_url = f"http://{lan_ip}:{settings.HTTP_PORT}/"
        print("Server Mode:         PLAIN (HTTP)")
        print(f"Device IP:           {lan_ip}")
        print("")
        print("POS Application URL:")
        print(f"   --> {primary_url}")
        print(f"   --> Localhost: http://127.0.0.1:{settings.HTTP_PORT}/")

    print("=" * 60)

    if args.qr:
        print_qr(primary_url)

if __name__ == "__main__":
    main()

