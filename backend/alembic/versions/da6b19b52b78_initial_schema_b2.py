"""initial_schema_b2

Revision ID: da6b19b52b78
Revises: 
Create Date: 2026-11-05 15:56:16.847276

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da6b19b52b78'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('print_jobs',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('printer_id', sa.String(length=64), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('message', sa.String(length=256), nullable=True),
        sa.Column('error', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['printer_id'], ['printers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('print_jobs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_print_jobs_printer_id'), ['printer_id'], unique=False)

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('0')))
        batch_op.create_index(batch_op.f('ix_categories_is_deleted'), ['is_deleted'], unique=False)

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('0')))
        batch_op.create_index(batch_op.f('ix_menu_items_is_deleted'), ['is_deleted'], unique=False)

    with op.batch_alter_table('printers', schema=None) as batch_op:
        batch_op.create_index('uq_printers_ip_port', ['ip', 'port'], unique=True)

    with op.batch_alter_table('tables', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('0')))
        try:
            batch_op.drop_index('ix_tables_floor_number')
        except Exception:
            pass
        batch_op.create_index(batch_op.f('ix_tables_is_deleted'), ['is_deleted'], unique=False)
        batch_op.create_index('uq_tables_floor_number_active', ['floor_id', 'number'], unique=True, sqlite_where=sa.text('is_deleted = 0'))

    # Custom expression-based SQLite partial unique indexes
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_floor_name_active ON categories (floor_id, lower(name)) WHERE is_deleted = 0")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_name ON printers (lower(name))")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS uq_printers_name")
    op.execute("DROP INDEX IF EXISTS uq_categories_floor_name_active")

    with op.batch_alter_table('tables', schema=None) as batch_op:
        batch_op.drop_index('uq_tables_floor_number_active', sqlite_where=sa.text('is_deleted = 0'))
        batch_op.drop_index(batch_op.f('ix_tables_is_deleted'))
        batch_op.create_index('ix_tables_floor_number', ['floor_id', 'number'], unique=False)
        batch_op.drop_column('is_deleted')

    with op.batch_alter_table('printers', schema=None) as batch_op:
        batch_op.drop_index('uq_printers_ip_port')

    with op.batch_alter_table('menu_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_menu_items_is_deleted'))
        batch_op.drop_column('is_deleted')

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_categories_is_deleted'))
        batch_op.drop_column('is_deleted')

    with op.batch_alter_table('print_jobs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_print_jobs_printer_id'))

    op.drop_table('print_jobs')
