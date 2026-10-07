"""Privacy switch: hide the link to the player's VK page.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("hide_vk_link", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "hide_vk_link")
