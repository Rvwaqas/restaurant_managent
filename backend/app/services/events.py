import logging
from typing import Any, Dict

logger = logging.getLogger("events")


def emit(event_type: str, payload: Dict[str, Any]) -> None:
    """
    Real-time event dispatcher hook.
    Logs events at DEBUG level.
    Enqueues events to ConnectionHub if loop is active and hub is running.
    """
    logger.debug(f"[EVENT] {event_type}: {payload}")
    try:
        from app.realtime.hub import hub
        if hub.loop and hub.running and not hub.loop.is_closed():
            hub.loop.call_soon_threadsafe(hub.enqueue_event, event_type, payload)
    except Exception as e:
        logger.warning(f"Failed to enqueue event {event_type} to hub: {e}")
