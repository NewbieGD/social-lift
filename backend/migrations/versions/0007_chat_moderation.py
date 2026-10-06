"""Chat moderation: blocked players, complaints and the automatic mute.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-04
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("chat_muted_until", sa.DateTime(timezone=True)))
    op.create_table(
        "chat_blocks",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blocked_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "chat_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reporter_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(16), nullable=False),
        sa.Column("msg_id", sa.Integer()),
        sa.Column("text", sa.String(200)),
        sa.Column("status", sa.String(12), nullable=False, server_default="new"),
    )
    op.create_index("ix_chat_reports_created_at", "chat_reports", ["created_at"])
    op.create_index("ix_chat_reports_reporter_id", "chat_reports", ["reporter_id"])
    op.create_index("ix_chat_reports_target_id", "chat_reports", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_reports_target_id", "chat_reports")
    op.drop_index("ix_chat_reports_reporter_id", "chat_reports")
    op.drop_index("ix_chat_reports_created_at", "chat_reports")
    op.drop_table("chat_reports")
    op.drop_table("chat_blocks")
    op.drop_column("users", "chat_muted_until")
