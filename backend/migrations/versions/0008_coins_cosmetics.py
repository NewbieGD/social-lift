"""Coins, the coin journal, owned cosmetics and the worn loadout.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.add_column("users", sa.Column("coins", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("loadout", json_type, nullable=False, server_default="{}"))
    op.create_table(
        "coin_tx",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(8), nullable=False),
        sa.Column("ref", sa.String(40), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "reason", "ref", name="uq_coin_tx_once"),
    )
    op.create_index("ix_coin_tx_user_id", "coin_tx", ["user_id"])
    op.create_table(
        "owned_cosmetics",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("item_id", sa.String(40), primary_key=True),
        sa.Column("source", sa.String(8), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("owned_cosmetics")
    op.drop_index("ix_coin_tx_user_id", table_name="coin_tx")
    op.drop_table("coin_tx")
    op.drop_column("users", "loadout")
    op.drop_column("users", "coins")
