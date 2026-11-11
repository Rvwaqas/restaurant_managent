import datetime
from typing import Optional

from app.core.config import settings
from app.core.timeutil import compute_business_date

_clock_override: Optional[datetime.datetime] = None

def set_clock(dt: datetime.datetime) -> None:
    """Override clock for testing purposes."""
    global _clock_override
    _clock_override = dt

def reset_clock() -> None:
    """Reset clock override to system time."""
    global _clock_override
    _clock_override = None

def now_utc() -> datetime.datetime:
    """Returns current UTC datetime, or the overridden mock datetime."""
    global _clock_override
    if _clock_override is not None:
        return _clock_override
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def get_business_date(dt: Optional[datetime.datetime] = None) -> str:
    """
    Computes business date string (YYYY-MM-DD).
    Business day starts at settings.BUSINESS_DAY_START_HOUR (default 5 AM local).
    """
    target = dt if dt is not None else now_utc()
    return compute_business_date(target, start_hour=settings.BUSINESS_DAY_START_HOUR)

