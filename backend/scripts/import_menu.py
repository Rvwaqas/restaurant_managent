#!/usr/bin/env python3
"""
CLI Menu Importer
Usage:
  python scripts/import_menu.py --floor f2 --file seed_data/floor-2-menu.csv [--dry-run] [--replace]
"""
import sys
import os
import argparse
import json

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal, Base, engine
from app.seed.menu_import import MenuImporter

def main():
    parser = argparse.ArgumentParser(description="Import restaurant menu from CSV file")
    parser.add_argument("--floor", required=True, help="Target floor ID (e.g. f1, f2)")
    parser.add_argument("--file", required=True, help="Path to menu CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without writing to DB")
    parser.add_argument("--replace", action="store_true", help="Soft-delete items on floor not in CSV")
    parser.add_argument("--report", default="docs/backend/FLOOR2_IMPORT_REPORT.md", help="Markdown report output path")
    args = parser.parse_args()

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        importer = MenuImporter(
            db=db,
            floor_id=args.floor,
            csv_file_path=args.file,
            printer_map={"Breakfast": "p2", "Lunch & Dinner": "p2", "Drinks": "p3"},
            dry_run=args.dry_run,
            replace=args.replace,
        )

        mode_str = "DRY-RUN (Simulating)" if args.dry_run else "EXECUTE (Writing to DB)"
        print(f"==================================================")
        print(f"Starting Menu Import [{mode_str}]")
        print(f"Floor: {args.floor} | Source: {args.file}")
        print(f"==================================================")

        summary = importer.run()

        print(f"\nImport Completed Successfully:")
        print(f"- Total rows read: {summary['rows_read']}")
        print(f"- Items created: {summary['items_created']}")
        print(f"- Items updated: {summary['items_updated']}")
        print(f"- Items skipped: {summary['items_skipped']}")
        print(f"- Items soft-deleted: {summary['items_soft_deleted']}")
        print(f"\nItems per Category:")
        for cat, cnt in summary["items_per_category"].items():
            print(f"  * {cat}: {cnt}")
        print(f"\nInactive items count: {len(summary['inactive_items'])}")
        for inact in summary["inactive_items"]:
            print(f"  * {inact}")
        print(f"\nInternal notes detected (stripped from description): {len(summary['internal_notes_found'])}")
        for note in summary["internal_notes_found"]:
            print(f"  * Row {note['row']} - {note['name']}: {note['note']}")
        print(f"\nItems with Alt Price: {len(summary['items_with_alt_price'])}")

        # Write markdown report if not dry-run or if requested
        report_path = args.report
        # If relative, resolve to project root
        if not os.path.isabs(report_path):
            project_root = os.path.abspath(os.path.join(backend_dir, ".."))
            report_full_path = os.path.join(project_root, report_path)
        else:
            report_full_path = report_path

        os.makedirs(os.path.dirname(report_full_path), exist_ok=True)
        with open(report_full_path, "w", encoding="utf-8") as rf:
            rf.write(f"# Floor 2 Menu Import Report\n\n")
            rf.write(f"- **Floor ID**: `{args.floor}`\n")
            rf.write(f"- **Source File**: `{args.file}`\n")
            rf.write(f"- **Mode**: `{'Dry-Run' if args.dry_run else 'Production Write'}`\n")
            rf.write(f"- **Total Rows Read**: {summary['rows_read']}\n")
            rf.write(f"- **Items Created**: {summary['items_created']}\n")
            rf.write(f"- **Items Updated**: {summary['items_updated']}\n")
            rf.write(f"- **Items Skipped**: {summary['items_skipped']}\n")
            rf.write(f"- **Items Soft-Deleted**: {summary['items_soft_deleted']}\n\n")

            rf.write(f"## Items per Category\n\n")
            rf.write(f"| Category | Item Count |\n| :--- | :--- |\n")
            for cat, count in sorted(summary['items_per_category'].items()):
                rf.write(f"| {cat} | {count} |\n")

            rf.write(f"\n## Inactive Items (Price 0 / Not Listed)\n\n")
            if summary['inactive_items']:
                for item in summary['inactive_items']:
                    rf.write(f"- {item}\n")
            else:
                rf.write(f"_None_\n")

            rf.write(f"\n## Internal Notes Found (Excluded from Public Menu)\n\n")
            if summary['internal_notes_found']:
                for n in summary['internal_notes_found']:
                    rf.write(f"- **Row {n['row']}** (`{n['name']}`): {n['note']}\n")
            else:
                rf.write(f"_None_\n")

            rf.write(f"\n## Items with Alt Price (Takeaway / Ais)\n\n")
            rf.write(f"| Dish Name | Category | Regular Price (RM) | Alt Price (RM) |\n| :--- | :--- | :--- | :--- |\n")
            for ap in summary['items_with_alt_price']:
                rf.write(f"| {ap['name']} | {ap['category']} | {ap['price']:.2f} | {ap['alt_price']:.2f} |\n")

        print(f"\n[OK] Markdown report written to: {report_full_path}")

    finally:
        db.close()

if __name__ == "__main__":
    main()

