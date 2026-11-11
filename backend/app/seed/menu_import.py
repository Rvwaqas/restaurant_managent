import csv
import os
import re
from typing import Any, Dict, List, Optional

from app.models import Category, Floor, MenuItem, Printer
from sqlalchemy.orm import Session


def slugify(text: str) -> str:
    """Converts a dish name into a lowercase ascii alphanumeric-hyphen slug."""
    text = text.strip().lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text.strip("-")

class MenuImporter:
    def __init__(
        self,
        db: Session,
        floor_id: str,
        csv_file_path: str,
        printer_map: Optional[Dict[str, str]] = None,
        dry_run: bool = False,
        replace: bool = False,
    ):
        self.db = db
        self.floor_id = floor_id
        self.csv_file_path = csv_file_path
        self.printer_map = printer_map or {}
        self.dry_run = dry_run
        self.replace = replace

        # Report tracking
        self.rows_read = 0
        self.items_created = 0
        self.items_updated = 0
        self.items_skipped = 0
        self.items_soft_deleted = 0
        self.items_per_category: Dict[str, int] = {}
        self.inactive_items: List[str] = []
        self.internal_notes_found: List[Dict[str, Any]] = []
        self.items_with_alt_price: List[Dict[str, Any]] = []
        self.duplicate_names_found: List[str] = []
        self.errors: List[str] = []

    def run(self) -> Dict[str, Any]:
        if not os.path.exists(self.csv_file_path):
            raise FileNotFoundError(f"CSV file not found: {self.csv_file_path}")

        # Check floor exists
        floor = self.db.query(Floor).filter(Floor.id == self.floor_id).first()
        if not floor:
            raise ValueError(f"Floor with ID '{self.floor_id}' not found in database.")

        # Default fallback kitchen printer
        default_printer = (
            self.db.query(Printer).filter(Printer.role == "kitchen", Printer.is_active == True).first()
        )
        default_printer_id = default_printer.id if default_printer else "p1"

        # Read CSV file (supports UTF-8 with BOM and CRLF)
        with open(self.csv_file_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            raw_rows = list(reader)

        self.rows_read = len(raw_rows)

        # Existing categories map: name -> Category object
        existing_categories = {
            c.name.strip().lower(): c
            for c in self.db.query(Category).filter(Category.floor_id == self.floor_id).all()
        }

        # Existing items map: (category_id, name.lower()) -> MenuItem
        existing_items = {
            (item.category_id, item.name.strip().lower()): item
            for item in self.db.query(MenuItem).filter(MenuItem.floor_id == self.floor_id).all()
        }

        seen_floor_category_names = set()
        imported_item_ids = set()
        category_sort_counters: Dict[str, int] = {}

        # Pre-process rows in single pass
        for idx, row in enumerate(raw_rows, start=1):
            category_name = row.get("Category", "").strip()
            name = row.get("Name", "").strip()
            subcategory = row.get("Subcategory", "").strip() or None
            description = row.get("Description", "").strip() or None
            price_rm_str = row.get("Price_RM", "").strip()
            alt_price_rm_str = row.get("Price_Ais_or_Takeaway_RM", "").strip()
            notes = row.get("Notes", "").strip()

            if not category_name or not name:
                # Skip completely blank lines
                self.items_skipped += 1
                continue

            # Duplicate check within floor + category
            cat_lower = category_name.lower()
            name_lower = name.lower()
            combo_key = (cat_lower, name_lower)

            if combo_key in seen_floor_category_names:
                self.duplicate_names_found.append(f"Row {idx}: Duplicate dish '{name}' in category '{category_name}'")
                self.items_skipped += 1
                continue
            seen_floor_category_names.add(combo_key)

            # Internal notes check
            if "Verify spelling" in notes:
                self.internal_notes_found.append({
                    "row": idx,
                    "name": name,
                    "category": category_name,
                    "note": notes,
                })
                # Strip internal note so it never enters customer description
                notes_for_description = notes.replace("Verify spelling", "").strip()
            else:
                notes_for_description = notes

            # Description formatting: append public customer notes in parentheses
            final_description = description
            if notes_for_description and notes_for_description != "Price not listed":
                if final_description:
                    final_description = f"{final_description} ({notes_for_description})"
                else:
                    final_description = f"({notes_for_description})"

            # Price parsing
            is_inactive = False
            available = True
            price = 0.0

            if "Price not listed" in notes or not price_rm_str:
                price = 0.0
                is_inactive = True
                available = False
                self.inactive_items.append(f"{name} ({category_name}) - Price not listed")
            else:
                try:
                    price = float(price_rm_str)
                    if price < 0:
                        raise ValueError(f"Negative price at row {idx}")
                except ValueError as ve:
                    raise ValueError(f"Invalid price '{price_rm_str}' at row {idx} for dish '{name}': {ve}")

            # Alt price parsing (Price_Ais_or_Takeaway_RM)
            alt_price: Optional[float] = None
            if alt_price_rm_str:
                try:
                    alt_price = float(alt_price_rm_str)
                    self.items_with_alt_price.append({
                        "name": name,
                        "category": category_name,
                        "price": price,
                        "alt_price": alt_price,
                    })
                except ValueError:
                    pass

            # Category resolution or creation
            category = existing_categories.get(cat_lower)
            if not category:
                # Determine printer for new category
                printer_id = self.printer_map.get(category_name, default_printer_id)
                new_cat_sort = len(existing_categories) + 1
                cat_id = f"cat-{self.floor_id}-{slugify(category_name)}"
                category = Category(
                    id=cat_id,
                    floor_id=self.floor_id,
                    name=category_name,
                    printer_id=printer_id,
                    sort_order=new_cat_sort,
                    is_active=True,
                )
                if not self.dry_run:
                    self.db.add(category)
                    self.db.flush()
                existing_categories[cat_lower] = category

            # Category row order counter
            cat_id = category.id
            category_sort_counters[cat_id] = category_sort_counters.get(cat_id, 0) + 1
            item_sort_order = category_sort_counters[cat_id]

            self.items_per_category[category_name] = self.items_per_category.get(category_name, 0) + 1

            # Deterministic ID: "mi-" + floorId + "-" + slug(name)
            item_id = f"mi-{self.floor_id}-{slugify(name)}"
            imported_item_ids.add(item_id)

            # Check if item exists
            item_lookup_key = (category.id, name_lower)
            existing_item = existing_items.get(item_lookup_key)

            if existing_item:
                # Update item fields
                existing_item.name = name
                existing_item.price = price
                existing_item.alt_price = alt_price
                existing_item.subcategory = subcategory
                existing_item.description = final_description
                existing_item.available = available
                existing_item.is_active = not is_inactive
                existing_item.sort_order = item_sort_order
                self.items_updated += 1
            else:
                new_item = MenuItem(
                    id=item_id,
                    floor_id=self.floor_id,
                    category_id=category.id,
                    name=name,
                    price=price,
                    alt_price=alt_price,
                    subcategory=subcategory,
                    description=final_description,
                    available=available,
                    is_active=not is_inactive,
                    sort_order=item_sort_order,
                )
                if not self.dry_run:
                    self.db.add(new_item)
                existing_items[item_lookup_key] = new_item
                self.items_created += 1

        # Replace mode: soft-delete items on this floor not present in the CSV file
        if self.replace and not self.dry_run:
            floor_items = self.db.query(MenuItem).filter(MenuItem.floor_id == self.floor_id).all()
            for fi in floor_items:
                if fi.id not in imported_item_ids and fi.is_active:
                    fi.is_active = False
                    self.items_soft_deleted += 1

        if not self.dry_run:
            self.db.commit()

        return {
            "rows_read": self.rows_read,
            "items_created": self.items_created,
            "items_updated": self.items_updated,
            "items_skipped": self.items_skipped,
            "items_soft_deleted": self.items_soft_deleted,
            "items_per_category": self.items_per_category,
            "inactive_items": self.inactive_items,
            "internal_notes_found": self.internal_notes_found,
            "items_with_alt_price": self.items_with_alt_price,
            "duplicate_names_found": self.duplicate_names_found,
        }

