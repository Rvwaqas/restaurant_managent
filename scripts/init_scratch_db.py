"""
Helper script to initialize a new scratch database.
Creates all tables using Base.metadata.create_all and stamps Alembic to head.
"""
import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
backend_dir = os.path.join(root_dir, "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if len(sys.argv) > 1 and sys.argv[1]:
    os.environ["DATABASE_URL"] = sys.argv[1]

from app.core.database import Base, engine
import app.models  # noqa: F401
from app.seed.initial_data import run_seed
from alembic import command
from alembic.config import Config

def init_db():
    print(f"[INIT_DB] Initializing database at {engine.url}...")
    Base.metadata.create_all(bind=engine)

    # Stamp alembic to head so auto-migrate won't fail
    cfg_path = os.path.join(backend_dir, "alembic.ini")
    if os.path.exists(cfg_path):
        alembic_cfg = Config(cfg_path)
        command.stamp(alembic_cfg, "head")
        print("[INIT_DB] Alembic stamped to head.")

    # Run seed
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        run_seed(db)
        print("[INIT_DB] Seed master data initialized.")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()

