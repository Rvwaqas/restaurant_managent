import asyncio
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import jwt
from fastapi import WebSocket

from app.api.endpoints.auth import load_staff_users
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import ALGORITHM
from app.models import Order, Printer, Table
from app.schemas import User
from app.services.orders import serialize_order
from app.services.tables import get_table_schema, list_tables

logger = logging.getLogger("pos.realtime")

LAN_ORIGIN_REGEX = re.compile(
    r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
)


def is_origin_allowed(origin: Optional[str]) -> bool:
    """
    Validates Origin header against WS_ALLOWED_ORIGINS and local LAN regex.
    Missing Origin is allowed only when APP_ENV=dev (non-browser tools).
    """
    if not origin:
        return settings.APP_ENV == "dev"

    origin_clean = origin.strip().lower()
    allowed_list = [o.strip().lower() for o in settings.WS_ALLOWED_ORIGINS.split(",") if o.strip()]

    if "*" in allowed_list:
        return True

    if origin_clean in allowed_list:
        return True

    if LAN_ORIGIN_REGEX.match(origin_clean):
        return True

    return False


def validate_token(token: Optional[str]) -> Tuple[Optional[User], Optional[float], Optional[str]]:
    """
    Validates JWT token for WebSocket connection.
    Returns (User, exp_timestamp, error_message).
    """
    if not token:
        return None, None, "Missing authentication token"

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        exp = payload.get("exp")
        if not username:
            return None, None, "Invalid token: missing subject"
    except jwt.ExpiredSignatureError:
        return None, None, "Session expired"
    except Exception as e:
        return None, None, f"Invalid token: {e}"

    users = load_staff_users()
    matched = next((u for u in users if u["username"] == username), None)
    if not matched:
        return None, None, "User not found"

    user = User(
        id=matched["id"],
        username=matched["username"],
        name=matched["name"],
        role=matched["role"],
        allowedFloors=matched.get("allowed_floors"),
    )
    return user, exp, None


def user_can_access_floor(user: User, floor_id: str) -> bool:
    """Checks if a user is permitted to view/subscribe to a floor."""
    if user.role == "admin":
        return True
    if not user.allowedFloors:
        return True
    # Support 'f1' or 'floor-1' representations
    if floor_id in user.allowedFloors:
        return True
    slug = f"floor-{floor_id.replace('f', '')}"
    return slug in user.allowedFloors


class ClientConnection:
    """Represents an active WebSocket client session."""

    def __init__(self, websocket: WebSocket, user: User, token_exp: Optional[float], hub: "ConnectionHub"):
        self.websocket = websocket
        self.user = user
        self.token_exp = token_exp
        self.hub = hub
        self.subscriptions: Set[str] = set()
        self.send_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=settings.WS_SEND_QUEUE_MAX)
        self.last_received_time: float = time.monotonic()
        self.message_timestamps: List[float] = []
        self.writer_task: Optional[asyncio.Task] = None
        self.is_closed: bool = False

    def check_rate_limit(self, max_per_second: int = 10) -> bool:
        """Tracks message timestamps and returns False if exceeding rate limit."""
        now = time.monotonic()
        self.message_timestamps = [t for t in self.message_timestamps if now - t < 1.0]
        if len(self.message_timestamps) >= max_per_second:
            return False
        self.message_timestamps.append(now)
        return True

    async def writer_loop(self):
        """Dedicated writer task draining the bounded send queue."""
        try:
            while not self.is_closed:
                msg = await self.send_queue.get()
                await self.websocket.send_text(msg)
                self.send_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.debug("Writer loop exception for user %s: %s", self.user.username, e)
            self.is_closed = True

    def queue_message(self, json_text: str) -> bool:
        """
        Pushes a message onto the client's bounded send queue.
        Returns False if queue overflows (slow consumer).
        """
        if self.is_closed:
            return False
        try:
            self.send_queue.put_nowait(json_text)
            return True
        except asyncio.QueueFull:
            logger.warning("Slow consumer detected for user %s (queue full). Closing socket.", self.user.username)
            if self.hub.loop and not self.hub.loop.is_closed():
                self.hub.loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(self.close(code=1013, reason="Send queue overflow"))
                )
            return False

    async def send_envelope(self, msg_type: str, payload: Dict[str, Any]):
        """Builds and queues a standard server envelope message."""
        json_text = self.hub.format_envelope(msg_type, payload)
        self.queue_message(json_text)

    async def send_error(self, code: str, message: str):
        """Sends a standard protocol error message."""
        await self.send_envelope("error", {"code": code, "message": message})

    async def close(self, code: int = 1000, reason: str = ""):
        """Safely closes the underlying WebSocket."""
        if self.is_closed:
            return
        self.is_closed = True
        if self.writer_task and not self.writer_task.done():
            self.writer_task.cancel()
        try:
            await self.websocket.close(code=code, reason=reason)
        except Exception:
            pass


