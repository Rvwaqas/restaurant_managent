"""b7_audit_logs

Revision ID: d28b17f8b901
Revises: c19d28e74a01
Create Date: 2026-11-07 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd28b17f8b901'
down_revision = 'c19d28e74a01'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('ts', sa.DateTime(), nullable=False),
        sa.Column('event', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=64), nullable=True),
        sa.Column('role', sa.String(length=32), nullable=False, server_default='system'),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('request_id', sa.String(length=128), nullable=True),
        sa.Column('entity', sa.String(length=64), nullable=True),
        sa.Column('entity_id', sa.String(length=128), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
    )
    op.create_index('ix_audit_logs_ts', 'audit_logs', ['ts'], unique=False)
    op.create_index('ix_audit_logs_event_ts', 'audit_logs', ['event', 'ts'], unique=False)
    op.create_index('ix_audit_logs_user_id_ts', 'audit_logs', ['user_id', 'ts'], unique=False)


def downgrade():
    op.drop_index('ix_audit_logs_user_id_ts', table_name='audit_logs')
    op.drop_index('ix_audit_logs_event_ts', table_name='audit_logs')
    op.drop_index('ix_audit_logs_ts', table_name='audit_logs')
    op.drop_table('audit_logs')

