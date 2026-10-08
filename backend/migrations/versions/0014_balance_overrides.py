"""Balance numbers that the owner can change without a deploy.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "balance_overrides",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("balance_overrides")
