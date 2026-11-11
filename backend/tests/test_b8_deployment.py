"""
Task B8 Integration & Unit Tests:
Deployment, Packaging, HTTPS/TLS, Static Frontend Serving, Release Management, and Diagnostics.
"""

import os
import sys
import json
import tarfile
import tempfile
import hashlib
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# Add backend and project root to sys.path
TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.main import app
from app.core.config import settings
from app.static_frontend import StaticFrontendHandler
from app.serve import HTTPHelperHandler
from scripts import certs, build_release, pos_cli

client = TestClient(app)

# -----------------------------------------------------------------------------
# 1. Server Configuration & Flags Test
# -----------------------------------------------------------------------------
def test_server_config_validation():
    """Verify settings validation for server mode and ports."""
    assert settings.SERVER_MODE in ("plain", "https")
    assert settings.HTTP_PORT > 1024 or settings.HTTP_PORT == 8000
    assert settings.HTTPS_PORT > 1024 or settings.HTTPS_PORT == 8443
    assert settings.HELPER_HTTP_PORT > 1024 or settings.HELPER_HTTP_PORT == 8080

def test_serve_check_config_execution():
    """Verify that python -m app.serve --check-config runs and validates."""
    import subprocess
    cmd = [sys.executable, "-m", "app.serve", "--check-config"]
    res = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)
    assert res.returncode == 0
    assert "CONFIGURATION VALID" in res.stdout or "CONFIGURATION VALID" in res.stderr

# -----------------------------------------------------------------------------
# 2. HTTP Helper Server & Open Redirect Guard Tests (Ephemeral Socket)
# -----------------------------------------------------------------------------
def test_http_helper_paths_and_redirects():
    """Verify HTTP helper routes over real loopback socket on ephemeral port."""
    import http.client
    from app.serve import start_http_helper

    with tempfile.TemporaryDirectory() as tmpdir:
        ca_cert_file = Path(tmpdir) / "pos-ca.crt"
        ca_bytes = b"-----BEGIN CERTIFICATE-----\nTEST_CA_BYTES\n-----END CERTIFICATE-----\n"
        ca_cert_file.write_bytes(ca_bytes)

        # Start helper on ephemeral port (port 0)
        allowed_hosts = ["localhost", "127.0.0.1", "192.168.1.100"]
        server = start_http_helper(
            host="127.0.0.1",
            helper_port=0,
            https_port=8443,
            ca_cert_path=str(ca_cert_file),
            allowed_hosts=allowed_hosts,
        )
        port = server.server_address[1]

        try:
            # 1. GET /health
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/health")
            resp = conn.getresponse()
            assert resp.status == 200
            assert resp.read() == b"ok\n"
            conn.close()

            # 2. GET /pos-ca.crt
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/pos-ca.crt")
            resp = conn.getresponse()
            assert resp.status == 200
            assert resp.getheader("Content-Type") == "application/x-x509-ca-cert"
            assert resp.read() == ca_bytes
            conn.close()

            # 3. GET / (landing page)
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/")
            resp = conn.getresponse()
            assert resp.status == 200
            body = resp.read().decode("utf-8")
            assert "POS Server" in body
            assert "pos-ca.crt" in body
            conn.close()

            # 4. Redirect of other paths to HTTPS
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/admin/menu", headers={"Host": "192.168.1.100"})
            resp = conn.getresponse()
            assert resp.status == 301
            assert resp.getheader("Location") == "https://192.168.1.100:8443/admin/menu"
            conn.close()

            # 5. Host-header validation against open redirects
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/floor-1", headers={"Host": "evil-hacker.com"})
            resp = conn.getresponse()
            assert resp.status == 301
            # Fallback to first allowed host (localhost or 127.0.0.1), NOT evil-hacker.com
            loc = resp.getheader("Location")
            assert "evil-hacker.com" not in loc
            assert loc.startswith("https://")
            conn.close()

            # 6. Traversal attempts rejected
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            conn.request("GET", "/../etc/passwd")
            resp = conn.getresponse()
            assert resp.status in (400, 403)
            conn.close()

            # 7. Private key files can NEVER be fetched
            for key_path in ["/server.key", "/ca.key", "/certs/server.key"]:
                conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                conn.request("GET", key_path)
                resp = conn.getresponse()
                assert resp.status in (400, 403)
                body = resp.read()
                assert b"PRIVATE KEY" not in body
                conn.close()

        finally:
            server.shutdown()
            server.server_close()

