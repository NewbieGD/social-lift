"""Duels: wins per player and the duel a run belongs to.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-03
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("duel_wins", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("duel_wins_at", sa.DateTime(timezone=True)))
    op.add_column("runs", sa.Column("duel_id", sa.String(36)))
    op.create_index("ix_runs_duel_id", "runs", ["duel_id"])


def downgrade() -> None:
    op.drop_index("ix_runs_duel_id", "runs")
    op.drop_column("runs", "duel_id")
    op.drop_column("users", "duel_wins_at")
    op.drop_column("users", "duel_wins")
