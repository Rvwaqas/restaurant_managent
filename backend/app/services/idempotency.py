import datetime
import hashlib
import json
from typing import Any, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.models import IdempotencyKey


def compute_request_hash(payload: Any) -> str:
    """
    Compute a deterministic SHA-256 hash of a payload dictionary or pydantic model.
    """
    if hasattr(payload, "model_dump"):
        data = payload.model_dump(mode="json")
    elif isinstance(payload, dict):
        data = payload
    else:
        data = str(payload)

    canonical_json = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

def check_idempotency(
    db: Session,
    request_id: str,
    action: str,
    request_hash: str,
) -> Optional[Tuple[int, dict]]:
    """
    Checks if a requestId has already been processed.
    Raises 409 if requestId exists but with a different payload hash.
    Returns (status_code, cached_payload) if duplicate matches, or None if new.
    """
    if not request_id:
        return None

    entry = db.query(IdempotencyKey).filter(IdempotencyKey.request_id == request_id).first()
    if not entry:
        return None

    if entry.request_hash and entry.request_hash != request_hash:
        raise HTTPException(
            status_code=409,
            detail="requestId was already used with a different request",
        )

    try:
        cached_data = json.loads(entry.response_payload)
    except Exception:
        cached_data = {}

    return entry.status_code, cached_data

def save_idempotency(
    db: Session,
    request_id: str,
    action: str,
    order_id: Optional[str],
    request_hash: str,
    response_payload: Any,
    status_code: int = 200,
) -> IdempotencyKey:
    """
    Stores an idempotency key and response snapshot inside the current transaction.
    """
    if not request_id:
        return None

    if hasattr(response_payload, "model_dump"):
        dumped = response_payload.model_dump(mode="json")
    else:
        dumped = response_payload

    payload_json = json.dumps(dumped, default=str)

    entry = IdempotencyKey(
        request_id=request_id,
        action=action,
        order_id=order_id,
        request_hash=request_hash,
        response_payload=payload_json,
        status_code=status_code,
        created_at=now_utc(),
    )
    db.merge(entry)
    return entry

def cleanup_old_idempotency_keys(db: Session, max_age_hours: int = 24) -> int:
    """
    Purge idempotency keys older than max_age_hours (default 24h).
    """
    cutoff = now_utc() - datetime.timedelta(hours=max_age_hours)
    deleted = db.query(IdempotencyKey).filter(IdempotencyKey.created_at < cutoff).delete()
    db.commit()
    return deleted

