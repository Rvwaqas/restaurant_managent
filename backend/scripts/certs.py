#!/usr/bin/env python3
"""Local Network TLS & Certificate Management Tool for Restaurant POS.

Generates and manages a private Certificate Authority (CA) and leaf server certificates
using the OpenSSL CLI via subprocess (pure Python + standard library).

Usage:
    python scripts/certs.py init [--ip 192.168.1.50 ...] [--name pos.local ...] [--force-new-ca]
    python scripts/certs.py renew
    python scripts/certs.py add-ip <ip_address>
    python scripts/certs.py show
    python scripts/certs.py verify
"""

import os
import sys
import argparse
import socket
import subprocess
import shutil
import datetime
from pathlib import Path
from typing import List, Optional, Tuple, Set

# Add backend directory to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings


def get_openssl_cmd() -> str:
    """Finds openssl executable in system PATH or standard installation directories."""
    cmd = shutil.which("openssl")
    if cmd:
        return cmd
    if sys.platform == "win32":
        candidates = [
            Path("C:/Program Files/Git/usr/bin/openssl.exe"),
            Path("C:/Program Files/OpenSSL-Win64/bin/openssl.exe"),
            Path("C:/Program Files/Git/mingw64/bin/openssl.exe"),
        ]
        for c in candidates:
            if c.exists():
                return str(c)
    raise RuntimeError("OpenSSL CLI tool ('openssl') was not found in PATH or standard directories.")


def get_certs_dir() -> Path:
    """Resolves target directory for certificate storage."""
    d = Path("certs")
    if not d.is_absolute():
        if (PROJECT_ROOT / "backend").exists():
            d = PROJECT_ROOT / "certs"
        else:
            d = Path.cwd() / "certs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def detect_local_ips() -> List[str]:
    """Auto-detects active LAN IPv4 addresses using UDP socket probe and host info."""
    ips: Set[str] = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != "127.0.0.1":
            ips.add(primary)
    except Exception:
        pass

    try:
        host = socket.gethostname()
        for info in socket.getaddrinfo(host, None, socket.AF_INET):
            addr = str(info[4][0])
            if not addr.startswith("127.") and not addr.startswith("169.254."):
                ips.add(addr)
    except Exception:
        pass

    return sorted(list(ips)) or ["127.0.0.1"]


def build_san_extension_config(ips: List[str], names: List[str]) -> str:
    """Constructs an OpenSSL config snippet for Subject Alternative Names (SAN)."""
    san_entries = ["IP:127.0.0.1", "DNS:localhost"]

    for ip in ips:
        clean_ip = ip.strip()
        if clean_ip and f"IP:{clean_ip}" not in san_entries:
            san_entries.append(f"IP:{clean_ip}")

    for name in names:
        clean_name = name.strip()
        if clean_name and f"DNS:{clean_name}" not in san_entries:
            san_entries.append(f"DNS:{clean_name}")

    san_str = ",".join(san_entries)

    return f"""[ req ]
distinguished_name = req_distinguished_name
prompt = no

[ req_distinguished_name ]
CN = {settings.APP_NAME} POS Server

[ server_ext ]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = {san_str}
"""


