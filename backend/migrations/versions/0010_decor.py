"""Main-screen decoration chosen by the player.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-08
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.add_column("users", sa.Column("decor", json_type, nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("users", "decor")
