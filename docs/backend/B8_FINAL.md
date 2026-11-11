# Task B8 - Final Verification & Commissioning Audit

**Audit Timestamp**: 2026-11-08T21:20:00+05:00  
**Target Environment**: Android Tablet (Termux aarch64) & Local Windows Development Host  
**Test Suite**: 105 passed in 79.22s (0 failures, 0 warnings, 0 hangs)  
**Code Quality**: Ruff (100% clean), Mypy (19 source files checked, 0 issues), ShellCheck (0 warnings across all scripts)

---

## 1. Verification Matrix

| Item | Status | Evidence | Still Needs the Tablet? |
| :--- | :---: | :--- | :---: |
| **A.1 Line Endings & .gitattributes** | **DONE** | Scanned all 14 shell files (`scripts/`, `backend/scripts/`); verified 0 CR bytes. Added `.gitattributes` enforcing `eol=lf` for `*.sh`, `scripts/pos`, `10-pos-start.sh`, and `*.py`. | No (verified on PC) |
| **A.2 Pytest CR Byte Guard** | **DONE** | Added `test_shell_scripts_no_cr_bytes()` in `backend/tests/test_b8_deployment.py`; passes in pytest. | No (verified on PC) |
| **A.3 Release Tarball Modes & Normalization** | **DONE** | `build_release.py` normalizes all shell files to LF, verifies 0 CR bytes, sets `0o755` for scripts/pos and `0o644` for regular files. Verified by `test_release_packaging_exclusions_and_modes()` and automated tar member scan (250 members, 0 forbidden, 0 mode mismatches, 0 CR bytes). | No (verified on PC) |
| **A.4 POSIX Wrapper & Shebangs** | **DONE** | `scripts/pos` and `backend/scripts/pos` converted from `#!/usr/bin/env bash` with `${BASH_SOURCE[0]}` to pure POSIX `#!/bin/sh` with `"$0"`. `10-pos-start.sh` uses `sh` and `#!/bin/sh`. | No (verified on PC) |
| **B.1 POSIX Shell Review (Bashisms Fixed)** | **DONE** | Removed `[[ ]]`, arrays, `set -o pipefail`, `local`, `echo -e`, and `source` across all shell scripts (`run_server.sh`, `install_termux.sh`, `install_proot.sh`, `termux_check.sh`). | No (verified on PC) |
| **B.2 ShellCheck & PyCompile** | **DONE** | Installed `shellcheck-py` (v0.11.0); ran across all 14 scripts in `scripts/` and `backend/scripts/` (0 warnings). Ran `py_compile` on all 46 Python scripts (100% compiled). | No (verified on PC) |
| **C.1 Self-Contained Diagnostics** | **DONE** | `sqlite_check.py` imports ONLY standard library (`argparse`, `platform`, `random`, `sqlite3`, `sys`, `tempfile`, `threading`, `time`, `pathlib`). Zero 3rd party dependencies. `termux_check.sh` uses only `sh` and core POSIX tools. | No (verified on PC) |
| **C.2 Diagnostic Reports & --quick Mode** | **DONE** | `sqlite_check.py --quick` executes in ~2s, outputs `pos_sqlite_check_report.txt` starting with `RESULT: PASS`, device info, python/sqlite versions, and plan recommendation. `termux_check.sh` generates `pos_termux_check_report.txt`. | **YES** (Physical tablet run needed to benchmark tablet eMMC/UFS flash) |
| **C.3 Non-Developer Tablet Test Guide** | **DONE** | Written in `docs/backend/TABLET_TEST.md` (plain-language F-Droid setup, `pkg install python openssl`, `termux-setup-storage`, tarball copy/extract, running tests, retrieving reports). | **YES** (Followed by on-site technician) |
| **D.1 Dev/Runtime Dependency Separation** | **DONE** | `pytest`, `pytest-asyncio`, `pytest-timeout`, `httpx`, `ruff`, `mypy`, `shellcheck-py` moved to `[project.optional-dependencies] dev` in `pyproject.toml` and `backend/requirements-dev.txt`. | No (verified on PC) |
| **D.2 UV Lock Generation (ARM64 & x86_64)** | **DONE** | Used `uv pip compile` to generate `backend/requirements.lock` (`--python-platform aarch64-unknown-linux-gnu --only-binary :all:`) and `backend/requirements.x86_64.lock` (`--python-platform x86_64-unknown-linux-gnu --only-binary :all:`). All 24 packages resolved to binary wheels (0 without wheels). Verified manylinux/PRoot path. | No (verified on PC) |
| **D.3 Backend Tests Compatibility** | **DONE** | All 105 tests pass with updated dependency specifications. | No (verified on PC) |
| **E. HTTP Helper Loopback Socket Test** | **DONE** | `test_http_helper_paths_and_redirects` verified on ephemeral loopback port using `http.client`: landing page, CA download, health probe, HTTPS redirects, Host-header anti-poisoning, path traversal blocking, private key protection. | No (verified on PC) |
| **F. Final Clean Suite & Hygiene** | **DONE** | Full test suite: 105 passed in 79.22s. Zero leftover Python processes. Release bundle `pos-release-v1.0.0-20261108.tar.gz` built (303.9 KB, SHA256: `a721d286e4f8a6c8b42838f5a564435d0162e412d716183bfc3260e4202c8323`). | **YES** (On-site staging on tablet) |

---

## 2. Release Artifact Summary

- **Archive File**: `dist/pos-release-v1.0.0-20261108.tar.gz`
- **Archive Size**: `303.9 KB`
- **SHA-256**: `a721d286e4f8a6c8b42838f5a564435d0162e412d716183bfc3260e4202c8323`
- **Tarball Member Audit**:
  - Total Files: `250`
  - Shell & Wrapper Scripts: Mode `0o755`, `0` CR bytes
  - Standard Files: Mode `0o644`
  - Forbidden Files (`.key`, `.db`, `users.yaml`, `.env`): `0`