def create_ca(certs_dir: Path, openssl: str, force: bool = False, label: Optional[str] = None) -> Tuple[Path, Path]:
    """Generates the private Root CA key and certificate (ECDSA P-256, 10-year validity)."""
    ca_key = certs_dir / "ca.key"
    ca_crt = certs_dir / "ca.crt"

    if ca_key.exists() and ca_crt.exists() and not force:
        raise RuntimeError(
            f"CA files already exist at {certs_dir}.\n"
            f"Overwriting the CA requires every tablet to reinstall the CA certificate!\n"
            f"Use --force-new-ca if you truly intend to replace the Root CA."
        )

    # 1. Generate EC private key (prime256v1 / P-256)
    subprocess.run(
        [openssl, "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(ca_key)],
        check=True,
        capture_output=True,
    )
    # Set restricted permissions on ca.key
    try:
        os.chmod(str(ca_key), 0o600)
    except Exception:
        pass

    # 2. OpenSSL CA config
    cn = f"{settings.APP_NAME} Local CA"
    if label:
        cn = f"{cn} [{label}]"

    ca_cnf_content = f"""[ req ]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[ req_distinguished_name ]
CN = {cn}

[ v3_ca ]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true, pathlen:0
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
"""
    ca_cnf = certs_dir / "ca.cnf"
    ca_cnf.write_text(ca_cnf_content, encoding="utf-8")

    # 3. Create self-signed CA certificate (10 years = 3650 days)
    subprocess.run(
        [
            openssl, "req", "-new", "-x509",
            "-key", str(ca_key),
            "-days", "3650",
            "-out", str(ca_crt),
            "-config", str(ca_cnf),
        ],
        check=True,
        capture_output=True,
    )

    if ca_cnf.exists():
        ca_cnf.unlink()

    return ca_key, ca_crt


def create_leaf_certificate(
    certs_dir: Path,
    openssl: str,
    ips: List[str],
    names: List[str],
    validity_days: int = 800,
) -> Tuple[Path, Path]:
    """Issues a leaf server certificate signed by the Root CA with SAN entries."""
    ca_key = certs_dir / "ca.key"
    ca_crt = certs_dir / "ca.crt"
    server_key = certs_dir / "server.key"
    server_crt = certs_dir / "server.crt"
    server_csr = certs_dir / "server.csr"

    if not ca_key.exists() or not ca_crt.exists():
        raise RuntimeError("Root CA does not exist. Run 'init' first to create the CA.")

    # 1. Generate server EC key
    subprocess.run(
        [openssl, "ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", str(server_key)],
        check=True,
        capture_output=True,
    )
    try:
        os.chmod(str(server_key), 0o600)
    except Exception:
        pass

    # 2. Write SAN config
    ext_config = build_san_extension_config(ips, names)
    ext_path = certs_dir / "server_ext.cnf"
    ext_path.write_text(ext_config, encoding="utf-8")

    # 3. Create Certificate Signing Request (CSR)
    subprocess.run(
        [
            openssl, "req", "-new",
            "-key", str(server_key),
            "-out", str(server_csr),
            "-config", str(ext_path),
        ],
        check=True,
        capture_output=True,
    )

    # 4. Sign leaf certificate with Root CA
    subprocess.run(
        [
            openssl, "x509", "-req",
            "-in", str(server_csr),
            "-CA", str(ca_crt),
            "-CAkey", str(ca_key),
            "-CAcreateserial",
            "-out", str(server_crt),
            "-days", str(validity_days),
            "-extfile", str(ext_path),
            "-extensions", "server_ext",
        ],
        check=True,
        capture_output=True,
    )

    # Cleanup temp files
    for tmp in (server_csr, ext_path):
        if tmp.exists():
            tmp.unlink()

    return server_key, server_crt


def parse_san_from_cert(cert_path: Path, openssl: str) -> List[str]:
    """Extracts SAN entries (IPs and DNS names) from a certificate."""
    res = subprocess.run(
        [openssl, "x509", "-noout", "-ext", "subjectAltName", "-in", str(cert_path)],
        capture_output=True,
        text=True,
    )
    sans = []
    if res.returncode == 0:
        for line in res.stdout.splitlines():
            line = line.strip()
            if "IP Address:" in line or "DNS:" in line:
                parts = [p.strip() for p in line.split(",")]
                for part in parts:
                    if part.startswith("IP Address:"):
                        sans.append(part.replace("IP Address:", "").strip())
                    elif part.startswith("DNS:"):
                        sans.append(part.replace("DNS:", "").strip())
    return sans


def cmd_init(args):
    """Initializes private Root CA and issues initial leaf certificate."""
    openssl = get_openssl_cmd()
    certs_dir = get_certs_dir()

    ips = list(args.ip or [])
    names = list(args.name or [])

    if not ips:
        detected = detect_local_ips()
        print(f"Auto-detected LAN IP addresses: {', '.join(detected)}")
        ips.extend(detected)

    print(f"\nInitializing Local CA & Server TLS Certificates in '{certs_dir}' ...")

    # Create CA
    ca_key, ca_crt = create_ca(certs_dir, openssl, force=args.force_new_ca, label=getattr(args, "label", None))
    print(f"  [OK] Created Root CA Key:         {ca_key.name} (mode 600)")
    print(f"  [OK] Created Root CA Certificate: {ca_crt.name} (10-year validity)")

    # Create Leaf
    server_key, server_crt = create_leaf_certificate(certs_dir, openssl, ips, names)
    print(f"  [OK] Created Server Key:          {server_key.name}")
    print(f"  [OK] Created Server Certificate:  {server_crt.name} (800-day validity)")
    print(f"  [OK] Configured SAN entries:      {', '.join(ips + names + ['127.0.0.1', 'localhost'])}")

    print("\nNext steps:")
    print("1. Set SERVER_MODE=https in your config or .env file.")
    print("2. Download the Root CA on waiter tablets via http://<SERVER_IP>:8080/pos-ca.crt")
    print("3. Install the certificate under Android Settings > Security > Install a certificate > CA certificate.\n")


def cmd_renew(args):
    """Re-issues the leaf certificate using the existing Root CA."""
    openssl = get_openssl_cmd()
    certs_dir = get_certs_dir()
    server_crt = certs_dir / "server.crt"

    if not server_crt.exists():
        raise RuntimeError("No server certificate found. Run 'init' first.")

    sans = parse_san_from_cert(server_crt, openssl)
    ips = [s for s in sans if re_is_ip(s) and s != "127.0.0.1"]
    names = [s for s in sans if not re_is_ip(s) and s != "localhost"]

    print(f"Renewing leaf certificate with existing SANs ({', '.join(ips + names)}) ...")
    server_key, server_crt = create_leaf_certificate(certs_dir, openssl, ips, names)
    print(f"  [OK] Leaf certificate successfully renewed! (Valid for 800 days)")
    print("  Note: Waiter tablets DO NOT need to reinstall the CA certificate.\n")


def cmd_add_ip(args):
    """Re-issues leaf certificate with an added IP address without changing Root CA."""
    openssl = get_openssl_cmd()
    certs_dir = get_certs_dir()
    server_crt = certs_dir / "server.crt"
    new_ip = args.ip.strip()

    if not server_crt.exists():
        raise RuntimeError("No server certificate found. Run 'init' first.")

    sans = parse_san_from_cert(server_crt, openssl)
    ips = [s for s in sans if re_is_ip(s) and s != "127.0.0.1"]
    names = [s for s in sans if not re_is_ip(s) and s != "localhost"]

    if new_ip not in ips:
        ips.append(new_ip)

    print(f"Re-issuing server certificate with added IP {new_ip} ...")
    server_key, server_crt = create_leaf_certificate(certs_dir, openssl, ips, names)
    print(f"  [OK] Re-issued server certificate. Current SAN IPs: {', '.join(ips)}")
    print("  Note: Waiter tablets DO NOT need to reinstall the CA certificate.\n")


def cmd_show(args):
    """Prints certificate details, validity, fingerprints, and days left."""
    openssl = get_openssl_cmd()
    certs_dir = get_certs_dir()
    server_crt = certs_dir / "server.crt"
    ca_crt = certs_dir / "ca.crt"

    if not server_crt.exists():
        print("No server certificate found. Run 'python scripts/certs.py init' to create one.")
        return

    print("\n" + "=" * 65)
    print("                POS SERVER TLS CERTIFICATE DETAILS               ")
    print("=" * 65)

    def print_cert_info(label: str, path: Path):
        print(f"\n--- {label} ({path.name}) ---")
        res_sub = subprocess.run([openssl, "x509", "-noout", "-subject", "-in", str(path)], capture_output=True, text=True)
        res_dates = subprocess.run([openssl, "x509", "-noout", "-dates", "-in", str(path)], capture_output=True, text=True)
        res_fp = subprocess.run([openssl, "x509", "-noout", "-fingerprint", "-sha256", "-in", str(path)], capture_output=True, text=True)

        print(res_sub.stdout.strip())
        for d in res_dates.stdout.splitlines():
            print(f"  {d.strip()}")
        print(f"  {res_fp.stdout.strip()}")

    if ca_crt.exists():
        print_cert_info("ROOT CA", ca_crt)

    print_cert_info("LEAF SERVER CERTIFICATE", server_crt)

    sans = parse_san_from_cert(server_crt, openssl)
    print(f"  Subject Alternative Names: {', '.join(sans)}")

    # Expiry calculation
    res_end = subprocess.run([openssl, "x509", "-noout", "-enddate", "-in", str(server_crt)], capture_output=True, text=True)
    if res_end.returncode == 0:
        end_str = res_end.stdout.replace("notAfter=", "").strip()
        try:
            # Format: 'Nov  8 10:20:00 2028 GMT'
            exp_date = datetime.datetime.strptime(end_str, "%b %d %H:%M:%S %Y %Z")
            now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
            days_left = (exp_date - now).days
            print(f"  Days Remaining:            {days_left} day(s)")
        except Exception:
            pass

    print("-" * 65 + "\n")


def cmd_verify(args):
    """Verifies leaf certificate against CA and verifies current LAN IP is in SAN."""
    openssl = get_openssl_cmd()
    certs_dir = get_certs_dir()
    server_crt = certs_dir / "server.crt"
    ca_crt = certs_dir / "ca.crt"

    if not server_crt.exists() or not ca_crt.exists():
        print("ERROR: Certificate files missing in certs directory.", file=sys.stderr)
        sys.exit(1)

    # 1. Chain validation
    res = subprocess.run([openssl, "verify", "-CAfile", str(ca_crt), str(server_crt)], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: Certificate verification failed:\n{res.stderr or res.stdout}", file=sys.stderr)
        sys.exit(1)

    print(f"[OK] Certificate chain verified: {server_crt.name} is trusted by {ca_crt.name}.")

    # 2. Check current LAN IP in SAN
    sans = parse_san_from_cert(server_crt, openssl)
    detected_ips = detect_local_ips()

    missing_ips = [ip for ip in detected_ips if ip not in sans and ip != "127.0.0.1"]
    if missing_ips:
        print(f"[WARN] Current device LAN IP(s) {missing_ips} are NOT in the certificate SAN list!")
        for mip in missing_ips:
            print(f"       Run: python scripts/certs.py add-ip {mip}")
        sys.exit(2)
    else:
        print(f"[OK] All active device LAN IPs are included in certificate SAN.")
        sys.exit(0)


def re_is_ip(val: str) -> bool:
    """Checks if string looks like an IPv4 address."""
    parts = val.split(".")
    if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
        return True
    return False


def main():
    parser = argparse.ArgumentParser(description="Restaurant POS Local TLS / Certificate Tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # init
    p_init = subparsers.add_parser("init", help="Generate Root CA and server leaf certificate")
    p_init.add_argument("--ip", action="append", help="LAN IP address to include in SAN (can be repeated)")
    p_init.add_argument("--name", action="append", help="DNS hostname to include in SAN (can be repeated)")
    p_init.add_argument("--force-new-ca", action="store_true", help="Force new Root CA even if one exists")
    p_init.add_argument("--label", type=str, default="", help="Optional label to include in CA subject (e.g. DEV)")

    # renew
    subparsers.add_parser("renew", help="Renew leaf certificate using existing CA")

    # add-ip
    p_add = subparsers.add_parser("add-ip", help="Add a new IP address to the leaf certificate SAN")
    p_add.add_argument("ip", help="IP address to add")

    # show
    subparsers.add_parser("show", help="Display certificate information and expiry")

    # verify
    subparsers.add_parser("verify", help="Validate certificate chain and check current LAN IP")

    args = parser.parse_args()

    if args.command == "init":
        cmd_init(args)
    elif args.command == "renew":
        cmd_renew(args)
    elif args.command == "add-ip":
        cmd_add_ip(args)
    elif args.command == "show":
        cmd_show(args)
    elif args.command == "verify":
        cmd_verify(args)


if __name__ == "__main__":
    main()
