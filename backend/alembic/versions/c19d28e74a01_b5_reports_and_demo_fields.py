"""b5_reports_and_demo_fields

Revision ID: c19d28e74a01
Revises: 832c067a3c05
Create Date: 2026-11-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session
import datetime
import zoneinfo

# revision identifiers, used by Alembic.
revision = 'c19d28e74a01'
down_revision = '832c067a3c05'
branch_labels = None
depends_on = None


def compute_fields(dt_str_or_obj):
    if not dt_str_or_obj:
        return None, None, None
    if isinstance(dt_str_or_obj, str):
        try:
            dt = datetime.datetime.fromisoformat(dt_str_or_obj.replace("Z", "+00:00"))
        except Exception:
            try:
                dt = datetime.datetime.strptime(dt_str_or_obj[:19], "%Y-%m-%d %H:%M:%S")
            except Exception:
                return None, None, None
    else:
        dt = dt_str_or_obj

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    
    tz = zoneinfo.ZoneInfo("Asia/Karachi")
    local_dt = dt.astimezone(tz)
    
    # Day starts at 05:00
    if local_dt.hour < 5:
        biz_d = (local_dt - datetime.timedelta(days=1)).date()
    else:
        biz_d = local_dt.date()
        
    return biz_d.strftime("%Y-%m-%d"), local_dt.hour, local_dt.weekday()


def upgrade():
    # 1. Alter orders table
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('business_date', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('paid_local_hour', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('paid_local_weekday', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('is_demo', sa.Boolean(), server_default='0', nullable=False))
        batch_op.create_index('ix_orders_business_date', ['business_date'], unique=False)
        batch_op.create_index('ix_orders_status_business_date', ['status', 'business_date'], unique=False)
        batch_op.create_index('ix_orders_floor_business_date', ['floor_id', 'business_date'], unique=False)
        batch_op.create_index('ix_orders_waiter_business_date', ['waiter_id', 'business_date'], unique=False)
        batch_op.create_index('ix_orders_payment_method_business_date', ['payment_method', 'business_date'], unique=False)

    # 2. Alter order_items table
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('voided_business_date', sa.String(length=10), nullable=True))
        batch_op.create_index('ix_order_items_order_id_voided', ['order_id', 'voided'], unique=False)
        batch_op.create_index('ix_order_items_category_id', ['category_id'], unique=False)
        batch_op.create_index('ix_order_items_voided_business_date', ['voided_business_date'], unique=False)

    # 3. Data backfill
    bind = op.get_bind()
    session = Session(bind=bind)

    orders = session.execute(sa.text("SELECT id, paid_at FROM orders WHERE paid_at IS NOT NULL")).fetchall()
    for row in orders:
        oid, paid_at = row[0], row[1]
        b_date, l_hour, l_wday = compute_fields(paid_at)
        if b_date:
            session.execute(
                sa.text(
                    "UPDATE orders SET business_date = :b_date, paid_local_hour = :l_hour, "
                    "paid_local_weekday = :l_wday, is_demo = 0 WHERE id = :oid"
                ),
                {"b_date": b_date, "l_hour": l_hour, "l_wday": l_wday, "oid": oid}
            )

    order_items = session.execute(sa.text("SELECT id, voided_at FROM order_items WHERE voided = 1")).fetchall()
    for row in order_items:
        oi_id, voided_at = row[0], row[1]
        b_date, _, _ = compute_fields(voided_at)
        if b_date:
            session.execute(
                sa.text("UPDATE order_items SET voided_business_date = :b_date WHERE id = :oi_id"),
                {"b_date": b_date, "oi_id": oi_id}
            )

    session.commit()


def downgrade():
    with op.batch_alter_table('order_items', schema=None) as batch_op:
        batch_op.drop_index('ix_order_items_voided_business_date')
        batch_op.drop_index('ix_order_items_category_id')
        batch_op.drop_index('ix_order_items_order_id_voided')
        batch_op.drop_column('voided_business_date')

    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_index('ix_orders_payment_method_business_date')
        batch_op.drop_index('ix_orders_waiter_business_date')
        batch_op.drop_index('ix_orders_floor_business_date')
        batch_op.drop_index('ix_orders_status_business_date')
        batch_op.drop_index('ix_orders_business_date')
        batch_op.drop_column('is_demo')
        batch_op.drop_column('paid_local_weekday')
        batch_op.drop_column('paid_local_hour')
        batch_op.drop_column('business_date')
