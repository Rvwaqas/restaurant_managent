import pytest
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, Base, engine
from app.models import Table, Category, MenuItem, Order, OrderItem
from app.seed.initial_data import run_seed

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Pre-clean any leftover test artifacts
    salads_cats = db.query(Category.id).filter(Category.name.like("Salads%")).all()
    salad_cat_ids = [c[0] for c in salads_cats]
    if salad_cat_ids:
        db.query(MenuItem).filter(MenuItem.category_id.in_(salad_cat_ids)).delete(synchronize_session=False)
    db.query(Category).filter(Category.name.like("Salads%")).delete(synchronize_session=False)
    db.query(MenuItem).filter(MenuItem.name.like("Test%")).delete(synchronize_session=False)
    db.query(MenuItem).filter(MenuItem.name.like("Image%")).delete(synchronize_session=False)
    db.query(Table).filter(Table.number >= 50).delete(synchronize_session=False)
    db.commit()
    run_seed(db, "backend/seed_data/floor-2-menu.csv")
    db.close()
    yield
    db = SessionLocal()
    db.query(OrderItem).filter(OrderItem.order_id.like("test-ord%")).delete(synchronize_session=False)
    db.query(Order).filter(Order.id.like("test-ord%")).delete(synchronize_session=False)
    salads_cats = db.query(Category.id).filter(Category.name.like("Salads%")).all()
    salad_cat_ids = [c[0] for c in salads_cats]
    if salad_cat_ids:
        db.query(MenuItem).filter(MenuItem.category_id.in_(salad_cat_ids)).delete(synchronize_session=False)
    db.query(Category).filter(Category.name.like("Salads%")).delete(synchronize_session=False)
    db.query(MenuItem).filter(MenuItem.name.like("Test%")).delete(synchronize_session=False)
    db.query(MenuItem).filter(MenuItem.name.like("Image%")).delete(synchronize_session=False)
    db.query(Table).filter(Table.number >= 50).delete(synchronize_session=False)
    db.commit()
    db.close()

