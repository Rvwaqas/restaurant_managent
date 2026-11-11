import json
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Floor
from app.realtime.hub import (
    ClientConnection,
    hub,
    is_origin_allowed,
    user_can_access_floor,
    validate_token,
)
from app.services.tables import list_tables

logger = logging.getLogger("pos.realtime")

router = APIRouter()


async def handle_websocket_connection(websocket: WebSocket):
    """
    Core WebSocket connection lifecycle handler for /ws and /api/ws.
    """
    await websocket.accept()

    # 1. Origin verification
    origin = websocket.headers.get("origin")
    if not is_origin_allowed(origin):
        logger.warning("WebSocket rejected: Origin '%s' not allowed", origin)
        await websocket.close(code=4403, reason="Forbidden origin")
        return

    # 2. Connection limit verification
    if hub.active_connection_count >= settings.WS_MAX_CONNECTIONS:
        logger.warning("WebSocket rejected: max connections reached (%d)", settings.WS_MAX_CONNECTIONS)
        err_envelope = hub.format_envelope("error", {"code": "TOO_MANY_CONNECTIONS", "message": "Max connections reached"})
        await websocket.send_text(err_envelope)
        await websocket.close(code=4429, reason="Too many connections")
        return

    # 3. Token validation
    token = websocket.query_params.get("token")
    user, token_exp, err_msg = validate_token(token)
    if not user:
        logger.info("WebSocket rejected: unauthorized (%s)", err_msg)
        err_envelope = hub.format_envelope("error", {"code": "UNAUTHORIZED", "message": err_msg or "Unauthorized"})
        await websocket.send_text(err_envelope)
        await websocket.close(code=4401, reason="Unauthorized")
        return

    # 4. Connection registration
    conn = ClientConnection(websocket, user, token_exp, hub)
    try:
        await hub.register(conn)
    except Exception as e:
        logger.error("Failed to register WebSocket client: %s", e)
        await websocket.close(code=4429, reason="Registration failed")
        return

    # 5. Handshake acknowledgment
    ack_payload = {
        "userId": user.id,
        "role": user.role,
        "allowedFloors": user.allowedFloors,
        "serverTime": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "serverBootId": hub.server_boot_id,
        "heartbeatSeconds": settings.WS_HEARTBEAT_SECONDS,
    }
    await conn.send_envelope("connection.ack", ack_payload)

    # 6. Message receive loop
    try:
        while not conn.is_closed:
            raw_msg = await websocket.receive_text()

            # Enforce maximum frame size
            if len(raw_msg.encode("utf-8")) > settings.WS_MAX_MESSAGE_BYTES:
                logger.warning("Client %s sent oversized message (%d bytes)", user.username, len(raw_msg))
                await conn.close(code=4429, reason="Message too large")
                break

            # Enforce rate limiting (10 msgs/s)
            if not conn.check_rate_limit(max_per_second=10):
                logger.warning("Client %s exceeded rate limit (10 msgs/s)", user.username)
                await conn.close(code=4429, reason="Rate limit exceeded")
                break

            conn.last_received_time = time.monotonic()

            try:
                data = json.loads(raw_msg)
                if not isinstance(data, dict):
                    raise ValueError("JSON object expected")
            except Exception:
                await conn.send_error("BAD_MESSAGE", "Invalid JSON")
                continue

            msg_type = data.get("type")

            if msg_type == "subscribe":
                floor_id = data.get("floorId")
                if not floor_id:
                    await conn.send_error("BAD_MESSAGE", "Missing floorId in subscribe request")
                    continue

                db = SessionLocal()
                try:
                    floor_key = floor_id.replace("floor-", "f") if floor_id.startswith("floor-") else floor_id
                    floor = db.query(Floor).filter(
                        (Floor.id == floor_id) | (Floor.id == floor_key)
                    ).first()

                    if not floor:
                        await conn.send_error("BAD_MESSAGE", f"Floor '{floor_id}' not found")
                        continue

                    if not user_can_access_floor(conn.user, floor.id):
                        await conn.send_error("FORBIDDEN", f"Access to floor '{floor_id}' is forbidden")
                        continue

                    # Subscribe to canonical floor topic
                    conn.subscriptions.add(f"floor:{floor.id}")
                    is_admin = conn.user.role == "admin"
                    tables_list = list_tables(db, floor_id=floor.id, is_admin=is_admin, include_inactive=is_admin)
                    tables_data = [t.model_dump() for t in tables_list]
                    await conn.send_envelope("subscribed", {"floorId": floor_id, "tables": tables_data})
                finally:
                    db.close()

            elif msg_type == "unsubscribe":
                floor_id = data.get("floorId")
                if not floor_id:
                    await conn.send_error("BAD_MESSAGE", "Missing floorId in unsubscribe request")
                    continue

                floor_key = floor_id.replace("floor-", "f") if floor_id.startswith("floor-") else floor_id
                conn.subscriptions.discard(f"floor:{floor_id}")
                conn.subscriptions.discard(f"floor:{floor_key}")
                await conn.send_envelope("unsubscribed", {"floorId": floor_id})

            elif msg_type == "ping":
                client_ts = data.get("clientTs")
                await conn.send_envelope("pong", {"clientTs": client_ts})

            else:
                await conn.send_error("BAD_MESSAGE", f"Unknown message type '{msg_type}'")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("WebSocket connection terminated for %s: %s", user.username, e)
    finally:
        await hub.unregister(conn)
        await conn.close(code=1000, reason="Connection closed")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_websocket_connection(websocket)


@router.websocket("/api/ws")
async def websocket_api_endpoint(websocket: WebSocket):
    await handle_websocket_connection(websocket)

