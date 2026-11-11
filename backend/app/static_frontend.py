"""Static Frontend Serving with Next.js SPA Routing, Caching & Security Headers.

Implements:
- Direct serving of static files and directory indexes.
- Correct Cache-Control per file class (immutable for _next/static, no-cache for HTML/sw/manifest).
- Service-Worker-Allowed: / header for sw.js.
- ETag, Last-Modified, and 304 Not Modified conditional response handling.
- SPA dynamic route rewrites via frontend-routes.json.
- Real 404 for missing static assets with extensions (never index.html).
- Custom 404.html page for unknown route URLs.
- Path traversal & dotfile protection.
- Security headers (nosniff, same-origin, DENY, permissions-policy, HSTS in https).
- Precompressed .gz sibling file serving.
"""

import json
import mimetypes
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Request
from fastapi.responses import FileResponse, PlainTextResponse, Response

# Ensure common types are known
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/css", ".css")


class StaticFrontendHandler:
    def __init__(self, dist_dir: str, is_https: bool = False):
        self.dist_dir = Path(dist_dir).resolve()
        self.is_https = is_https
        self.routes_config: List[Dict[str, Any]] = []
        self._load_routes_config()

    def _load_routes_config(self):
        """Loads optional frontend-routes.json for SPA dynamic route mapping."""
        routes_file = self.dist_dir / "frontend-routes.json"
        if routes_file.exists():
            try:
                data = json.loads(routes_file.read_text(encoding="utf-8"))
                self.routes_config = data.get("routes", [])
            except Exception:
                self.routes_config = []

    def _get_security_headers(self) -> Dict[str, str]:
        headers = {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "same-origin",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        }
        if self.is_https:
            headers["Strict-Transport-Security"] = "max-age=86400"
        return headers

    def _get_cache_control(self, rel_path: str) -> str:
        """Computes appropriate Cache-Control based on file type and fingerprinted location."""
        # Immutable for hashed Next.js static bundles
        if rel_path.startswith("_next/static/") or re.search(r"\.[a-f0-9]{8,}\.(js|css)$", rel_path):
            return "public, max-age=31536000, immutable"

        # Revalidate for HTML, service worker, webmanifest, and icons
        if (
            rel_path.endswith(".html")
            or rel_path == "sw.js"
            or rel_path.endswith(".webmanifest")
            or rel_path.endswith(".json")
            or rel_path.startswith("icons/")
            or rel_path.endswith(".ico")
        ):
            return "no-cache"

        # Default for other assets: 1 day
        return "public, max-age=86400"

    def _resolve_target_file(self, path_str: str) -> Optional[Path]:
        """
        Resolves an incoming URL path to a concrete filesystem file:
        1. Exact file match.
        2. Directory index.html match.
        3. Extensionless match with .html.
        4. SPA dynamic route rewrite rules.
        """
        clean = path_str.strip("/")
        candidate = (self.dist_dir / clean).resolve()

        # Path traversal guard
        if not candidate.is_relative_to(self.dist_dir):
            return None

        # Exact file
        if candidate.is_file():
            return candidate

        # Directory index
        if candidate.is_dir():
            idx = candidate / "index.html"
            if idx.is_file():
                return idx

        # Extensionless HTML (e.g. /login -> /login.html)
        html_cand = candidate.with_suffix(".html")
        if html_cand.is_file():
            return html_cand

        # Dynamic Route Matching (frontend-routes.json)
        norm_url = "/" + clean
        for rule in self.routes_config:
            pattern = rule.get("pattern", "")
            target = rule.get("target", "").lstrip("/")
            if pattern and re.match(pattern, norm_url):
                target_path = (self.dist_dir / target).resolve()
                if target_path.is_file() and target_path.is_relative_to(self.dist_dir):
                    return target_path

        # Heuristic Next.js export fallback for dynamic routes:
        # e.g. /floor-1/table/f1-t3 -> check _floor_table_tableId.html or [floor]/table/[tableId].html
        if "/table/" in norm_url:
            for probe_name in (
                "_floor_table_tableId.html",
                "[floor]/table/[tableId].html",
                "table/[tableId].html",
            ):
                probe = (self.dist_dir / probe_name).resolve()
                if probe.is_file():
                    return probe

        return None

    async def handle(self, request: Request, full_path: str) -> Response:
        """Handles incoming request to static frontend."""
        if request.method not in ("GET", "HEAD"):
            return PlainTextResponse("Method Not Allowed", status_code=405)

        clean_path = full_path.strip("/")

        # Dotfile protection
        segments = clean_path.split("/")
        if any(seg.startswith(".") for seg in segments if seg):
            return PlainTextResponse("Not Found", status_code=404)

        has_file_ext = bool(re.search(r"\.[a-zA-Z0-9]{1,8}$", segments[-1]))

        target_file = self._resolve_target_file(clean_path)

        if not target_file:
            # If path has a file extension, return real 404 (do NOT return index.html!)
            if has_file_ext:
                return PlainTextResponse("Not Found", status_code=404)

            # Route not found: serve custom 404.html with status 404 if present
            custom_404 = self.dist_dir / "404.html"
            if custom_404.is_file():
                headers = self._get_security_headers()
                headers["Cache-Control"] = "no-cache"
                return FileResponse(
                    str(custom_404),
                    status_code=404,
                    headers=headers,
                    media_type="text/html",
                )
            return PlainTextResponse("Page Not Found", status_code=404)

        # File exists: prepare response
        st = target_file.stat()
        mtime_ns = st.st_mtime_ns
        size = st.st_size
        etag = f'"{mtime_ns:x}-{size:x}"'
        last_modified = format_date_header(st.st_mtime)

        # Conditional request check (304 Not Modified)
        inm = request.headers.get("if-none-match")
        ims = request.headers.get("if-modified-since")

        if inm and inm.strip() == etag:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": self._get_cache_control(clean_path)})

        # Headers
        headers = self._get_security_headers()
        rel_posix = target_file.relative_to(self.dist_dir).as_posix()
        headers["Cache-Control"] = self._get_cache_control(rel_posix)
        headers["ETag"] = etag
        headers["Last-Modified"] = last_modified

        # Specific Service Worker Header
        if target_file.name == "sw.js" or rel_posix == "sw.js":
            headers["Service-Worker-Allowed"] = "/"
            headers["Content-Type"] = "application/javascript; charset=utf-8"

        # Check for precompressed .gz sibling
        accept_encoding = request.headers.get("accept-encoding", "")
        gz_sibling = target_file.with_name(target_file.name + ".gz")
        if "gzip" in accept_encoding and gz_sibling.is_file():
            headers["Content-Encoding"] = "gzip"
            mime, _ = mimetypes.guess_type(target_file.name)
            media_type = mime or "application/octet-stream"
            if "Content-Type" not in headers:
                headers["Content-Type"] = media_type

            if request.method == "HEAD":
                return Response(status_code=200, headers=headers)

            return FileResponse(
                str(gz_sibling),
                status_code=200,
                headers=headers,
                media_type=media_type,
            )

        mime, _ = mimetypes.guess_type(target_file.name)
        media_type = mime or "application/octet-stream"
        if target_file.name.endswith(".html"):
            media_type = "text/html; charset=utf-8"

        if request.method == "HEAD":
            if "Content-Type" not in headers:
                headers["Content-Type"] = media_type
            headers["Content-Length"] = str(size)
            return Response(status_code=200, headers=headers)

        return FileResponse(
            str(target_file),
            status_code=200,
            headers=headers,
            media_type=media_type,
        )


def format_date_header(epoch_time: float) -> str:
    """Formats a timestamp as an HTTP-date string."""
    import email.utils
    return email.utils.formatdate(epoch_time, usegmt=True)

