import datetime
import zoneinfo
from typing import Optional, Tuple

from app.core.config import settings


def get_local_timezone() -> zoneinfo.ZoneInfo:
    tz_name = getattr(settings, "TIMEZONE", "Asia/Karachi")
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception as e:
        raise RuntimeError(
            f"Failed to load configured timezone '{tz_name}'. "
            f"Ensure the 'tzdata' package is installed. Error: {e}"
        )


def get_local_now() -> datetime.datetime:
    return datetime.datetime.now(get_local_timezone())


def to_local(dt: datetime.datetime) -> datetime.datetime:
    tz = get_local_timezone()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(tz)


def compute_business_date(dt: datetime.datetime, start_hour: Optional[int] = None) -> str:
    sh = start_hour if start_hour is not None else getattr(settings, "BUSINESS_DAY_START_HOUR", 5)
    local_dt = to_local(dt)
    if local_dt.hour < sh:
        biz_date = (local_dt - datetime.timedelta(days=1)).date()
    else:
        biz_date = local_dt.date()
    return biz_date.strftime("%Y-%m-%d")


def compute_order_date_fields(paid_at_utc: datetime.datetime, start_hour: Optional[int] = None) -> Tuple[str, int, int]:
    """
    Computes (business_date, paid_local_hour, paid_local_weekday).
    paid_local_weekday: 0=Monday ... 6=Sunday.
    """
    sh = start_hour if start_hour is not None else getattr(settings, "BUSINESS_DAY_START_HOUR", 5)
    local_dt = to_local(paid_at_utc)
    biz_date = compute_business_date(local_dt, start_hour=sh)
    return biz_date, local_dt.hour, local_dt.weekday()
