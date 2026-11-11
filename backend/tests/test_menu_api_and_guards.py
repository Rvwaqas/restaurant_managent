import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, Base, engine
from app.seed.initial_data import run_seed

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    run_seed(db, "backend/seed_data/floor-2-menu.csv")
    db.close()

def test_login_and_floor_menu_access():
    # Login as admin
    admin_login = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["token"]

    # Admin reads floor 2 menu
    f2_res = client.get("/api/menu?floorId=f2", headers={"Authorization": f"Bearer {admin_token}"})
    assert f2_res.status_code == 200
    data = f2_res.json()
    assert len(data["categories"]) == 3
    # 80 active items returned in menu
    assert len(data["items"]) == 80
    for item in data["items"]:
        assert item["floorId"] == "f2"

    # Waiter 1 and 2 (assigned to both floors) get 200 on floor 2
    w1_login = client.post("/api/auth/login", json={"username": "waiter1", "password": "1234"})
    assert w1_login.status_code == 200
    w1_token = w1_login.json()["token"]
    w1_res = client.get("/api/menu?floorId=f2", headers={"Authorization": f"Bearer {w1_token}"})
    assert w1_res.status_code == 200

    # Waiter 3 (assigned to floor 1 only) gets 403 on floor 2 and 200 on floor 1
    w3_login = client.post("/api/auth/login", json={"username": "waiter3", "password": "1234"})
    assert w3_login.status_code == 200
    w3_token = w3_login.json()["token"]

    forbidden_res = client.get("/api/menu?floorId=f2", headers={"Authorization": f"Bearer {w3_token}"})
    assert forbidden_res.status_code == 403

    w3_res = client.get("/api/menu?floorId=f1", headers={"Authorization": f"Bearer {w3_token}"})
    assert w3_res.status_code == 200
    w3_data = w3_res.json()
    assert len(w3_data["items"]) == 8

