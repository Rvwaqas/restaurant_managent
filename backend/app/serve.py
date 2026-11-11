#!/usr/bin/env python3
"""Unified Server Launcher & Production Runner for Restaurant POS.

Supports both PLAIN (HTTP on HTTP_PORT) and HTTPS (TLS on HTTPS_PORT + HTTP Helper on HELPER_HTTP_PORT).
Enforces single-instance server locking (data/server.lock), validates TLS certificates,
and provides --check-config validation mode.

Usage:
    python -m app.serve [--check-config]
"""

import argparse
import logging
import os
import socket
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse

import uvicorn

# Ensure backend root is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.lock import acquire_server_lock, release_server_lock
from app.core.logging_config import setup_logging
from app.core.timeutil import get_local_now

logger = logging.getLogger("pos.serve")


def get_openssl_executable() -> Optional[str]:
    """Finds openssl executable in system PATH or common fallback locations."""
    import shutil
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
    return None


def validate_tls_certificates(cert_path: str, key_path: str) -> Tuple[bool, Optional[str]]:
    """Validates that TLS cert and key exist, are readable, match each other, and cert is not expired."""
    p_cert = Path(cert_path)
    p_key = Path(key_path)

    if not p_cert.exists():
        return False, f"TLS certificate file not found: {cert_path}"
    if not p_key.exists():
        return False, f"TLS private key file not found: {key_path}"

    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(p_cert), keyfile=str(p_key))
    except ssl.SSLError as e:
        return False, f"TLS certificate and private key mismatch or invalid format: {e}"
    except Exception as e:
        return False, f"Error reading TLS certificate or key: {e}"

    # Check expiration date using OpenSSL CLI if available or SSLContext
    openssl_bin = get_openssl_executable()
    if openssl_bin:
        import subprocess
        try:
            # -checkend <seconds>: returns 0 if valid for <seconds>, 1 if expired or expiring
            ret = subprocess.run([openssl_bin, "x509", "-checkend", "0", "-noout", "-in", str(p_cert)], capture_output=True, text=True)
            if ret.returncode != 0:
                return False, f"TLS certificate at {cert_path} is EXPIRED"
        except Exception as e:
            logger.warning("Could not execute openssl to check cert expiration: %s", e)

    return True, None


def is_port_available(host: str, port: int) -> bool:
    """Checks if a network port is available for binding."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((host, port))
            return True
    except OSError:
        return False


def get_detected_lan_ips() -> List[str]:
    """Detects local LAN IPv4 addresses."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        if primary and primary != "127.0.0.1":
            ips.append(primary)
    except Exception:
        pass

    try:
        host_name = socket.gethostname()
        for info in socket.getaddrinfo(host_name, None, socket.AF_INET):
            ip = str(info[4][0])
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass

    return ips or ["127.0.0.1"]


