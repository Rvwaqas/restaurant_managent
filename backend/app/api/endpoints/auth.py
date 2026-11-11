import os
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import jwt
import yaml
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.core.security import ALGORITHM, create_access_token, verify_password
from app.schemas import LoginRequest, LoginResponse, User

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

# In-memory sliding window for login rate limiting: per username -> list of timestamps
_failed_login_attempts: dict[str, list[float]] = defaultdict(list)

def check_login_rate_limit(host: str | None, username: str):
    now = time.time()
    user_key = f"user:{username.strip().lower()}" if username else "user:anonymous"
    attempts = [t for t in _failed_login_attempts[user_key] if now - t < 60]
    _failed_login_attempts[user_key] = attempts
    if len(attempts) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 60 seconds before trying again.",
            headers={"Retry-After": "60"},
        )

def record_failed_login(host: str | None, username: str):
    now = time.time()
    user_key = f"user:{username.strip().lower()}" if username else "user:anonymous"
    _failed_login_attempts[user_key].append(now)

def clear_failed_logins(host: str | None, username: str):
    user_key = f"user:{username.strip().lower()}" if username else "user:anonymous"
    _failed_login_attempts.pop(user_key, None)

def load_staff_users():
    """Loads users from config/users.yaml or fallback config/users.example.yaml."""
    app_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    candidates = [
        settings.USERS_CONFIG_PATH,
        os.path.join(app_dir, "config", "users.yaml"),
        os.path.join(app_dir, "config", "users.example.yaml"),
        os.path.join("backend", "config", "users.yaml"),
        os.path.join("config", "users.yaml"),
    ]
    cfg_path = None
    for cand in candidates:
        if cand and os.path.exists(cand):
            cfg_path = cand
            break
    if not cfg_path:
        return []
    with open(cfg_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
        return data.get("users", [])

def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    users = load_staff_users()
    matched = next((u for u in users if u["username"] == username), None)
    if not matched:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return User(
        id=matched["id"],
        username=matched["username"],
        name=matched["name"],
        role=matched["role"],
        allowedFloors=matched.get("allowed_floors"),
    )

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user

@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request):
    from app.services import audit

    client_host = request.client.host if request.client else None
    check_login_rate_limit(client_host, payload.username)

    users = load_staff_users()
    matched = next((u for u in users if u["username"] == payload.username), None)
    if not matched:
        record_failed_login(client_host, payload.username)
        audit.record(
            event="auth.login.failure",
            user_id=payload.username,
            role="anonymous",
            details={"username": payload.username, "reason": "user_not_found"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if not verify_password(payload.password, matched["password_hash"]):
        record_failed_login(client_host, payload.username)
        audit.record(
            event="auth.login.failure",
            user_id=matched["id"],
            role=matched.get("role", "anonymous"),
            details={"username": payload.username, "reason": "invalid_password"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    clear_failed_logins(client_host, payload.username)

    user_obj = User(
        id=matched["id"],
        username=matched["username"],
        name=matched["name"],
        role=matched["role"],
        allowedFloors=matched.get("allowed_floors"),
    )
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token({"sub": user_obj.username, "role": user_obj.role})

    audit.record(
        event="auth.login.success",
        user_id=user_obj.id,
        role=user_obj.role,
        entity="user",
        entity_id=user_obj.id,
        details={"username": user_obj.username, "role": user_obj.role},
    )

    return LoginResponse(
        token=token,
        user=user_obj,
        expiresAt=expires_at.isoformat(),
    )

@router.get("/me", response_model=User)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout():
    return {"success": True}