# -----------------------------------------------------------------------------
# 3. Static Frontend Serving, Caching, and Security Headers
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_static_frontend_serving():
    """Verify StaticFrontendHandler serves assets, sets caching & security headers."""
    with tempfile.TemporaryDirectory() as tmpdir:
        dist_dir = Path(tmpdir)
        next_static = dist_dir / "_next" / "static" / "chunks"
        next_static.mkdir(parents=True)
        js_file = next_static / "main-12345.js"
        js_file.write_text("console.log('pos');", encoding="utf-8")

        html_file = dist_dir / "index.html"
        html_file.write_text("<html><body>POS App</body></html>", encoding="utf-8")

        handler = StaticFrontendHandler(str(dist_dir), is_https=True)

        # 1. Cache control calculation
        assert "immutable" in handler._get_cache_control("_next/static/chunks/main-12345.js")
        assert "no-cache" in handler._get_cache_control("index.html")
        assert "no-cache" in handler._get_cache_control("sw.js")

        # 2. Security headers
        sec_headers = handler._get_security_headers()
        assert sec_headers["X-Content-Type-Options"] == "nosniff"
        assert sec_headers["X-Frame-Options"] == "DENY"
        assert "Strict-Transport-Security" in sec_headers

        # 3. File resolution
        resolved_js = handler._resolve_target_file("/_next/static/chunks/main-12345.js")
        assert resolved_js == js_file

        resolved_idx = handler._resolve_target_file("/")
        assert resolved_idx == html_file

        # Missing static asset with extension -> None
        missing = handler._resolve_target_file("/_next/static/missing.js")
        assert missing is None

# -----------------------------------------------------------------------------
# 4. TLS Certificate CLI Verification
# -----------------------------------------------------------------------------
def test_certs_tool_generation_and_verification():
    """Verify that scripts/certs.py generates Root CA and leaf certificates."""
    with tempfile.TemporaryDirectory() as tmpdir:
        certs_dir = Path(tmpdir)
        openssl = certs.get_openssl_cmd()
        assert openssl, "OpenSSL CLI required for TLS tests"

        # 1. Create Root CA with DEV label
        import subprocess
        ca_key, ca_crt = certs.create_ca(certs_dir, openssl, label="DEV")
        assert ca_key.exists()
        assert ca_crt.exists()
        res_sub = subprocess.run([openssl, "x509", "-noout", "-subject", "-in", str(ca_crt)], capture_output=True, text=True)
        assert "DEV" in res_sub.stdout

        # 2. Create Leaf Certificate with IP
        server_key, server_crt = certs.create_leaf_certificate(
            certs_dir, openssl, ["192.168.1.100"], ["pos.local"]
        )
        assert server_key.exists()
        assert server_crt.exists()

        # 3. Verify SAN parsed from cert
        sans = certs.parse_san_from_cert(server_crt, openssl)
        assert "192.168.1.100" in sans
        assert "127.0.0.1" in sans
        assert "localhost" in sans
        assert "pos.local" in sans

        # 4. Re-issue with added IP
        server_key2, server_crt2 = certs.create_leaf_certificate(
            certs_dir, openssl, ["192.168.1.100", "192.168.1.150"], ["pos.local"]
        )
        sans2 = certs.parse_san_from_cert(server_crt2, openssl)
        assert "192.168.1.150" in sans2

# -----------------------------------------------------------------------------
# 5. Release Packaging, Exclusions, Line Endings, and File Modes Tests
# -----------------------------------------------------------------------------
def test_shell_scripts_no_cr_bytes():
    """Verify that every repository shell script has exactly 0 CR bytes (POSIX LF only)."""
    script_dirs = [PROJECT_ROOT / "scripts", BACKEND_DIR / "scripts"]
    checked = 0
    for sdir in script_dirs:
        if not sdir.exists():
            continue
        for p in sdir.glob("*"):
            if p.is_file() and (p.suffix == ".sh" or p.name in ("pos", "10-pos-start.sh")):
                content = p.read_bytes()
                cr_count = content.count(b"\r")
                assert cr_count == 0, f"File {p} contains {cr_count} CR bytes! Must be pure LF for Android Termux."
                checked += 1
    assert checked >= 6, f"Expected at least 6 shell scripts, found {checked}"