class ConnectionHub:
    """
    Central asyncio real-time connection hub.
    Manages client sockets, subscriptions, coalesced broadcasting, and heartbeats.
    """

    def __init__(self):
        self.connections: Set[ClientConnection] = set()
        self.server_boot_id: str = str(uuid.uuid4())
        self.seq_counter: int = 0
        self.pending_events: Dict[Tuple[str, str], Tuple[str, Dict[str, Any], float]] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.broadcaster_task: Optional[asyncio.Task] = None
        self.heartbeat_task: Optional[asyncio.Task] = None
        self.running: bool = False
        self._lock = asyncio.Lock()

    @property
    def active_connection_count(self) -> int:
        return len(self.connections)

    def next_seq(self) -> int:
        self.seq_counter += 1
        return self.seq_counter

    def format_envelope(self, msg_type: str, payload: Dict[str, Any]) -> str:
        """Constructs the canonical JSON server envelope."""
        envelope = {
            "id": str(uuid.uuid4()),
            "seq": self.next_seq(),
            "type": msg_type,
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "payload": payload,
        }
        return json.dumps(envelope)

    def start(self, loop: asyncio.AbstractEventLoop):
        """Starts background tasks on the running asyncio loop."""
        self.loop = loop
        self.running = True
        self.broadcaster_task = loop.create_task(self._broadcaster_loop())
        self.heartbeat_task = loop.create_task(self._heartbeat_loop())
        logger.info("Realtime ConnectionHub started (boot_id=%s)", self.server_boot_id)

    async def stop(self):
        """Gracefully disconnects all clients with code 1001 and stops tasks."""
        self.running = False
        logger.info("Stopping ConnectionHub: disconnecting %d client(s)...", len(self.connections))

        # Close all active connections with 1001 (Server Restarting)
        close_coros = [conn.close(code=1001, reason="Server restarting") for conn in list(self.connections)]
        if close_coros:
            await asyncio.gather(*close_coros, return_exceptions=True)
        self.connections.clear()

        if self.broadcaster_task and not self.broadcaster_task.done():
            self.broadcaster_task.cancel()
        if self.heartbeat_task and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()

    async def register(self, conn: ClientConnection):
        """Registers a new validated client connection."""
        async with self._lock:
            if len(self.connections) >= settings.WS_MAX_CONNECTIONS:
                raise RuntimeError("Too many connections")
            self.connections.add(conn)
            # Admins automatically subscribe to the admin topic
            if conn.user.role == "admin":
                conn.subscriptions.add("admin")
            conn.writer_task = asyncio.create_task(conn.writer_loop())

    async def unregister(self, conn: ClientConnection):
        """Removes a client connection."""
        async with self._lock:
            self.connections.discard(conn)
            if conn.writer_task and not conn.writer_task.done():
                conn.writer_task.cancel()

    def enqueue_event(self, event_type: str, payload: Dict[str, Any]):
        """
        Called thread-safely via loop.call_soon_threadsafe.
        Coalesces descriptors for the same (type, entity_id) within WS_COALESCE_MS.
        """
        entity_id = (
            str(payload.get("tableId") or "")
            or str(payload.get("orderId") or "")
            or str(payload.get("floorId") or "")
            or str(payload.get("printerId") or "")
            or "global"
        )
        key = (event_type, entity_id)
        self.pending_events[key] = (event_type, payload, time.monotonic())

    async def _broadcaster_loop(self):
        """Periodically flushes and fans out coalesced event descriptors."""
        interval = settings.WS_COALESCE_MS / 1000.0
        while self.running:
            await asyncio.sleep(interval)
            if not self.pending_events:
                continue

            # Take current snapshot of pending events
            batch = self.pending_events
            self.pending_events = {}

            try:
                # Process payload building in thread executor to avoid blocking loop
                await asyncio.to_thread(self._process_coalesced_batch, batch)
            except Exception as e:
                logger.error("Error processing coalesced batch: %s", e, exc_info=True)

    def _process_coalesced_batch(self, batch: Dict[Tuple[str, str], Tuple[str, Dict[str, Any], float]]):
        """Builds fresh payloads from DB and queues messages to subscribed clients."""
        db = SessionLocal()
        try:
            for (event_type, entity_id), (_, raw_payload, _) in batch.items():
                if event_type == "table.updated":
                    table_id = raw_payload.get("tableId")
                    floor_id = raw_payload.get("floorId")
                    bulk = raw_payload.get("bulk", False)

                    if bulk and floor_id:
                        # Bulk table update: emit individual table updates
                        tables = list_tables(db, floor_id=floor_id, is_admin=True)
                        for t in tables:
                            self._fanout_table_updated(db, t.id, floor_id)
                    elif table_id:
                        self._fanout_table_updated(db, table_id, floor_id)

                elif event_type == "order.updated":
                    order_id = raw_payload.get("orderId")
                    if order_id:
                        order = db.query(Order).filter(Order.id == order_id).first()
                        if order:
                            order_schema = serialize_order(order)
                            payload = {
                                "floorId": order.floor_id,
                                "tableId": order.table_id,
                                "orderId": order.id,
                                "order": order_schema.model_dump(),
                            }
                            topic = f"floor:{order.floor_id}"
                            self._fanout_message(topic, "order.updated", payload)

                elif event_type == "bill.paid":
                    order_id = raw_payload.get("orderId")
                    order = db.query(Order).filter(Order.id == order_id).first() if order_id else None
                    floor_id = (order.floor_id if order else None) or raw_payload.get("floorId")
                    table_id = (order.table_id if order else None) or raw_payload.get("tableId")
                    bill_no = (order.bill_no if order else None) or raw_payload.get("billNo")
                    total = (order.total if order else None) or raw_payload.get("total")
                    method = (order.payment_method if order else None) or raw_payload.get("method")
                    payload = {
                        "floorId": floor_id,
                        "tableId": table_id,
                        "orderId": order_id,
                        "billNo": bill_no,
                        "total": total,
                        "method": method,
                    }
                    if floor_id:
                        self._fanout_message(f"floor:{floor_id}", "bill.paid", payload, extra_topic="admin")
                    else:
                        self._fanout_message("admin", "bill.paid", payload)

                elif event_type == "menu.changed":
                    floor_id = raw_payload.get("floorId")
                    if floor_id:
                        self._fanout_message(f"floor:{floor_id}", "menu.changed", {"floorId": floor_id})
                    else:
                        for f in ["f1", "f2"]:
                            self._fanout_message(f"floor:{f}", "menu.changed", {"floorId": f})

                elif event_type == "printer.status":
                    printer_id = raw_payload.get("printerId")
                    state = raw_payload.get("state", "ok")
                    msg = raw_payload.get("message", "Printer status updated")
                    if printer_id:
                        prn = db.query(Printer).filter(Printer.id == printer_id).first()
                        if prn and not prn.is_active:
                            state = "offline"
                    self._fanout_message("admin", "printer.status", {
                        "printerId": printer_id,
                        "state": state,
                        "message": msg,
                    })

        finally:
            db.close()

    def _fanout_table_updated(self, db, table_id: str, floor_id_hint: Optional[str]):
        """Fans out table.updated respecting admin vs waiter visibility."""
        table = db.query(Table).filter(Table.id == table_id).first()
        if not table or table.is_deleted:
            floor_id = floor_id_hint or (table.floor_id if table else None)
            if floor_id:
                payload = {"floorId": floor_id, "tableId": table_id, "table": None}
                self._fanout_message(f"floor:{floor_id}", "table.updated", payload)
            return

        floor_id = table.floor_id
        admin_schema = get_table_schema(table, db).model_dump()
        waiter_schema = admin_schema if table.is_active else None

        topic = f"floor:{floor_id}"
        matching_conns = self._get_subscribed_connections(topic)

        # Distribute based on role
        for conn in matching_conns:
            if not user_can_access_floor(conn.user, floor_id):
                continue
            table_obj = admin_schema if conn.user.role == "admin" else waiter_schema
            payload = {"floorId": floor_id, "tableId": table.id, "table": table_obj}
            json_text = self.format_envelope("table.updated", payload)
            conn.queue_message(json_text)

    def _get_subscribed_connections(self, topic: str, extra_topic: Optional[str] = None) -> Set[ClientConnection]:
        """Returns set of connections subscribed to either topic."""
        result: Set[ClientConnection] = set()
        for conn in list(self.connections):
            if topic in conn.subscriptions:
                result.add(conn)
            elif extra_topic and extra_topic in conn.subscriptions:
                result.add(conn)
        return result

    def _fanout_message(self, topic: str, msg_type: str, payload: Dict[str, Any], extra_topic: Optional[str] = None):
        """Fans out a pre-formatted message to subscribed, authorized clients."""
        matching = self._get_subscribed_connections(topic, extra_topic)
        if not matching:
            return

        json_text = self.format_envelope(msg_type, payload)
        floor_id = payload.get("floorId")

        for conn in matching:
            # Enforce floor authorization if message pertains to a floor
            if floor_id and not user_can_access_floor(conn.user, floor_id):
                continue
            conn.queue_message(json_text)

    async def _heartbeat_loop(self):
        """Periodic heartbeat and idle/token expiry audit."""
        while self.running:
            await asyncio.sleep(settings.WS_HEARTBEAT_SECONDS)
            now_mono = time.monotonic()
            now_epoch = datetime.now(timezone.utc).timestamp()

            for conn in list(self.connections):
                if conn.is_closed:
                    continue

                # 1. Idle timeout check
                if now_mono - conn.last_received_time > settings.WS_IDLE_TIMEOUT_SECONDS:
                    logger.info("Closing connection for %s (idle timeout %ds)", conn.user.username, settings.WS_IDLE_TIMEOUT_SECONDS)
                    await conn.close(code=4408, reason="Idle timeout")
                    await self.unregister(conn)
                    continue

                # 2. Token expiry check
                if conn.token_exp and now_epoch >= conn.token_exp:
                    logger.info("Closing connection for %s (session expired)", conn.user.username)
                    await conn.send_error("UNAUTHORIZED", "Session expired")
                    await conn.close(code=4401, reason="Session expired")
                    await self.unregister(conn)
                    continue

                # 3. Send standard heartbeat
                await conn.send_envelope("heartbeat", {})


# Global singleton hub
hub = ConnectionHub()
