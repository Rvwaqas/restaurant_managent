import os
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import PrintJob, MenuItem

client = TestClient(app)

@pytest.fixture(scope="module")
def admin_headers():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    token = res.json()["token"]
    return {"Authorization": f"Bearer {token}"}

# 1x1 valid PNG bytes
VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf"
    b"\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Minimal valid JPEG bytes
VALID_JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\xff\xd9"

# Minimal valid WebP bytes
VALID_WEBP_BYTES = b"RIFF\x14\x00\x00\x00WEBPVP8 \x08\x00\x00\x00\x90\x01\x00\x9d\x01*\x01\x00\x01\x00"

def test_image_upload_formats_and_serving(admin_headers):
    # 1. Valid PNG upload
    file_png = io.BytesIO(VALID_PNG_BYTES)
    res_png = client.post(
        "/api/uploads/image",
        files={"file": ("test.png", file_png, "image/png")},
        headers=admin_headers,
    )
    assert res_png.status_code == 200
    url_png = res_png.json()["url"]
    assert "/api/uploads/" in url_png
    filename_png = url_png.split("/api/uploads/")[1]

    # Verify public GET returns 200 with cache header
    get_res = client.get(f"/api/uploads/{filename_png}")
    assert get_res.status_code == 200
    assert "public" in get_res.headers.get("Cache-Control", "")
    assert get_res.headers.get("Content-Type") == "image/png"

    # 2. Valid WebP upload
    file_webp = io.BytesIO(VALID_WEBP_BYTES)
    res_webp = client.post(
        "/api/uploads/image",
        files={"file": ("test.webp", file_webp, "image/webp")},
        headers=admin_headers,
    )
    assert res_webp.status_code == 200
    assert "/api/uploads/" in res_webp.json()["url"]

    # 3. Invalid magic bytes with fake image content-type -> 422
    fake_file = io.BytesIO(b"<html>not an image</html>")
    res_fake = client.post(
        "/api/uploads/image",
        files={"file": ("fake.png", fake_file, "image/png")},
        headers=admin_headers,
    )
    assert res_fake.status_code == 422
    assert "Invalid image format" in res_fake.json()["message"]

    # 4. Oversize file (>5MB) -> 422
    oversize = io.BytesIO(b"\x89PNG\r\n\x1a\n" + (b"0" * (5 * 1024 * 1024 + 10)))
    res_oversize = client.post(
        "/api/uploads/image",
        files={"file": ("big.png", oversize, "image/png")},
        headers=admin_headers,
    )
    assert res_oversize.status_code == 422
    assert "exceeds maximum allowed limit" in res_oversize.json()["message"]

    # 5. Path traversal attempt on public GET -> 404
    assert client.get("/api/uploads/../../etc/passwd").status_code == 404
    assert client.get("/api/uploads/notvalidfilename.exe").status_code == 404


def test_image_normalization_and_cleanup(admin_headers):
    # Upload image
    file_png = io.BytesIO(VALID_PNG_BYTES)
    up_res = client.post(
        "/api/uploads/image",
        files={"file": ("dish.png", file_png, "image/png")},
        headers=admin_headers,
    )
    expanded_url = up_res.json()["url"]
    filename = expanded_url.split("/api/uploads/")[1]
    disk_path = os.path.join(settings.UPLOAD_DIR, filename)
    assert os.path.exists(disk_path)

    # Create menu item using expanded URL
    item_res = client.post("/api/menu-items", json={
        "floorId": "f1",
        "categoryId": "c1",
        "name": "Image Dish",
        "price": 20.0,
        "image": expanded_url,
    }, headers=admin_headers)
    assert item_res.status_code == 201
    item_id = item_res.json()["id"]

    # Check stored path in DB is relative
    db = SessionLocal()
    db_item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    assert db_item.image == f"/api/uploads/{filename}"
    db.close()

    # Hard delete item -> file on disk must be removed!
    del_res = client.delete(f"/api/menu-items/{item_id}", headers=admin_headers)
    assert del_res.status_code == 200
    assert not os.path.exists(disk_path)


def test_printer_test_print_simulate(admin_headers):
    # Test print on p1 -> status ok
    res = client.post("/api/printers/p1/test", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "Test print slip successfully sent" in data["message"]

    # Verify print_job row created
    db = SessionLocal()
    job = db.query(PrintJob).filter(PrintJob.printer_id == "p1", PrintJob.kind == "test").order_by(PrintJob.created_at.desc()).first()
    assert job is not None
    assert job.status == "ok"
    db.close()

    # Simulate failure using SIMULATE_FAIL_PRINTERS
    settings.SIMULATE_FAIL_PRINTERS = "p1,p2"
    res_fail = client.post("/api/printers/p1/test", headers=admin_headers)
    assert res_fail.status_code == 200
    data_fail = res_fail.json()
    assert data_fail["status"] == "failed"
    assert "Network timeout" in data_fail["message"]

    settings.SIMULATE_FAIL_PRINTERS = ""


def test_printer_test_print_network_timeout(admin_headers):
    import uuid
    # Set PRINT_MODE = network
    old_mode = settings.PRINT_MODE
    test_prn_id = None
    try:
        settings.PRINT_MODE = "network"
        # 192.0.2.1 is reserved for documentation (TEST-NET-1) and unreachable
        res_create = client.post("/api/printers", json={
            "name": f"Unreachable Printer {uuid.uuid4().hex[:6]}",
            "ip": "192.0.2.1",
            "port": 9100,
            "role": "kitchen",
        }, headers=admin_headers)
        assert res_create.status_code == 201
        test_prn = res_create.json()
        test_prn_id = test_prn["id"]

        # Should timeout and fail within ~2 seconds
        res = client.post(f"/api/printers/{test_prn_id}/test", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "failed"
        assert "Network timeout" in data["message"]
    finally:
        settings.PRINT_MODE = old_mode
        if test_prn_id:
            client.delete(f"/api/printers/{test_prn_id}", headers=admin_headers)

