"""Add composite index on runs(user_id, finished_at) for the history endpoint.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The index lets the history query (user_id = ? ORDER BY finished_at DESC LIMIT 5)
    # use an index scan instead of a sequential scan on the full runs table.
    op.create_index(
        "ix_runs_user_finished",
        "runs",
        ["user_id", sa.text("finished_at DESC")],
        postgresql_using="btree",
    )


def downgrade() -> None:
    op.drop_index("ix_runs_user_finished", table_name="runs")
