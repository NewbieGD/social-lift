"""Purchases for VK votes.

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-10
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vk_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("test", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("product", sa.String(64), nullable=False),
        sa.Column("votes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refunded_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("order_id", "test", name="uq_vk_order"),
    )
    op.create_index("ix_vk_orders_user_id", "vk_orders", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_vk_orders_user_id", table_name="vk_orders")
    op.drop_table("vk_orders")
