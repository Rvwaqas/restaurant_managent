import datetime
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AuditLog

logger = logging.getLogger("pos.audit")

# Keys that must never appear in audit details
SENSITIVE_KEYS = {"password", "token", "secret", "password_hash", "access_token"}


def sanitize_audit_details(details: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Recursively removes passwords and secret tokens from audit details."""
    if not details:
        return None

    sanitized: Dict[str, Any] = {}
    for k, v in details.items():
        k_lower = k.lower()
        if k_lower in SENSITIVE_KEYS or any(s in k_lower for s in ("password", "token", "secret", "secret_hash")):
            continue
        if isinstance(v, dict):
            sanitized[k] = sanitize_audit_details(v)
        elif isinstance(v, list):
            sanitized[k] = [
                sanitize_audit_details(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            sanitized[k] = v
    return sanitized


def append_audit_file(entry_dict: Dict[str, Any]) -> None:
    """Appends an audit entry as a single JSON line to audit.log (never raises into caller)."""
    try:
        log_dir = settings.LOG_DIR
        os.makedirs(log_dir, exist_ok=True)
        audit_file = os.path.join(log_dir, "audit.log")
        line = json.dumps(entry_dict, ensure_ascii=False) + "\n"
        with open(audit_file, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        logger.warning("Failed to write audit file log: %s", e)


def record(
    session: Optional[Session] = None,
    event: str = "system.event",
    user_id: Optional[str] = None,
    role: str = "system",
    ip: Optional[str] = None,
    request_id: Optional[str] = None,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """
    Records an append-only audit trail entry.
    If a database session is provided, the row is added to that session,
    guaranteeing atomicity with the business transaction.
    Also appends a JSON line to data/logs/audit.log.
    """
    clean_details = sanitize_audit_details(details)
    details_str = json.dumps(clean_details, ensure_ascii=False) if clean_details is not None else None
    log_id = f"aud-{uuid.uuid4().hex[:16]}"
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # 1. Database persistence
    audit_entry = AuditLog(
        id=log_id,
        ts=now_utc.replace(tzinfo=None),  # Store naive UTC in SQLite
        event=event,
        user_id=user_id,
        role=role,
        ip=ip,
        request_id=request_id,
        entity=entity,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=details_str,
    )

    if session is not None:
        session.add(audit_entry)
    else:
        db = SessionLocal()
        try:
            db.add(audit_entry)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Failed to commit standalone audit entry: %s", e)
        finally:
            db.close()

    # 2. File append (data/logs/audit.log)
    file_record = {
        "id": log_id,
        "ts": now_utc.isoformat().replace("+00:00", "Z"),
        "event": event,
        "user_id": user_id,
        "role": role,
        "ip": ip,
        "request_id": request_id,
        "entity": entity,
        "entity_id": entity_id,
        "details": clean_details,
    }
    append_audit_file(file_record)

    return audit_entry


def prune_audit_logs(db: Session, retention_days: Optional[int] = None) -> int:
    """Prunes audit logs older than AUDIT_RETENTION_DAYS (default 730 days)."""
    days = retention_days if retention_days is not None else settings.AUDIT_RETENTION_DAYS
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    deleted = db.query(AuditLog).filter(AuditLog.ts < cutoff).delete(synchronize_session=False)
    if deleted > 0:
        db.commit()
        logger.info("Pruned %d audit log rows older than %d days", deleted, days)
    return deleted


def query_audit_logs(
    db: Session,
    limit: int = 100,
    event: Optional[str] = None,
    since: Optional[datetime.datetime] = None,
) -> List[AuditLog]:
    """Queries audit logs ordered by newest first for diagnostic inspection."""
    q = db.query(AuditLog)
    if event:
        q = q.filter(AuditLog.event == event)
    if since:
        q = q.filter(AuditLog.ts >= since)
    return q.order_by(AuditLog.ts.desc()).limit(limit).all()
