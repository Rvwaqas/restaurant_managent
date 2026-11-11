#!/usr/bin/env python3
"""
Restaurant POS - Release Packaging Tool
Creates signed/checksummed release tarball containing backend code, migrations,
scripts, and config templates (strictly omitting runtime databases, logs, and private keys).
Fails immediately if any sensitive files or private keys are staged.
"""

import argparse
import datetime
import hashlib
import json
import os
import sys
import tarfile
from pathlib import Path

# Add project root and backend to sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
POS_ROOT = SCRIPT_DIR.parent
if str(POS_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(POS_ROOT / "backend"))
if str(POS_ROOT) not in sys.path:
    sys.path.insert(0, str(POS_ROOT))

from app.core.config import settings

FORBIDDEN_EXTENSIONS = {".key", ".db", ".sqlite", ".sqlite3"}
FORBIDDEN_FILENAMES = {"users.yaml", ".env"}
FORBIDDEN_HEADERS = [
    b"-----BEGIN PRIVATE KEY-----",
    b"-----BEGIN RSA PRIVATE KEY-----",
    b"-----BEGIN EC PRIVATE KEY-----",
    b"-----BEGIN OPENSSH PRIVATE KEY-----",
    b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
]


def check_forbidden_file(file_p: Path) -> None:
    """Raises ValueError if a file violates security release rules."""
    name = file_p.name.lower()
    # 1. Extensions
    if file_p.suffix.lower() in FORBIDDEN_EXTENSIONS:
        raise ValueError(f"SECURITY VIOLATION: Forbidden file extension '{file_p.suffix}' detected in release candidate: {file_p}")

    # 2. Filenames
    if name in FORBIDDEN_FILENAMES or (name.startswith(".env.") and not name.endswith(".example")):
        raise ValueError(f"SECURITY VIOLATION: Secret config file '{file_p.name}' detected in release candidate: {file_p}")

    # 3. Backups
    if "backup" in str(file_p).lower() and file_p.suffix.lower() in (".gz", ".tar", ".zip", ".db"):
        raise ValueError(f"SECURITY VIOLATION: Backup archive detected in release candidate: {file_p}")

    # 4. Private key headers in non-python text files
    if file_p.is_file() and not file_p.name.endswith(".py") and file_p.stat().st_size < 10 * 1024 * 1024:
        try:
            with open(file_p, "rb") as f:
                head = f.read(1024)
                for header in FORBIDDEN_HEADERS:
                    if header in head:
                        raise ValueError(f"SECURITY VIOLATION: Private key header detected in {file_p.name} ({file_p})")
        except (UnicodeDecodeError, PermissionError):
            pass


import io


def is_shell_executable(p: Path) -> bool:
    """Returns True if the file is a shell script or executable CLI wrapper."""
    return p.suffix == ".sh" or p.name in ("pos", "10-pos-start.sh")


def scan_bundle_tarball(bundle_path: Path) -> None:
    """Inspect every member of the created tarball to guarantee zero secret leaks,

    correct file modes (0o755 for scripts, 0o644 for regular files), and zero CR bytes.
    """
    with tarfile.open(bundle_path, "r:gz") as tar:
        for member in tar.getmembers():
            m_path = Path(member.name)
            m_name = m_path.name.lower()

            if m_path.suffix.lower() in FORBIDDEN_EXTENSIONS:
                raise ValueError(f"SECURITY AUDIT FAILED: Release tarball contains forbidden file: {member.name}")
            if m_name in FORBIDDEN_FILENAMES or (m_name.startswith(".env.") and not m_name.endswith(".example")):
                raise ValueError(f"SECURITY AUDIT FAILED: Release tarball contains secret config: {member.name}")

            # Mode audit
            if member.isfile():
                is_exec = is_shell_executable(m_path)
                expected_mode = 0o755 if is_exec else 0o644
                actual_mode = member.mode & 0o777
                if actual_mode != expected_mode:
                    raise ValueError(f"MODE AUDIT FAILED: {member.name} has mode {oct(actual_mode)}, expected {oct(expected_mode)}")

                # Line endings & private key content scan
                f = tar.extractfile(member)
                if f:
                    content = f.read()
                    if is_exec and b"\r" in content:
                        raise ValueError(f"LINE ENDING AUDIT FAILED: CR byte found in shell member: {member.name}")
                    if not member.name.endswith(".py") and member.size < 5 * 1024 * 1024:
                        for header in FORBIDDEN_HEADERS:
                            if header in content[:1024]:
                                raise ValueError(f"SECURITY AUDIT FAILED: Private key header detected inside archive: {member.name}")


