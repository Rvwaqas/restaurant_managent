import os
from app.models import Category, Floor, MenuItem, Printer, Table
from app.seed.menu_import import MenuImporter
from sqlalchemy.orm import Session


def run_seed(db: Session, floor_2_csv_path: str = "backend/seed_data/floor-2-menu.csv") -> None:
    if not os.path.exists(floor_2_csv_path):
        alt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "seed_data", "floor-2-menu.csv")
        if os.path.exists(alt_path):
            floor_2_csv_path = alt_path
    """
    Initializes database seed state:
    - 2 floors: f1 (Ground Floor - Halal), f2 (First Floor - Non-halal)
    - Printers: p1 (Sweet Printer), p2 (Spicy Printer), p3 (Drinks Printer), prn-cashier (Cashier Thermal Printer)
    - Tables: 10 tables per floor (f1-t1..10 with numbers 1..10, f2-t1..10 with numbers 11..20)
    - Floor 1 Categories (c1 Sweet, c2 Spicy, c3 Drinks) and 8 Menu Items
    - Floor 2 Categories: c4 "Breakfast" (p2, sort 1), c5 "Lunch & Dinner" (p2, sort 2), c6 "Drinks" (p3, sort 3)
    - Imports 81 menu items for Floor 2 from CSV using MenuImporter
    """
    # 1. Seed Floors
    f1 = db.query(Floor).filter(Floor.id == "f1").first()
    if not f1:
        f1 = Floor(id="f1", slug="floor-1", name="Floor 1 (Halal)", menu_type="halal", sort_order=1, is_active=True)
        db.add(f1)
    else:
        f1.name = "Floor 1 (Halal)"

    f2 = db.query(Floor).filter(Floor.id == "f2").first()
    if not f2:
        f2 = Floor(id="f2", slug="floor-2", name="Floor 2 (Non-Halal)", menu_type="non-halal", sort_order=2, is_active=True)
        db.add(f2)
    else:
        f2.name = "Floor 2 (Non-Halal)"
    db.flush()

    # 2. Seed Printers
    printers = [
        {"id": "p1", "name": "Sweet Printer", "ip": "192.168.1.100", "port": 9100, "is_active": True, "role": "kitchen"},
        {"id": "p2", "name": "Spicy Printer", "ip": "192.168.1.101", "port": 9100, "is_active": True, "role": "kitchen"},
        {"id": "p3", "name": "Drinks Printer", "ip": "192.168.1.102", "port": 9100, "is_active": True, "role": "kitchen"},
        {"id": "prn-cashier", "name": "Cashier Thermal Printer", "ip": "192.168.1.103", "port": 9100, "is_active": True, "role": "cashier"},
    ]
    for prn_data in printers:
        prn = db.query(Printer).filter(Printer.id == prn_data["id"]).first()
        if not prn:
            db.add(Printer(**prn_data))
        else:
            prn.name = prn_data["name"]
            prn.ip = prn_data["ip"]
            prn.port = prn_data["port"]
            prn.role = prn_data["role"]
            prn.is_active = prn_data["is_active"]
    db.flush()

    # 3. Seed Tables (10 per floor)
    capacities = [2, 4, 4, 6, 2, 4, 8, 4, 6, 2]
    for i in range(10):
        t_id = f"f1-t{i + 1}"
        num = i + 1
        t = db.query(Table).filter(Table.id == t_id).first()
        if not t:
            db.add(Table(id=t_id, floor_id="f1", number=num, capacity=capacities[i], status="free", is_active=True, is_deleted=False))
        else:
            t.number = num
            t.capacity = capacities[i]
            t.is_deleted = False

    for i in range(10):
        t_id = f"f2-t{i + 1}"
        num = 11 + i
        t = db.query(Table).filter(Table.id == t_id).first()
        if not t:
            db.add(Table(id=t_id, floor_id="f2", number=num, capacity=capacities[i], status="free", is_active=True, is_deleted=False))
        else:
            t.number = num
            t.capacity = capacities[i]
            t.is_deleted = False
    db.flush()

    # 4. Seed Floor 1 Categories (c1, c2, c3)
    f1_categories = [
        {"id": "c1", "floor_id": "f1", "name": "Sweet", "printer_id": "p1", "sort_order": 1, "is_active": True, "is_deleted": False},
        {"id": "c2", "floor_id": "f1", "name": "Spicy", "printer_id": "p2", "sort_order": 2, "is_active": True, "is_deleted": False},
        {"id": "c3", "floor_id": "f1", "name": "Drinks", "printer_id": "p3", "sort_order": 3, "is_active": True, "is_deleted": False},
    ]
    for cat_data in f1_categories:
        c = db.query(Category).filter(Category.id == cat_data["id"]).first()
        if not c:
            db.add(Category(**cat_data))
        else:
            c.name = cat_data["name"]
            c.printer_id = cat_data["printer_id"]
            c.sort_order = cat_data["sort_order"]
            c.is_active = True
            c.is_deleted = False
    db.flush()

    # 5. Seed Floor 1 8 Menu Items
    f1_items = [
        {"id": "mi1", "floor_id": "f1", "category_id": "c1", "name": "Gulab Jamun", "price": 250.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 1, "image": "https://images.unsplash.com/photo-1666190064034-98ab5f3a6c8a?w=300&h=200&fit=crop"},
        {"id": "mi2", "floor_id": "f1", "category_id": "c1", "name": "Kheer", "price": 300.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 2, "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=300&h=200&fit=crop"},
        {"id": "mi3", "floor_id": "f1", "category_id": "c1", "name": "Jalebi", "price": 200.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 3},
        {"id": "mi4", "floor_id": "f1", "category_id": "c2", "name": "Chicken Biryani", "price": 650.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 1, "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300&h=200&fit=crop"},
        {"id": "mi5", "floor_id": "f1", "category_id": "c2", "name": "Chicken Karahi", "price": 850.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 2, "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300&h=200&fit=crop"},
        {"id": "mi6", "floor_id": "f1", "category_id": "c2", "name": "Seekh Kebab", "price": 450.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 3},
        {"id": "mi7", "floor_id": "f1", "category_id": "c3", "name": "Lassi", "price": 180.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 1},
        {"id": "mi8", "floor_id": "f1", "category_id": "c3", "name": "Mint Lemonade", "price": 150.0, "available": True, "is_active": True, "is_deleted": False, "sort_order": 2},
    ]
    # Clean up old seed IDs if they existed
    db.query(MenuItem).filter(MenuItem.id.in_(["mi-f1-gulab-jamun", "mi-f1-samosa-chaat", "mi-f1-chicken-biryani", "mi-f1-mutton-karahi", "mi-f1-mango-lassi", "mi-f1-mint-lemonade"])).delete(synchronize_session=False)

    for item_data in f1_items:
        m = db.query(MenuItem).filter(MenuItem.id == item_data["id"]).first()
        if not m:
            db.add(MenuItem(**item_data))
        else:
            for k, v in item_data.items():
                setattr(m, k, v)
    db.flush()

    # 6. Seed Floor 2 Categories as specified in Addendum to B1:
    # c4 "Breakfast" (printer p2, sortOrder 1)
    # c5 "Lunch & Dinner" (printer p2, sortOrder 2)
    # c6 "Drinks" (printer p3, sortOrder 3)
    f2_categories = [
        {"id": "c4", "floor_id": "f2", "name": "Breakfast", "printer_id": "p2", "sort_order": 1, "is_active": True, "is_deleted": False},
        {"id": "c5", "floor_id": "f2", "name": "Lunch & Dinner", "printer_id": "p2", "sort_order": 2, "is_active": True, "is_deleted": False},
        {"id": "c6", "floor_id": "f2", "name": "Drinks", "printer_id": "p3", "sort_order": 3, "is_active": True, "is_deleted": False},
    ]
    for cat_data in f2_categories:
        c = db.query(Category).filter(Category.id == cat_data["id"]).first()
        if not c:
            db.add(Category(**cat_data))
        else:
            c.name = cat_data["name"]
            c.printer_id = cat_data["printer_id"]
            c.sort_order = cat_data["sort_order"]
            c.is_active = True
            c.is_deleted = False
    db.flush()

    db.commit()

    # 7. Import Floor 2 Menu items from CSV
    printer_map = {
        "Breakfast": "p2",
        "Lunch & Dinner": "p2",
        "Drinks": "p3",
    }
    importer = MenuImporter(
        db=db,
        floor_id="f2",
        csv_file_path=floor_2_csv_path,
        printer_map=printer_map,
        dry_run=False,
        replace=True,
    )
    importer.run()
