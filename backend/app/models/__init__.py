import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class Floor(Base):
    __tablename__ = "floors"

    id = Column(String(32), primary_key=True)
    slug = Column(String(32), unique=True, nullable=False, index=True)
    name = Column(String(64), nullable=False)
    menu_type = Column(String(32), nullable=False)  # 'halal' or 'non-halal'
    sort_order = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)

    tables = relationship("Table", back_populates="floor")
    categories = relationship("Category", back_populates="floor")
    menu_items = relationship("MenuItem", back_populates="floor")


class Table(Base):
    __tablename__ = "tables"

    id = Column(String(64), primary_key=True)
    floor_id = Column(String(32), ForeignKey("floors.id"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    capacity = Column(Integer, default=4)
    status = Column(String(16), default="free")  # 'free' or 'occupied'
    current_order_id = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    floor = relationship("Floor", back_populates="tables")

    __table_args__ = (
        Index(
            "uq_tables_floor_number_active",
            "floor_id",
            "number",
            unique=True,
            sqlite_where=text("is_deleted = 0"),
        ),
    )


class Printer(Base):
    __tablename__ = "printers"

    id = Column(String(64), primary_key=True)
    name = Column(String(64), nullable=False)
    ip = Column(String(64), nullable=False)
    port = Column(Integer, default=9100)
    is_active = Column(Boolean, default=True)
    role = Column(String(16), nullable=False)  # 'kitchen' or 'cashier'

    categories = relationship("Category", back_populates="printer")
    print_jobs = relationship("PrintJob", back_populates="printer", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_printers_name", text("lower(name)"), unique=True),
        Index("uq_printers_ip_port", "ip", "port", unique=True),
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(64), primary_key=True)
    floor_id = Column(String(32), ForeignKey("floors.id"), nullable=False, index=True)
    name = Column(String(64), nullable=False)
    printer_id = Column(String(64), ForeignKey("printers.id"), nullable=False)
    sort_order = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)

    # Optional serving time boundaries (Addendum to B1)
    serve_from = Column(String(16), nullable=True)
    serve_to = Column(String(16), nullable=True)

    floor = relationship("Floor", back_populates="categories")
    printer = relationship("Printer", back_populates="categories")
    menu_items = relationship("MenuItem", back_populates="category")

    __table_args__ = (
        Index(
            "uq_categories_floor_name_active",
            "floor_id",
            text("lower(name)"),
            unique=True,
            sqlite_where=text("is_deleted = 0"),
        ),
    )


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(String(128), primary_key=True)
    floor_id = Column(String(32), ForeignKey("floors.id"), nullable=False, index=True)
    category_id = Column(String(64), ForeignKey("categories.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    price = Column(Float, nullable=False)
    alt_price = Column(Float, nullable=True)  # Ice/Takeaway alt price in minor units
    subcategory = Column(String(64), nullable=True)  # Addendum column
    description = Column(Text, nullable=True)
    image = Column(String(256), nullable=True)
    available = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    sort_order = Column(Integer, default=1)

    floor = relationship("Floor", back_populates="menu_items")
    category = relationship("Category", back_populates="menu_items")

    __table_args__ = (
        Index("ix_menu_items_floor_cat_name", "floor_id", "category_id", "name"),
    )


class PrintJob(Base):
    __tablename__ = "print_jobs"

    id = Column(String(64), primary_key=True)
    printer_id = Column(String(64), ForeignKey("printers.id"), nullable=False, index=True)
    kind = Column(String(32), nullable=False)  # 'test', 'kitchen', 'cancel', 'bill'
    status = Column(String(16), nullable=False, default="queued")  # 'queued', 'printed', 'failed'
    message = Column(String(256), nullable=True)
    error = Column(String(256), nullable=True)
    payload = Column(Text, nullable=True)  # JSON snapshot versioned "v": 1
    attempts = Column(Integer, default=0)
    printed_at = Column(DateTime, nullable=True)
    category_id = Column(String(64), nullable=True)
    category_name = Column(String(64), nullable=True)
    printer_name = Column(String(128), nullable=True)
    order_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    printer = relationship("Printer", back_populates="print_jobs")


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(64), primary_key=True)
    table_id = Column(String(64), ForeignKey("tables.id"), nullable=False, index=True)
    floor_id = Column(String(32), ForeignKey("floors.id"), nullable=False, index=True)
    waiter_id = Column(String(64), nullable=False)
    status = Column(String(16), default="open", index=True)  # 'open', 'paid', 'cancelled'

    subtotal = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    service_charge = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    discount_type = Column(String(16), nullable=True)  # 'amount' | 'percent'
    discount_value = Column(Float, nullable=True)
    total = Column(Float, default=0.0)

    bill_no = Column(String(32), nullable=True, index=True)
    payment_method = Column(String(16), nullable=True)  # 'cash', 'card', 'online'
    amount_received = Column(Float, nullable=True)
    change_due = Column(Float, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    paid_at = Column(DateTime, nullable=True, index=True)
    paid_by = Column(String(64), nullable=True)

    # B5 additions for fast reporting & demo isolation
    business_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    paid_local_hour = Column(Integer, nullable=True)   # 0-23
    paid_local_weekday = Column(Integer, nullable=True)# 0=Monday .. 6=Sunday
    is_demo = Column(Boolean, default=False, nullable=False)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_orders_table_open", "table_id", unique=True, sqlite_where=text("status = 'open'")),
        Index("ix_orders_business_date", "business_date"),
        Index("ix_orders_status_business_date", "status", "business_date"),
        Index("ix_orders_floor_business_date", "floor_id", "business_date"),
        Index("ix_orders_waiter_business_date", "waiter_id", "business_date"),
        Index("ix_orders_payment_method_business_date", "payment_method", "business_date"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String(64), primary_key=True)
    order_id = Column(String(64), ForeignKey("orders.id"), nullable=False, index=True)
    menu_item_id = Column(String(128), ForeignKey("menu_items.id"), nullable=False)
    name = Column(String(128), nullable=False)
    price = Column(Float, nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    note = Column(String(256), nullable=True)
    batch_no = Column(Integer, default=1)
    category_id = Column(String(64), nullable=False)
    printer_id = Column(String(64), nullable=True)

    sent_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String(16), default="sent")  # 'sent', 'cancelled'
    voided = Column(Boolean, default=False)
    void_reason = Column(String(256), nullable=True)
    voided_at = Column(DateTime, nullable=True)
    voided_by = Column(String(64), nullable=True)
    cancel_reason = Column(String(256), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    # B5 additions for fast void reporting
    voided_business_date = Column(String(10), nullable=True)  # YYYY-MM-DD

    order = relationship("Order", back_populates="items")

    __table_args__ = (
        Index("ix_order_items_order_id_voided", "order_id", "voided"),
        Index("ix_order_items_category_id", "category_id"),
        Index("ix_order_items_voided_business_date", "voided_business_date"),
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    request_id = Column(String(128), primary_key=True)
    action = Column(String(50), nullable=False, default="order_action")
    order_id = Column(String(64), nullable=True)
    request_hash = Column(String(64), nullable=False, default="")
    response_payload = Column(Text, nullable=False)
    status_code = Column(Integer, default=200)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DailySequence(Base):
    __tablename__ = "daily_sequences"

    business_date = Column(String(10), primary_key=True)  # 'YYYY-MM-DD'
    last_seq = Column(Integer, default=0)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True)
    ts = Column(DateTime, nullable=False, default=datetime.datetime.utcnow, index=True)
    event = Column(String(64), nullable=False)
    user_id = Column(String(64), nullable=True)
    role = Column(String(32), nullable=False, default="system")
    ip = Column(String(64), nullable=True)
    request_id = Column(String(128), nullable=True)
    entity = Column(String(64), nullable=True)
    entity_id = Column(String(128), nullable=True)
    details = Column(Text, nullable=True)  # JSON text, never secrets

    __table_args__ = (
        Index("ix_audit_logs_event_ts", "event", "ts"),
        Index("ix_audit_logs_user_id_ts", "user_id", "ts"),
    )
