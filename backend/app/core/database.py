import time
from contextlib import contextmanager
from sqlite3 import OperationalError as SqliteOperationalError

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

# SQLite database engine
connect_args = {"check_same_thread": False}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)

# Enforce SQLite PRAGMAs for concurrency and durability (Phase B1 & B7)
# WAL + synchronous=FULL ensures that acknowledged transactions (such as payments)
# are persisted to physical storage (fsync) and never lost across crashes or power loss.
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute(f"PRAGMA synchronous={settings.SQLITE_SYNCHRONOUS}")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA wal_autocheckpoint=1000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def write_transaction(db: Session, max_retries: int = 1):
    """
    Context manager for write transactions using SQLite BEGIN IMMEDIATE.
    Serializes concurrent writers and retries once on 'database is locked'.
    """
    retries = 0
    while True:
        try:
            if not db.in_transaction():
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")
            yield db
            db.commit()
            break
        except (OperationalError, SqliteOperationalError) as e:
            try:
                db.rollback()
            except Exception:
                pass
            err_msg = str(e).lower()
            if ("locked" in err_msg or "busy" in err_msg) and retries < max_retries:
                retries += 1
                time.sleep(0.1)
                continue
            if "locked" in err_msg or "busy" in err_msg:
                raise HTTPException(
                    status_code=503,
                    detail="Server busy, try again",
                )
            raise
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            raise
