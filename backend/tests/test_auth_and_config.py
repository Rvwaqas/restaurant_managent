import pytest
from app.core.config import settings
from app.core.security import hash_password, verify_password

def test_settings_operating_hours():
    assert settings.OPENING_TIME == "07:00"
    assert settings.CLOSING_TIME == "23:00"
    assert settings.BUSINESS_DAY_START_HOUR == 5

def test_scrypt_password_hashing():
    pwd = "secret_password_123"
    hashed = hash_password(pwd)
    assert hashed.startswith("scrypt$16384$8$1$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrong_password", hashed) is False

def test_scrypt_constant_time_rejects_malformed():
    assert verify_password("test", "invalid$format") is False
    assert verify_password("test", "") is False


def test_get_api_users_security():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. Unauthenticated -> 401
    res_unauth = client.get("/api/users")
    assert res_unauth.status_code == 401

    # 2. Waiter -> 403
    waiter_login = client.post("/api/auth/login", json={"username": "waiter1", "password": "1234"})
    assert waiter_login.status_code == 200
    waiter_token = waiter_login.json()["token"]
    res_waiter = client.get("/api/users", headers={"Authorization": f"Bearer {waiter_token}"})
    assert res_waiter.status_code == 403

    # 3. Admin -> 200
    admin_login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["token"]
    res_admin = client.get("/api/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    users = res_admin.json()
    assert len(users) >= 4

    # 4. Strictly assert allowed fields and NO secrets/hashes
    raw_text = res_admin.text.lower()
    assert "password" not in raw_text
    assert "scrypt" not in raw_text
    assert "hash" not in raw_text
    assert "secret" not in raw_text

    allowed_keys = {"id", "username", "name", "role", "allowedFloors"}
    for u in users:
        assert set(u.keys()).issubset(allowed_keys)
        assert u["role"] in ["admin", "waiter"]
        assert isinstance(u["username"], str)
        assert isinstance(u["id"], str)


