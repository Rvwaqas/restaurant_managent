import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.models import Floor, Category, MenuItem, Printer
from app.seed.menu_import import MenuImporter
from app.seed.initial_data import run_seed

TEST_CSV_PATH = "backend/seed_data/floor-2-menu.csv"

@pytest.fixture(scope="module")
def db_session():
    # Use in-memory SQLite for test isolation
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed baseline database
    run_seed(session, TEST_CSV_PATH)
    yield session
    session.close()

def test_floor_2_menu_import_counts(db_session):
    """
    Test requirement:
    - 81 items for floor f2 (Breakfast 25, Lunch & Dinner 28, Drinks 28)
    - 80 active and 1 inactive (YumYum)
    - 15 items with alt_price
    """
    f2_items = db_session.query(MenuItem).filter(MenuItem.floor_id == "f2").all()
    assert len(f2_items) == 81

    # Check categories
    c4 = db_session.query(Category).filter(Category.id == "c4").first()
    c5 = db_session.query(Category).filter(Category.id == "c5").first()
    c6 = db_session.query(Category).filter(Category.id == "c6").first()

    assert c4.name == "Breakfast"
    assert c5.name == "Lunch & Dinner"
    assert c6.name == "Drinks"

    breakfast_items = [i for i in f2_items if i.category_id == "c4"]
    lunch_dinner_items = [i for i in f2_items if i.category_id == "c5"]
    drinks_items = [i for i in f2_items if i.category_id == "c6"]

    assert len(breakfast_items) == 25
    assert len(lunch_dinner_items) == 28
    assert len(drinks_items) == 28

    # Active vs Inactive
    active_items = [i for i in f2_items if i.is_active is True]
    inactive_items = [i for i in f2_items if i.is_active is False]
    assert len(active_items) == 80
    assert len(inactive_items) == 1
    assert inactive_items[0].name == "YumYum"
    assert inactive_items[0].price == 0.0

    # Alt price items count
    items_with_alt_price = [i for i in f2_items if i.alt_price is not None]
    assert len(items_with_alt_price) == 15

def test_internal_notes_never_in_description(db_session):
    """The 'Verify spelling' note must never appear in any description."""
    f2_items = db_session.query(MenuItem).filter(MenuItem.floor_id == "f2").all()
    for item in f2_items:
        if item.description:
            assert "Verify spelling" not in item.description

def test_reimport_twice_changes_nothing(db_session):
    """Importing twice is idempotent and changes nothing."""
    importer = MenuImporter(
        db=db_session,
        floor_id="f2",
        csv_file_path=TEST_CSV_PATH,
        printer_map={"Breakfast": "p2", "Lunch & Dinner": "p2", "Drinks": "p3"},
        dry_run=False,
        replace=True,
    )
    summary = importer.run()
    assert summary["items_created"] == 0
    assert summary["items_updated"] == 81
    assert summary["items_soft_deleted"] == 0

    f2_items = db_session.query(MenuItem).filter(MenuItem.floor_id == "f2").all()
    assert len(f2_items) == 81

def test_floor_1_menu_is_untouched(db_session):
    """Floor 1 halal dishes remain completely intact (8 items per contract & seed)."""
    f1_items = db_session.query(MenuItem).filter(MenuItem.floor_id == "f1").all()
    assert len(f1_items) == 8
    names = [i.name for i in f1_items]
    assert "Chicken Biryani" in names
    assert "Gulab Jamun" in names
    assert "Chicken Karahi" in names

