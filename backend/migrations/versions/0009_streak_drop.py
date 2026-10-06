"""Duel win streaks and the cosmetic drop rolled for a run.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("duel_streak", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("best_duel_streak", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("runs", sa.Column("drop_item", sa.String(40)))


def downgrade() -> None:
    op.drop_column("runs", "drop_item")
    op.drop_column("users", "best_duel_streak")
    op.drop_column("users", "duel_streak")
