import asyncio
import datetime
import logging
import os
import shutil
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict

import jwt
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# Verify pure-python websockets dependency is available
try:
    import websockets  # noqa: F401
except ImportError:
    raise RuntimeError(
        "CRITICAL: pure-python 'websockets' package is not installed. "
        "Please ensure websockets is installed in the python environment."
    )

from app.api.endpoints import (
    auth,
    categories,
    floors,
    menu,
    menu_items,
    orders,
    printers,
    reports,
    tables,
    uploads,
)
from app.schemas import User
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.lock import acquire_server_lock, release_server_lock
from app.core.logging_config import log_startup_banner, setup_logging
from app.core.security import ALGORITHM
from app.core.startup_checks import (
    check_clock_guard,
    clock_state,
    last_integrity_check,
    record_request_activity,
    run_daily_maintenance,
    run_shutdown_maintenance,
    run_startup_checks,
    startup_warnings,
)
from app.core.timeutil import compute_business_date, get_local_now
from app.models import Printer
from app.realtime.hub import hub
from app.realtime.router import router as ws_router
from app.services import audit
from app.services.backup import (
    create_backup,
    get_backup_status,
    get_sqlite_path,
    list_backups,
    run_backup_scheduler,
    run_pre_migration_backup_if_needed,
)
from app.services.printing.dispatcher import cleanup_old_print_jobs, run_print_queue_recovery
from app.services.printing.health import get_printer_health
from app.services.table_consistency import run_table_consistency_check

logger = logging.getLogger("pos.app")

# Ensure required directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.LOG_DIR, exist_ok=True)
os.makedirs(settings.BACKUP_DIR, exist_ok=True)

# Initialize rotating file and console logging
setup_logging()

# Track server process start time for uptime reporting
server_start_epoch = time.time()


async def run_periodic_clock_guard_task(db_path: str):
    """Periodically verifies wall-clock integrity every 10 minutes."""
    while True:
        try:
            await asyncio.sleep(600.0)
            check_clock_guard(db_path)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning("Clock guard task error: %s", e)


