"""The ring of a mayor candidate is rolled when a run starts.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-15
"""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "ring_roll" not in {c["name"] for c in insp.get_columns("runs")}:
        op.add_column("runs", sa.Column("ring_roll", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("runs", "ring_roll")