@pytest.fixture(scope="module")
def admin_headers():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module")
def waiter2_headers():
    # waiter2 allowed floor-1 only
    res = client.post("/api/auth/login", json={"username": "waiter2", "password": "1234"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module")
def waiter3_headers():
    # waiter3 allowed floor-2 only
    res = client.post("/api/auth/login", json={"username": "waiter3", "password": "1234"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}


# ─── 1. CONTRACT & INITIAL SEED PARITY ───

def test_floors_list_and_by_slug(admin_headers, waiter3_headers):
    # Admin gets both floors
    res = client.get("/api/floors", headers=admin_headers)
    assert res.status_code == 200
    floors = res.json()
    assert len(floors) == 2
    assert {f["id"] for f in floors} == {"f1", "f2"}

    # Waiter3 gets only floor-1
    res_w = client.get("/api/floors", headers=waiter3_headers)
    assert res_w.status_code == 200
    assert len(res_w.json()) == 1
    assert res_w.json()[0]["slug"] == "floor-1"

    # Floor by slug
    res_slug = client.get("/api/floors/floor-1", headers=admin_headers)
    assert res_slug.status_code == 200
    assert res_slug.json()["menuType"] == "halal"

    # Waiter3 accessing floor-2 gets 403
    res_forbidden = client.get("/api/floors/floor-2", headers=waiter3_headers)
    assert res_forbidden.status_code == 403


def test_seed_counts_parity(admin_headers):
    # 10 tables per floor
    t_f1 = client.get("/api/tables?floorId=f1", headers=admin_headers).json()
    t_f2 = client.get("/api/tables?floorId=f2", headers=admin_headers).json()
    assert len(t_f1) == 10
    assert len(t_f2) == 10

    # 6 categories total (3 per floor)
    cats = client.get("/api/categories", headers=admin_headers).json()
    assert len(cats) == 6

    # 4 printers
    prns = client.get("/api/printers", headers=admin_headers).json()
    assert len(prns) == 4

    # 8 items on floor 1
    m_f1 = client.get("/api/menu-items?floorId=f1", headers=admin_headers).json()
    assert len(m_f1) == 8

    # 81 items on floor 2 (admin includeInactive=true sees all 81)
    m_f2_all = client.get("/api/menu-items?floorId=f2&includeInactive=true", headers=admin_headers).json()
    assert len(m_f2_all) == 81

    # Menu bundle: floor 2 has 80 active items and 3 categories
    bundle_f2 = client.get("/api/menu?floorId=f2", headers=admin_headers).json()
    assert len(bundle_f2["categories"]) == 3
    assert len(bundle_f2["items"]) == 80


# ─── 2. AUTHORIZATION MATRIX ───

def test_auth_guards(waiter3_headers):
    # 401 unauthenticated
    assert client.get("/api/floors").status_code == 401
    assert client.post("/api/tables", json={"floorId": "f1", "number": 99}).status_code == 401

    # Waiter attempting mutations receives 403
    assert client.post("/api/tables", json={"floorId": "f1", "number": 99}, headers=waiter3_headers).status_code == 403
    assert client.delete("/api/tables/f1-t1", headers=waiter3_headers).status_code == 403
    assert client.post("/api/categories", json={"floorId": "f1", "name": "Desserts", "printerId": "p1"}, headers=waiter3_headers).status_code == 403
    assert client.post("/api/menu-items", json={"floorId": "f1", "categoryId": "c1", "name": "Cake", "price": 10}, headers=waiter3_headers).status_code == 403
    assert client.get("/api/printers", headers=waiter3_headers).status_code == 403

    # Waiter3 accessing floor 2 resources receives 403
    assert client.get("/api/tables?floorId=f2", headers=waiter3_headers).status_code == 403
    assert client.get("/api/menu?floorId=f2", headers=waiter3_headers).status_code == 403


# ─── 3. TABLES CRUD & BUSINESS RULES ───

def test_table_validation_and_creation(admin_headers):
    # Table number must be 1-999
    res_bad_num = client.post("/api/tables", json={"floorId": "f1", "number": 1500}, headers=admin_headers)
    assert res_bad_num.status_code == 422

    # Capacity must be 1-20
    res_bad_cap = client.post("/api/tables", json={"floorId": "f1", "number": 50, "capacity": 25}, headers=admin_headers)
    assert res_bad_cap.status_code == 422

    # Duplicate table on floor -> 409
    res_dup = client.post("/api/tables", json={"floorId": "f1", "number": 1}, headers=admin_headers)
    assert res_dup.status_code == 409
    assert "already exists on this floor" in res_dup.json()["message"]

    # Valid creation
    res_ok = client.post("/api/tables", json={"floorId": "f1", "number": 50, "capacity": 6}, headers=admin_headers)
    assert res_ok.status_code == 201
    table_data = res_ok.json()
    assert table_data["number"] == 50
    assert table_data["capacity"] == 6
    assert table_data["status"] == "free"
    # Free table omits runningTotal and openedAt
    assert "runningTotal" not in table_data or table_data["runningTotal"] is None

    # Update table
    res_up = client.put(f"/api/tables/{table_data['id']}", json={"capacity": 8}, headers=admin_headers)
    assert res_up.status_code == 200
    assert res_up.json()["capacity"] == 8

    # Delete clean table -> Hard delete
    res_del = client.delete(f"/api/tables/{table_data['id']}", headers=admin_headers)
    assert res_del.status_code == 200
    assert res_del.json()["softDeleted"] is False


def test_bulk_create_tables(admin_headers):
    # Bulk create tables 60 to 65 on floor 1
    payload = {"floorId": "f1", "from": 60, "to": 63, "capacity": 4}
    res = client.post("/api/tables/bulk", json=payload, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["created"]) == 4
    assert len(data["skippedNumbers"]) == 0

    # Bulk create again: range 62 to 65 -> 62 and 63 should be skipped, 64 and 65 created
    res2 = client.post("/api/tables/bulk", json={"floorId": "f1", "from": 62, "to": 65, "capacity": 4}, headers=admin_headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["created"]) == 2
    assert sorted(data2["skippedNumbers"]) == [62, 63]

    # Clean up created tables
    for t in data["created"] + data2["created"]:
        client.delete(f"/api/tables/{t['id']}", headers=admin_headers)


def test_occupied_table_open_order_join_and_delete_rule(admin_headers):
    import uuid
    # Create test table
    t_num = 77
    t_res = client.post("/api/tables", json={"floorId": "f1", "number": t_num}, headers=admin_headers)
    assert t_res.status_code == 201
    t_id = t_res.json()["id"]

    ord_id = f"test-ord-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    # Insert an open order for this table
    order = Order(
        id=ord_id,
        table_id=t_id,
        floor_id="f1",
        waiter_id="u1",
        status="open",
        subtotal=100.0,
        tax=5.0,
        total=105.0,
    )
    db.add(order)
    # Mark table occupied
    tbl = db.query(Table).filter(Table.id == t_id).first()
    tbl.status = "occupied"
    tbl.current_order_id = order.id
    db.commit()
    db.close()

    try:
        # Query table: must join open order details
        get_res = client.get(f"/api/tables/{t_id}", headers=admin_headers)
        assert get_res.status_code == 200
        tbl_data = get_res.json()
        assert tbl_data["status"] == "occupied"
        assert tbl_data["currentOrderId"] == ord_id
        assert tbl_data["runningTotal"] == 105.0
        assert "openedAt" in tbl_data

        # Attempt delete while occupied -> 409
        del_res = client.delete(f"/api/tables/{t_id}", headers=admin_headers)
        assert del_res.status_code == 409
        assert "Cannot delete table while it is currently occupied" in del_res.json()["message"]

        # Close order (mark paid) and free table
        db = SessionLocal()
        order = db.query(Order).filter(Order.id == ord_id).first()
        order.status = "paid"
        tbl = db.query(Table).filter(Table.id == t_id).first()
        tbl.status = "free"
        db.commit()
        db.close()

        # Now delete table: has order history -> SOFT delete
        del_soft = client.delete(f"/api/tables/{t_id}", headers=admin_headers)
        assert del_soft.status_code == 200
        assert del_soft.json()["softDeleted"] is True

        # Soft deleted table is not returned in tables list
        all_f1 = client.get("/api/tables?floorId=f1", headers=admin_headers).json()
        assert not any(t["id"] == t_id for t in all_f1)

        # Number 77 can be REUSED by a new table after soft delete
        res_reuse = client.post("/api/tables", json={"floorId": "f1", "number": t_num}, headers=admin_headers)
        assert res_reuse.status_code == 201
        new_t_id = res_reuse.json()["id"]
        client.delete(f"/api/tables/{new_t_id}", headers=admin_headers)
    finally:
        db = SessionLocal()
        db.query(Order).filter(Order.id == ord_id).delete()
        db.query(Table).filter(Table.number == t_num).delete()
        db.commit()
        db.close()


def test_table_concurrent_creation_race_safe(admin_headers):
    # Two simultaneous threads creating table number 88 on floor 1
    def try_create():
        c = TestClient(app)
        return c.post("/api/tables", json={"floorId": "f1", "number": 88}, headers=admin_headers)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(try_create)
        f2 = executor.submit(try_create)
        r1 = f1.result()
        r2 = f2.result()

    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [201, 409]

    # Clean up created table
    client.delete("/api/tables/f1-t88", headers=admin_headers)


# ─── 4. CATEGORIES CRUD & BUSINESS RULES ───

def test_category_validation_reorder_and_delete(admin_headers):
    # Missing/invalid printer -> 422
    res_bad_prn = client.post("/api/categories", json={"floorId": "f1", "name": "Salads", "printerId": "nonexistent"}, headers=admin_headers)
    assert res_bad_prn.status_code == 422

    # Printer is cashier role -> 422 (must be kitchen printer)
    res_cashier_prn = client.post("/api/categories", json={"floorId": "f1", "name": "Salads", "printerId": "prn-cashier"}, headers=admin_headers)
    assert res_cashier_prn.status_code == 422

    # Create category
    res_cat = client.post("/api/categories", json={"floorId": "f1", "name": "Salads & Soups", "printerId": "p1"}, headers=admin_headers)
    assert res_cat.status_code == 201
    cat_id = res_cat.json()["id"]

    # Duplicate name on same floor (case-insensitive) -> 409
    res_dup = client.post("/api/categories", json={"floorId": "f1", "name": "salads & soups", "printerId": "p1"}, headers=admin_headers)
    assert res_dup.status_code == 409

    # Add an item to this category
    item_res = client.post("/api/menu-items", json={
        "floorId": "f1",
        "categoryId": cat_id,
        "name": "Greek Salad",
        "price": 25.0,
    }, headers=admin_headers)
    assert item_res.status_code == 201
    item_id = item_res.json()["id"]

    # Attempt delete category while it has items -> 409
    del_cat_fail = client.delete(f"/api/categories/{cat_id}", headers=admin_headers)
    assert del_cat_fail.status_code == 409
    assert "active item(s) belong to it" in del_cat_fail.json()["message"]

    # Delete item first
    client.delete(f"/api/menu-items/{item_id}", headers=admin_headers)

    # Now delete clean category -> Hard delete
    del_cat_ok = client.delete(f"/api/categories/{cat_id}", headers=admin_headers)
    assert del_cat_ok.status_code == 200
    assert del_cat_ok.json()["softDeleted"] is False


def test_category_reorder(admin_headers):
    # Fetch floor 1 categories
    f1_cats = client.get("/api/categories?floorId=f1", headers=admin_headers).json()
    cat_ids = [c["id"] for c in f1_cats]
    reversed_ids = list(reversed(cat_ids))

    # Incomplete list -> 422
    bad_reorder = client.post("/api/categories/reorder", json={"floorId": "f1", "orderedIds": cat_ids[:1]}, headers=admin_headers)
    assert bad_reorder.status_code == 422

    # Reorder with valid reversed list
    res = client.post("/api/categories/reorder", json={"floorId": "f1", "orderedIds": reversed_ids}, headers=admin_headers)
    assert res.status_code == 200
    new_ordered = [c["id"] for c in res.json()]
    assert new_ordered == reversed_ids

    # Restore original order
    client.post("/api/categories/reorder", json={"floorId": "f1", "orderedIds": cat_ids}, headers=admin_headers)


# ─── 5. MENU ITEMS CRUD & BUSINESS RULES ───

def test_menu_item_validation_duplicate_and_availability(admin_headers):
    # Category belongs to floor 2, item floorId is floor 1 -> 422 cross-floor mismatch
    res_mismatch = client.post("/api/menu-items", json={
        "floorId": "f1",
        "categoryId": "c4",  # c4 is on floor 2
        "name": "Invalid Dish",
        "price": 10.0,
    }, headers=admin_headers)
    assert res_mismatch.status_code == 422

    # Price <= 0 -> 422
    res_bad_price = client.post("/api/menu-items", json={
        "floorId": "f1",
        "categoryId": "c1",
        "name": "Zero Price Dish",
        "price": 0.0,
    }, headers=admin_headers)
    assert res_bad_price.status_code == 422

    # Create valid dish
    res_item = client.post("/api/menu-items", json={
        "floorId": "f1",
        "categoryId": "c1",
        "name": "Test Halal Sweet",
        "price": 15.50,
        "description": "Delicious sweet treat",
    }, headers=admin_headers)
    assert res_item.status_code == 201
    item = res_item.json()
    assert item["price"] == 15.5
    assert item["available"] is True

    # Toggle availability
    res_avail = client.patch(f"/api/menu-items/{item['id']}/availability", json={"available": False}, headers=admin_headers)
    assert res_avail.status_code == 200
    assert res_avail.json()["available"] is False

    # Duplicate to Floor 2 under category c4 (Breakfast)
    res_dup = client.post(f"/api/menu-items/{item['id']}/duplicate", json={
        "targetFloorId": "f2",
        "targetCategoryId": "c4",
    }, headers=admin_headers)
    assert res_dup.status_code == 201
    cloned = res_dup.json()
    assert cloned["floorId"] == "f2"
    assert cloned["categoryId"] == "c4"
    assert cloned["name"] == item["name"]

    # Duplicate with non-matching target category on target floor -> 400
    res_dup_bad = client.post(f"/api/menu-items/{item['id']}/duplicate", json={
        "targetFloorId": "f2",
        "targetCategoryId": "c1",  # c1 is floor 1, not floor 2
    }, headers=admin_headers)
    assert res_dup_bad.status_code in (400, 422)

    # Clean up both items
    client.delete(f"/api/menu-items/{item['id']}", headers=admin_headers)
    client.delete(f"/api/menu-items/{cloned['id']}", headers=admin_headers)


# ─── 6. PRINTERS CRUD & BUSINESS RULES ───

def test_printers_crud_and_delete_rule(admin_headers):
    # Invalid IPv4 -> 422
    res_bad_ip = client.post("/api/printers", json={"name": "Bad IP Printer", "ip": "999.999.999.999"}, headers=admin_headers)
    assert res_bad_ip.status_code == 422

    # Duplicate printer name -> 409
    res_dup_name = client.post("/api/printers", json={"name": "sweet printer", "ip": "192.168.1.200"}, headers=admin_headers)
    assert res_dup_name.status_code == 409

    # Duplicate address (ip, port) -> 409
    res_dup_addr = client.post("/api/printers", json={"name": "New Printer", "ip": "192.168.1.100", "port": 9100}, headers=admin_headers)
    assert res_dup_addr.status_code == 409

    # Attempt to delete printer p1 which is used by category c1 -> 409
    res_del_used = client.delete("/api/printers/p1", headers=admin_headers)
    assert res_del_used.status_code == 409
    assert "Sweet" in res_del_used.json()["message"]

    # Create clean standalone printer and delete it
    res_new_prn = client.post("/api/printers", json={
        "name": "Buffet Printer",
        "ip": "192.168.1.199",
        "port": 9100,
        "role": "kitchen",
    }, headers=admin_headers)
    assert res_new_prn.status_code == 201
    prn_id = res_new_prn.json()["id"]

    res_del_ok = client.delete(f"/api/printers/{prn_id}", headers=admin_headers)
    assert res_del_ok.status_code == 200
    assert res_del_ok.json()["success"] is True