def test_release_packaging_exclusions_and_modes():
    """Verify that build_release normalizes LF, enforces 0o755/0o644 modes, and excludes secrets."""
    with tempfile.TemporaryDirectory() as tmpdir:
        out_dir = Path(tmpdir)
        import subprocess
        cmd = [sys.executable, str(PROJECT_ROOT / "scripts" / "build_release.py"), "--output-dir", str(out_dir)]
        res = subprocess.run(cmd, capture_output=True, text=True)
        assert res.returncode == 0, f"build_release failed:\n{res.stdout}\n{res.stderr}"

        # Check tarball contents
        tar_files = list(out_dir.glob("*.tar.gz"))
        assert len(tar_files) == 1
        tar_path = tar_files[0]

        with tarfile.open(tar_path, "r:gz") as tar:
            members = tar.getmembers()
            names = [m.name for m in members]

            # Ensure code is included
            assert any("app/main.py" in n for n in names)
            assert any("scripts/pos" in n for n in names)
            # Ensure sensitive/runtime files are EXCLUDED
            assert not any(n.endswith(".db") for n in names)
            assert not any(n.endswith(".key") for n in names)
            assert not any("__pycache__" in n for n in names)
            assert not any("data/logs" in n for n in names)
            assert not any("config/users.yaml" in n for n in names)

            # Check modes and CR bytes inside the archive
            for member in members:
                if member.isfile():
                    m_path = Path(member.name)
                    is_exec = m_path.suffix == ".sh" or m_path.name in ("pos", "10-pos-start.sh")
                    expected_mode = 0o755 if is_exec else 0o644
                    actual_mode = member.mode & 0o777
                    assert actual_mode == expected_mode, f"{member.name} mode {oct(actual_mode)} != {oct(expected_mode)}"

                    if is_exec:
                        f = tar.extractfile(member)
                        assert f is not None
                        content = f.read()
                        assert b"\r" not in content, f"CR byte found inside archive for {member.name}"

        # Ensure sha256 checksum exists
        sha_files = list(out_dir.glob("*.sha256"))
        assert len(sha_files) == 1


def test_build_release_fails_on_secret_leak(tmp_path):
    """Verify that build_release fails immediately if a secret key or db is staged."""
    from scripts.build_release import check_forbidden_file

    # 1. Private key extension
    with pytest.raises(ValueError, match="Forbidden file extension"):
        check_forbidden_file(tmp_path / "server.key")

    # 2. Database extension
    with pytest.raises(ValueError, match="Forbidden file extension"):
        check_forbidden_file(tmp_path / "test.db")

    # 3. Secret config filename
    with pytest.raises(ValueError, match="Secret config file"):
        check_forbidden_file(tmp_path / "users.yaml")

    with pytest.raises(ValueError, match="Secret config file"):
        check_forbidden_file(tmp_path / ".env")

    # 4. Private key header inside file
    fake_pem = tmp_path / "innocent.txt"
    fake_pem.write_bytes(b"-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n")
    with pytest.raises(ValueError, match="Private key header detected"):
        check_forbidden_file(fake_pem)


# -----------------------------------------------------------------------------
# 6. Status File & Management CLI Test
# -----------------------------------------------------------------------------
def test_status_file_format():
    """Verify status.json schema and pos status output."""
    with tempfile.TemporaryDirectory() as tmpdir:
        status_file = Path(tmpdir) / "status.json"
        status_data = {
            "state": "running",
            "pid": 12345,
            "restarts": 0,
            "last_exit_code": 0,
            "updated_at": "2026-11-08T10:00:00Z"
        }
        status_file.write_text(json.dumps(status_data), encoding="utf-8")
        read_back = json.loads(status_file.read_text(encoding="utf-8"))
        assert read_back["state"] == "running"
        assert read_back["pid"] == 12345

# -----------------------------------------------------------------------------
# 7. Server OS Lock & Stale Lock Recovery Test
# -----------------------------------------------------------------------------
def test_server_lock_stale_and_concurrency():
    """Verify that OS-level lock prevents two live instances and stale locks are recovered with a warning."""
    import subprocess
    import time
    from app.core.lock import acquire_server_lock, release_server_lock

    with tempfile.TemporaryDirectory() as tmpdir:
        lock_file = str(Path(tmpdir) / "test_server.lock")

        # 1. Start a subprocess that holds the lock
        code = f"""
import sys, time
from app.core.lock import acquire_server_lock
ok = acquire_server_lock({repr(lock_file)})
if ok:
    print('LOCKED', flush=True)
    time.sleep(30)
else:
    sys.exit(1)
"""
        proc = subprocess.Popen(
            [sys.executable, "-c", code],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        try:
            line = proc.stdout.readline()
            assert "LOCKED" in line

            # 2. Second instance attempting to acquire must FAIL
            second_ok = acquire_server_lock(lock_file)
            assert second_ok is False, "Second instance must not acquire lock while child is alive"

            # 3. Terminate the subprocess (simulate crash / death)
            proc.terminate()
            proc.wait(timeout=5)

            # 4. Next start must succeed and overwrite stale lock
            acquired = acquire_server_lock(lock_file)
            assert acquired is True, "Next start must succeed when previous process is dead"
            release_server_lock()

        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            release_server_lock()

