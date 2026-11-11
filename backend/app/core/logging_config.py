import datetime
import json
import logging
import os
import sqlite3
import sys
from logging.handlers import RotatingFileHandler

from app.core.config import settings
from app.core.logging_filters import TokenRedactingFilter, apply_token_redaction
from app.core.timeutil import compute_business_date, get_local_now


class JsonLogFormatter(logging.Formatter):
    """Formats log records as JSON lines for production consumption."""

    def format(self, record: logging.LogRecord) -> str:
        record_dict = {
            "ts": datetime.datetime.fromtimestamp(record.created, datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        if record.exc_info:
            record_dict["exception"] = self.formatException(record.exc_info)
        return json.dumps(record_dict, ensure_ascii=False)


def setup_logging():
    """Initializes rotating file handlers and console loggers with token sanitization."""
    log_dir = settings.LOG_DIR
    os.makedirs(log_dir, exist_ok=True)

    redacting_filter = TokenRedactingFilter()
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # 1. Rotating File Handler for app.log (5 MB x 10 backups)
    app_log_path = os.path.join(log_dir, "app.log")
    file_handler = RotatingFileHandler(
        app_log_path,
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    if settings.APP_ENV == "prod":
        file_handler.setFormatter(JsonLogFormatter())
    else:
        file_handler.setFormatter(
            logging.Formatter("[%(asctime)s] %(levelname)-7s [%(name)s] %(message)s")
        )
    file_handler.addFilter(redacting_filter)

    # Attach to root logger if not already attached
    if not any(isinstance(h, RotatingFileHandler) and getattr(h, "baseFilename", "") == os.path.abspath(app_log_path) for h in root_logger.handlers):
        root_logger.addHandler(file_handler)

    # Apply redaction filter across all loggers
    apply_token_redaction()


def log_startup_banner(boot_id: str, db_path: str):
    """Outputs the diagnostic startup banner to logs."""
    banner_logger = logging.getLogger("pos.startup")

    db_size_mb = 0.0
    if os.path.exists(db_path):
        db_size_mb = round(os.path.getsize(db_path) / (1024.0 * 1024.0), 2)

    local_dt = get_local_now()
    biz_date = compute_business_date(local_dt, start_hour=settings.BUSINESS_DAY_START_HOUR)

    from app.services.backup import get_backup_status
    bk_status = get_backup_status()
    bk_summary = (
        f"{bk_status.get('last_file', 'none')} (age: {bk_status.get('age_hours', '?')}h)"
        if bk_status.get("last_file")
        else "No backups found"
    )

    banner_lines = [
        "=" * 70,
        f"  {settings.PROJECT_NAME} v{settings.APP_VERSION}",
        f"  Environment : {settings.APP_ENV.upper()} | Boot ID: {boot_id}",
        f"  Database    : {db_path} ({db_size_mb} MB) | SQLite: {sqlite3.sqlite_version}",
        f"  Python      : {sys.version.split()[0]} ({sys.platform})",
        f"  Timezone    : {settings.TIMEZONE} | Local Time: {local_dt.strftime('%Y-%m-%d %H:%M:%S')}",
        f"  Business Day: {biz_date} (Reset Hour: {settings.BUSINESS_DAY_START_HOUR}:00)",
        f"  Print Mode  : {settings.PRINT_MODE.upper()} (Columns: {settings.PRINT_COLUMNS})",
        f"  Last Backup : {bk_summary}",
        "=" * 70,
    ]
    for line in banner_lines:
        banner_logger.info(line)