class HTTPHelperHandler(BaseHTTPRequestHandler):
    """
    Tiny plain-HTTP helper running on HELPER_HTTP_PORT in HTTPS mode:
    - GET /pos-ca.crt: Downloads CA certificate with application/x-x509-ca-cert.
    - GET /: Plain language landing page with links to HTTPS app & CA install instructions.
    - GET /health: Returns plain 'ok'.
    - All other paths: 301 redirect to https://<host>:<HTTPS_PORT><path>.
    - Absolutely prohibits serving private keys, arbitrary files, or directory traversal.
    """

    ca_cert_path: str = ""
    https_port: int = 8443
    allowed_hosts: List[str] = []

    def log_message(self, format: str, *args):
        # Route helper requests to standard logger
        logger.debug("HTTP-Helper: " + format % args)

    def do_HEAD(self):
        self.handle_request(is_head=True)

    def do_GET(self):
        self.handle_request(is_head=False)

    def do_POST(self):
        self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        self.send_error(405, "Method Not Allowed")

    def handle_request(self, is_head: bool = False):
        parsed = urlparse(self.path)
        path = parsed.path

        # Traversal guard
        if ".." in path or "/." in path:
            self.send_error(400, "Bad Request: Path traversal prohibited")
            return

        # Private key & sensitive file guard
        if path.endswith(".key") or "/certs" in path or "server.key" in path or "ca.key" in path:
            self.send_error(403, "Forbidden: Sensitive files cannot be served")
            return

        # 1. Download CA certificate
        if path == "/pos-ca.crt":
            if not os.path.exists(self.ca_cert_path):
                self.send_error(404, "CA certificate file not configured or not found")
                return
            try:
                content = Path(self.ca_cert_path).read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/x-x509-ca-cert")
                self.send_header("Content-Disposition", 'inline; filename="pos-ca.crt"')
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                if not is_head:
                    self.wfile.write(content)
                return
            except Exception as e:
                logger.error("Error reading CA cert: %s", e)
                self.send_error(500, "Internal Server Error")
                return

        # 2. Health check endpoint
        if path == "/health":
            body = b"ok\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 3. Help & onboarding HTML landing page
        if path == "/" or path == "/index.html":
            host_header = self.headers.get("Host", "localhost")
            host_only = host_header.split(":")[0]
            https_url = f"https://{host_only}:{self.https_port}/"

            server_time = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
            html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{settings.APP_NAME} - Setup &amp; Access</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
    .card {{ max-width: 600px; margin: 40px auto; background: #1e293b; border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }}
    h1 {{ color: #38bdf8; margin-top: 0; font-size: 24px; }}
    .btn {{ display: inline-block; background: #0284c7; color: white; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; margin: 12px 0; }}
    .btn:hover {{ background: #0369a1; }}
    .btn-secondary {{ background: #334155; color: #38bdf8; }}
    .btn-secondary:hover {{ background: #475569; }}
    ol {{ padding-left: 20px; line-height: 1.6; color: #cbd5e1; }}
    .meta {{ font-size: 13px; color: #94a3b8; margin-top: 24px; border-top: 1px solid #334155; padding-top: 12px; }}
    code {{ background: #0f172a; padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #f1f5f9; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>{settings.APP_NAME} POS Server</h1>
    <p>This POS server is running securely with local network encryption (HTTPS).</p>

    <p>
      <a class="btn" href="{https_url}">Open {settings.APP_NAME} App (HTTPS) &rarr;</a>
    </p>

    <h3>First Time Setup for Waiter Tablets:</h3>
    <ol>
      <li>Download the Local Security Certificate:<br>
          <a class="btn btn-secondary" href="/pos-ca.crt">Download CA Certificate (pos-ca.crt)</a>
      </li>
      <li>On your Android tablet, go to:
          <br><code>Settings &gt; Security &gt; Encryption &amp; credentials &gt; Install a certificate &gt; CA certificate</code>
      </li>
      <li>Select the downloaded <code>pos-ca.crt</code> file and confirm install.</li>
      <li>Tap the button above to open the POS app without security warnings.</li>
      <li>In Chrome menu (three dots), tap <b>Add to Home screen</b> to install as PWA.</li>
    </ol>

    <div class="meta">
      Server Time: {server_time} | Status: Online (TLS Active on port {self.https_port})
    </div>
  </div>
</body>
</html>
"""
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        # 4. Redirect all other traffic to HTTPS
        host_header = self.headers.get("Host", "localhost")
        host_only = host_header.split(":")[0]

        # Prevent open redirect: host must be an IP or hostname matching local network or localhost
        if self.allowed_hosts and host_only not in self.allowed_hosts:
            host_only = self.allowed_hosts[0]

        target_url = f"https://{host_only}:{self.https_port}{self.path}"
        self.send_response(301)
        self.send_header("Location", target_url)
        self.send_header("Content-Length", "0")
        self.end_headers()


def start_http_helper(host: str, helper_port: int, https_port: int, ca_cert_path: str, allowed_hosts: List[str]) -> HTTPServer:
    """Starts the plain-HTTP helper on helper_port in a background daemon thread."""
    handler = HTTPHelperHandler
    handler.ca_cert_path = str(Path(ca_cert_path).resolve())
    handler.https_port = https_port
    handler.allowed_hosts = allowed_hosts

    server = HTTPServer((host, helper_port), handler)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="http-helper")
    t.start()
    logger.info("HTTP Helper started on http://%s:%d (redirecting to HTTPS :%d)", host, helper_port, https_port)
    return server


def check_configuration() -> bool:
    """
    Validates server settings, file paths, port bindings, and certificate validity.
    Outputs a human-readable readiness report and returns True if clean, False otherwise.
    """
    print("\n" + "=" * 65)
    print("      RESTAURANT POS - SERVER LAUNCHER CONFIGURATION CHECK      ")
    print("=" * 65)

    mode = settings.SERVER_MODE.lower()
    host = settings.BIND_HOST
    http_port = settings.HTTP_PORT
    https_port = settings.HTTPS_PORT
    helper_port = settings.HELPER_HTTP_PORT

    errors = []
    warnings = []

    print(f"Mode:          {mode.upper()}")
    print(f"Bind Host:     {host}")

    if mode == "plain":
        print(f"HTTP Port:     {http_port}")
        if not is_port_available(host, http_port):
            errors.append(f"HTTP Port {http_port} is already in use on {host}")
        else:
            print(f"Port Status:   {http_port} is FREE")
    elif mode == "https":
        print(f"HTTPS Port:    {https_port}")
        print(f"Helper Port:   {helper_port}")
        print(f"TLS Cert File: {settings.TLS_CERT_FILE}")
        print(f"TLS Key File:  {settings.TLS_KEY_FILE}")
        print(f"CA Cert File:  {settings.TLS_CA_CERT_FILE}")

        # Check port availability
        if not is_port_available(host, https_port):
            errors.append(f"HTTPS Port {https_port} is already in use on {host}")
        else:
            print(f"Port Status:   HTTPS port {https_port} is FREE")

        if not is_port_available(host, helper_port):
            errors.append(f"HTTP Helper Port {helper_port} is already in use on {host}")
        else:
            print(f"Port Status:   HTTP Helper port {helper_port} is FREE")

        # Validate certificates
        cert_path = Path(settings.TLS_CERT_FILE)
        key_path = Path(settings.TLS_KEY_FILE)
        ca_path = Path(settings.TLS_CA_CERT_FILE)

        if not cert_path.exists():
            errors.append(f"Certificate file not found: {settings.TLS_CERT_FILE} (run: python scripts/certs.py init)")
        if not key_path.exists():
            errors.append(f"Private key file not found: {settings.TLS_KEY_FILE} (run: python scripts/certs.py init)")
        if not ca_path.exists():
            warnings.append(f"CA certificate file not found: {settings.TLS_CA_CERT_FILE} (tablets will not be able to download CA)")

        if cert_path.exists() and key_path.exists():
            ok, err_msg = validate_tls_certificates(str(cert_path), str(key_path))
            if not ok:
                errors.append(err_msg or "Invalid TLS certificate/key pair")
            else:
                print("TLS Status:    Cert and key match; certificate is valid")

    # Check database file
    from app.services.backup import get_sqlite_path
    rel_db = get_sqlite_path(settings.DATABASE_URL)
    candidates = [Path(rel_db), BACKEND_DIR / rel_db, BACKEND_DIR.parent / rel_db]
    db_found = any(c.exists() for c in candidates)
    if db_found:
        print(f"Database:      Found at {rel_db}")
    else:
        warnings.append(f"Database file not yet created at {rel_db} (will initialize on first run)")

    # Check frontend dist
    if settings.FRONTEND_DIST_DIR:
        fe_dir = Path(settings.FRONTEND_DIST_DIR)
        if fe_dir.exists() and (fe_dir / "index.html").exists():
            print(f"Frontend Dist: Found valid static build at {fe_dir}")
        else:
            warnings.append(f"FRONTEND_DIST_DIR set to '{settings.FRONTEND_DIST_DIR}' but index.html was not found")

    print("-" * 65)
    if errors:
        print("\nCONFIGURATION CHECK FAILED:")
        for e in errors:
            print(f"  [ERROR] {e}")
        if warnings:
            for w in warnings:
                print(f"  [WARN]  {w}")
        print("\nFix the errors above before launching.")
        return False

    if warnings:
        print("\nCONFIGURATION READY WITH WARNINGS:")
        for w in warnings:
            print(f"  [WARN]  {w}")
    else:
        print("\nCONFIGURATION VALID: READY TO SERVE")

    return True


def run_server():
    """Main launcher entry point for uvicorn with lock acquisition and TLS / Helper handling."""
    parser = argparse.ArgumentParser(description="Restaurant POS Production Server")
    parser.add_argument("--check-config", action="store_true", help="Validate configuration and exit")
    args = parser.parse_args()

    if args.check_config:
        clean = check_configuration()
        sys.exit(0 if clean else 1)

    # 1. Initialize logging
    setup_logging()

    # 2. Acquire B7 server lock to prevent split-brain execution
    lock_path = "data/server.lock"
    if not acquire_server_lock(lock_path):
        logger.critical("REFUSED: Another POS server instance is already running (locked by %s). Aborting.", lock_path)
        print(f"ERROR: Server instance is already running (locked by {lock_path}).", file=sys.stderr)
        sys.exit(1)

    mode = settings.SERVER_MODE.lower()
    host = settings.BIND_HOST
    lan_ips = get_detected_lan_ips()
    allowed_hosts = list(set(["localhost", "127.0.0.1"] + lan_ips))

    try:
        if mode == "https":
            # Validate TLS certificate and private key
            cert_path = str(Path(settings.TLS_CERT_FILE).resolve())
            key_path = str(Path(settings.TLS_KEY_FILE).resolve())

            ok, err_msg = validate_tls_certificates(cert_path, key_path)
            if not ok:
                logger.critical("Fatal TLS configuration error: %s", err_msg)
                print(f"\nFATAL: {err_msg}", file=sys.stderr)
                print("Run 'python scripts/certs.py init' to generate certificates or switch to SERVER_MODE=plain.\n", file=sys.stderr)
                sys.exit(1)

            # Start background HTTP helper
            ca_path = str(Path(settings.TLS_CA_CERT_FILE).resolve())
            start_http_helper(
                host=host,
                helper_port=settings.HELPER_HTTP_PORT,
                https_port=settings.HTTPS_PORT,
                ca_cert_path=ca_path,
                allowed_hosts=allowed_hosts,
            )

            # Banner
            logger.info("Starting HTTPS POS Server on https://%s:%d (mode=https, uvicorn single worker)", host, settings.HTTPS_PORT)
            for ip in lan_ips:
                logger.info("  App URL:    https://%s:%d", ip, settings.HTTPS_PORT)
                logger.info("  Helper URL: http://%s:%d", ip, settings.HELPER_HTTP_PORT)

            # Configure and launch uvicorn with TLS
            uvicorn_config = uvicorn.Config(
                "app.main:app",
                host=host,
                port=settings.HTTPS_PORT,
                workers=1,
                reload=False,
                proxy_headers=False,
                ws_ping_interval=None,
                ws_ping_timeout=None,
                timeout_keep_alive=settings.KEEPALIVE_TIMEOUT,
                timeout_graceful_shutdown=10,
                ssl_certfile=cert_path,
                ssl_keyfile=key_path,
                log_config=None,  # Use custom B7 logging configuration
            )
        else:
            # Plain HTTP mode
            logger.info("Starting HTTP POS Server on http://%s:%d (mode=plain, uvicorn single worker)", host, settings.HTTP_PORT)
            for ip in lan_ips:
                logger.info("  App URL: http://%s:%d", ip, settings.HTTP_PORT)

            uvicorn_config = uvicorn.Config(
                "app.main:app",
                host=host,
                port=settings.HTTP_PORT,
                workers=1,
                reload=False,
                proxy_headers=False,
                ws_ping_interval=None,
                ws_ping_timeout=None,
                timeout_keep_alive=settings.KEEPALIVE_TIMEOUT,
                timeout_graceful_shutdown=10,
                log_config=None,  # Use custom B7 logging configuration
            )

        server = uvicorn.Server(uvicorn_config)
        server.run()

    finally:
        release_server_lock()
        logger.info("Server lock released.")


if __name__ == "__main__":
    run_server()
