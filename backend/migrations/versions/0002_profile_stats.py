"""Profile stats for the wardrobe: last tier, best combo, total captures.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_tier", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("best_combo", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("total_captures", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "total_captures")
    op.drop_column("users", "best_combo")
    op.drop_column("users", "last_tier")
