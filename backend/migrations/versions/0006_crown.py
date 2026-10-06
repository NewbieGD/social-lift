"""Crown of the weekly leader: current holder and one-time notices.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crown_state",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("week_id", sa.String(10), nullable=False, server_default=""),
        sa.Column("holder_id", sa.BigInteger()),
        sa.Column("since", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "crown_notices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("other_name", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_crown_notices_user_id", "crown_notices", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_crown_notices_user_id", "crown_notices")
    op.drop_table("crown_notices")
    op.drop_table("crown_state")