async def run_periodic_maintenance_task(db_path: str):
    """Triggers daily maintenance task at BACKUP_TIME + 30m."""
    while True:
        try:
            parts = settings.BACKUP_TIME.split(":")
            hour = int(parts[0])
            minute = int(parts[1]) if len(parts) > 1 else 0

            local_now = get_local_now()
            target = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0) + datetime.timedelta(minutes=30)
            if target <= local_now:
                next_run = target + datetime.timedelta(days=1)
            else:
                next_run = target

            delay = max(5.0, (next_run - local_now).total_seconds())
            await asyncio.sleep(delay)
            await asyncio.to_thread(run_daily_maintenance, db_path)
            await asyncio.sleep(60.0)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Maintenance task error: %s", e)
            await asyncio.sleep(60.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global server_start_epoch
    server_start_epoch = time.time()

    # 1. Acquire exclusive OS-level server lock
    if not acquire_server_lock("data/server.lock"):
        logger.critical("Another server instance is already running")
        raise RuntimeError("Another server instance is already running")

    db_path = get_sqlite_path(settings.DATABASE_URL)

    # 2. Execute startup checks and validations
    run_startup_checks(db_path)

    # 3. Automatic migrations with pre-migration backup
    if settings.AUTO_MIGRATE:
        run_pre_migration_backup_if_needed()
        try:
            from alembic import command
            from alembic.config import Config
            cfg_path = "backend/alembic.ini" if os.path.exists("backend/alembic.ini") else "alembic.ini"
            alembic_cfg = Config(cfg_path)
            command.upgrade(alembic_cfg, "head")
        except Exception as e:
            logger.debug("Auto-migrate check: %s", e)

    # 4. Diagnostic startup banner
    log_startup_banner(hub.server_boot_id, db_path)

    # 5. Start Realtime Hub
    loop = asyncio.get_running_loop()
    hub.start(loop)

    # 6. Start background workers
    scheduler_task = loop.create_task(run_backup_scheduler())
    clock_task = loop.create_task(run_periodic_clock_guard_task(db_path))
    maintenance_task = loop.create_task(run_periodic_maintenance_task(db_path))

    # 7. Consistency self-check & print queue maintenance
    db = SessionLocal()
    try:
        run_table_consistency_check(db)
        run_print_queue_recovery(db)
        cleanup_old_print_jobs(db)
    except Exception as e:
        logger.error("Startup maintenance tasks failed: %s", e)
    finally:
        db.close()

    # 8. Audit trail server.started
    audit.record(
        event="server.started",
        role="system",
        details={
            "version": settings.APP_VERSION,
            "bootId": hub.server_boot_id,
            "clockState": clock_state,
            "warnings": startup_warnings,
        },
    )

    yield

    # Graceful Shutdown
    logger.info("Graceful server shutdown initiated...")
    audit.record(
        event="server.stopped",
        role="system",
        details={"bootId": hub.server_boot_id},
    )

    # Cancel background tasks
    for task in (scheduler_task, clock_task, maintenance_task):
        if task and not task.done():
            task.cancel()

    # Disconnect real-time WebSocket clients with code 1001
    await hub.stop()

    # Shutdown backup if newest is > 6 hours old (bounded to 20 seconds)
    try:
        backups = list_backups()
        should_backup = False
        if not backups:
            should_backup = True
        elif backups[0]["age_hours"] > 6.0:
            should_backup = True

        if should_backup:
            logger.info("Shutdown backup triggered (bounded to 20s)...")
            await asyncio.wait_for(asyncio.to_thread(create_backup, "shutdown"), timeout=20.0)
    except asyncio.TimeoutError:
        logger.warning("Shutdown backup timed out after 20 seconds")
    except Exception as e:
        logger.warning("Shutdown backup error: %s", e)

    # Checkpoint WAL and optimize SQLite
    run_shutdown_maintenance(db_path)

    # Release server lock
    release_server_lock()
    logger.info("Server shutdown complete. Lock released.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)


# Request ID & Activity Tracking Middleware
@app.middleware("http")
async def request_middleware(request: Request, call_next):
    record_request_activity()
    req_id = request.headers.get("x-request-id") or f"req-{uuid.uuid4().hex[:12]}"
    request.state.request_id = req_id

    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = req_id
        return response
    except Exception as exc:
        logger.error(
            "Unhandled server exception [%s]: %s",
            req_id,
            exc,
            exc_info=True,
            extra={"request_id": req_id},
        )
        raise exc


# Global custom exception handlers to normalize error responses
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    req_id = getattr(request.state, "request_id", None)
    if exc.status_code >= 500:
        logger.error("HTTP error [%s] %d: %s", req_id, exc.status_code, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": exc.status_code,
            "message": exc.detail,
            "detail": exc.detail,
        },
        headers={"X-Request-ID": req_id} if req_id else None,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    req_id = getattr(request.state, "request_id", None)
    first_error = exc.errors()[0] if exc.errors() else {}
    msg = first_error.get("msg", "Validation error")
    return JSONResponse(
        status_code=422,
        content={
            "status": 422,
            "message": msg,
            "detail": str(exc.errors()),
        },
        headers={"X-Request-ID": req_id} if req_id else None,
    )


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Compression Middleware (JSON & text responses >= 1 KB; Starlette excludes WebSocket)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Mount Routers under /api
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(floors.router, prefix=settings.API_V1_STR)
app.include_router(tables.router, prefix=settings.API_V1_STR)
app.include_router(categories.router, prefix=settings.API_V1_STR)
app.include_router(menu_items.router, prefix=settings.API_V1_STR)
app.include_router(menu.router, prefix=settings.API_V1_STR)
app.include_router(printers.router, prefix=settings.API_V1_STR)
app.include_router(uploads.router, prefix=settings.API_V1_STR)
app.include_router(orders.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)

users_router = APIRouter(prefix="/users", tags=["users"])

@users_router.get("", response_model=list[User])
def list_staff_users(current_user: User = Depends(auth.require_admin)):
    staff = auth.load_staff_users()
    return [
        User(
            id=u["id"],
            username=u["username"],
            name=u["name"],
            role=u["role"],
            allowedFloors=u.get("allowed_floors"),
        )
        for u in staff
    ]

app.include_router(users_router, prefix=settings.API_V1_STR)

# Mount Realtime WebSocket Router
app.include_router(ws_router)


def build_health_response(request: Request) -> Dict[str, Any]:
    """
    Builds the health payload according to the B7 specification:
    - Public shape: {status, time, db, version, opening_time, closing_time, business_day_start_hour, ws}
    - Admin shape (with valid admin token): includes uptime, storage, clock, backup, printers, warnings.
    """
    db_path = get_sqlite_path(settings.DATABASE_URL)
    db_status = "ok"

    try:
        conn = sqlite3.connect(db_path, timeout=3.0)
        conn.execute("SELECT 1").fetchone()
        conn.close()
    except Exception:
        db_status = "error"

    # Status: down if DB error; degraded if warnings or clock suspect; ok otherwise
    from app.core.startup_checks import clock_state, startup_warnings
    overall_status = "ok"
    if db_status == "error":
        overall_status = "down"
    elif startup_warnings or clock_state == "suspect":
        overall_status = "degraded"

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    base_response = {
        "status": overall_status,
        "time": now_utc.isoformat().replace("+00:00", "Z"),
        "db": db_status,
        "version": settings.APP_VERSION,
        "opening_time": settings.OPENING_TIME,
        "closing_time": settings.CLOSING_TIME,
        "business_day_start_hour": settings.BUSINESS_DAY_START_HOUR,
        "ws": {
            "connections": hub.active_connection_count,
        },
    }

    # Verify if caller is an authenticated Admin
    is_admin = False
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            if payload.get("role") == "admin":
                is_admin = True
            else:
                from app.api.endpoints.auth import load_staff_users
                username = payload.get("sub")
                matched = next((u for u in load_staff_users() if u["username"] == username), None)
                if matched and matched.get("role") == "admin":
                    is_admin = True
        except Exception:
            is_admin = False

    if not is_admin:
        return base_response

    # Extended Admin Section
    db_size_mb = round(os.path.getsize(db_path) / (1024.0 * 1024.0), 2) if os.path.exists(db_path) else 0.0
    try:
        _, _, free_bytes = shutil.disk_usage(os.path.dirname(os.path.abspath(db_path)) or ".")
        free_disk_mb = round(free_bytes / (1024.0 * 1024.0), 1)
    except Exception:
        free_disk_mb = 0.0

    local_dt = get_local_now()
    biz_date = compute_business_date(local_dt, start_hour=settings.BUSINESS_DAY_START_HOUR)
    bk_status = get_backup_status()

    # Printers health snapshot
    printers_list = []
    db_session = SessionLocal()
    try:
        for prn in db_session.query(Printer).filter(Printer.is_active == True).all():
            ph = get_printer_health(prn.id)
            printers_list.append({
                "id": prn.id,
                "name": prn.name,
                "state": ph.state if prn.is_active else "offline",
                "lastOkAt": ph.last_success_time.isoformat() if ph.last_success_time else None,
                "lastError": ph.last_failure_message,
            })
    except Exception as e:
        logger.debug("Printers health error: %s", e)
    finally:
        db_session.close()

    admin_fields = {
        "uptimeSeconds": int(time.time() - server_start_epoch),
        "bootId": hub.server_boot_id,
        "dbSizeMb": db_size_mb,
        "freeDiskMb": free_disk_mb,
        "sqliteVersion": sqlite3.sqlite_version,
        "timezone": settings.TIMEZONE,
        "businessDate": biz_date,
        "clock": {
            "state": clock_state,
            "serverTime": now_utc.isoformat().replace("+00:00", "Z"),
        },
        "backup": {
            "lastSuccessAt": bk_status.get("last_success_at"),
            "lastFailureMessage": bk_status.get("last_failure_message"),
            "ageHours": bk_status.get("age_hours"),
            "lastFile": bk_status.get("last_file"),
            "extraCopyOk": bk_status.get("extra_copy_ok", True),
        },
        "printers": printers_list,
        "warnings": list(startup_warnings),
        "lastIntegrityCheck": last_integrity_check,
    }

    return {**base_response, **admin_fields}


@app.get("/health")
def health(request: Request):
    return build_health_response(request)


@app.get("/api/health")
def api_health(request: Request):
    return build_health_response(request)


# Static Frontend Catch-All Mount (Only active when FRONTEND_DIST_DIR is set and exists)
from app.static_frontend import StaticFrontendHandler


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def serve_static_frontend(request: Request, full_path: str):
    if settings.FRONTEND_DIST_DIR and os.path.isdir(settings.FRONTEND_DIST_DIR):
        handler = StaticFrontendHandler(
            dist_dir=settings.FRONTEND_DIST_DIR,
            is_https=(settings.SERVER_MODE == "https"),
        )
        return await handler.handle(request, full_path)
    raise HTTPException(status_code=404, detail="Not Found")