def calculate_sha256(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def should_exclude(rel_p: Path) -> bool:
    rel_str = str(rel_p).replace("\\", "/")
    exclusions = [
        "__pycache__",
        ".pyc",
        ".git",
        ".pytest_cache",
        ".ruff_cache",
        ".db",
        ".sqlite",
        ".sqlite3",
        "data/logs",
        "data/backups",
        "data/uploads",
        "data/audit",
        "config/users.yaml",
        "certs/",
        "venv",
        "node_modules",
        "tmp",
    ]
    return any(exc in rel_str for exc in exclusions)


def build_release(version: str, output_dir: str = "dist") -> Path:
    date_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    out_dir = POS_ROOT / output_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    bundle_name = f"pos-release-v{version}-{date_str}.tar.gz"
    bundle_path = out_dir / bundle_name

    print(f"Building release bundle: {bundle_name}")

    manifest_files: list[str] = []
    manifest = {
        "name": "restaurant-pos",
        "version": version,
        "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "files": manifest_files,
    }
    manifest_file = out_dir / "MANIFEST.json"

    try:
        with tarfile.open(bundle_path, "w:gz") as tar:
            for d_name in ["backend", "scripts", "docs"]:
                source_dir = POS_ROOT / d_name
                if not source_dir.exists():
                    continue
                for root, _, files in os.walk(source_dir):
                    for f in files:
                        file_p = Path(root) / f
                        rel_p = file_p.relative_to(POS_ROOT)

                        if should_exclude(rel_p):
                            continue

                        # Strict Security Check - must FAIL if forbidden file is in staged set
                        check_forbidden_file(file_p)

                        arc_name = str(rel_p).replace("\\", "/")
                        is_exec = is_shell_executable(file_p)

                        # Text and shell files: normalize CRLF -> LF
                        raw_data = file_p.read_bytes()
                        if is_exec or file_p.suffix in (".py", ".txt", ".md", ".json", ".yaml", ".yml", ".ini", ".lock"):
                            normalized_data = raw_data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
                            if is_exec and b"\r" in normalized_data:
                                raise ValueError(f"CR byte still present in shell script after normalization: {file_p}")
                            data_to_write = normalized_data
                        else:
                            data_to_write = raw_data

                        ti = tarfile.TarInfo(name=arc_name)
                        ti.size = len(data_to_write)
                        ti.mtime = int(file_p.stat().st_mtime)
                        ti.mode = 0o755 if is_exec else 0o644
                        ti.type = tarfile.REGTYPE
                        tar.addfile(ti, io.BytesIO(data_to_write))

                        manifest_files.append(arc_name)

        # Scan final archive
        scan_bundle_tarball(bundle_path)

        manifest["sha256"] = calculate_sha256(bundle_path)
        manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        checksum_file = out_dir / f"{bundle_name}.sha256"
        checksum_file.write_text(f"{manifest['sha256']}  {bundle_name}\n", encoding="utf-8")

        print(f"[PASS] Release created at: {bundle_path}")
        print(f"       SHA256: {manifest['sha256']}")
        print(f"       Size:   {bundle_path.stat().st_size / 1024:.1f} KB")
        return bundle_path

    except Exception as e:
        if bundle_path.exists():
            bundle_path.unlink()
        print(f"[FAIL] Release build aborted: {e}", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description="Build Restaurant POS Release Bundle")
    parser.add_argument("--version", type=str, default=getattr(settings, "APP_VERSION", "1.0.0"), help="Release version")
    parser.add_argument("--output-dir", type=str, default="dist", help="Output directory")
    args = parser.parse_args()

    try:
        build_release(args.version, args.output_dir)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()
