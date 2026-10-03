"""Item collection: owned items and pity counters per player, items per run.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("items_mask", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("item_misses", sa.String(64), nullable=False, server_default=""))
    op.add_column("runs", sa.Column("items_start", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("runs", sa.Column("items", sa.Integer()))


def downgrade() -> None:
    op.drop_column("runs", "items")
    op.drop_column("runs", "items_start")
    op.drop_column("users", "item_misses")
    op.drop_column("users", "items_mask")
