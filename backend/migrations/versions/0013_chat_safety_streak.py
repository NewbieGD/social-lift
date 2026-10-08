"""Chat blocks and reports; the opponents of the current duel win streak.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe to run again: the tables or the column may already exist if an earlier,
    # half-applied version of this migration touched the database.
    insp = sa.inspect(op.get_bind())
    tables = set(insp.get_table_names())
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    if "duel_streak_opps" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("duel_streak_opps", json_type, nullable=False, server_default="[]"))
    if "chat_blocks" not in tables:
        op.create_table(
            "chat_blocks",
            sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("blocked_id", sa.BigInteger(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "chat_reports" not in tables:
        op.create_table(
            "chat_reports",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("reporter_id", sa.BigInteger(), nullable=False),
            sa.Column("reported_id", sa.BigInteger(), nullable=False),
            sa.Column("msg_ts", sa.BigInteger(), nullable=False),
            sa.Column("text", sa.String(240), nullable=False),
            sa.Column("reason", sa.String(16), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("reporter_id", "reported_id", "msg_ts", name="uq_chat_report_once"),
        )
        op.create_index("ix_chat_reports_reporter_id", "chat_reports", ["reporter_id"])
        op.create_index("ix_chat_reports_reported_id", "chat_reports", ["reported_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_reports_reported_id", table_name="chat_reports")
    op.drop_index("ix_chat_reports_reporter_id", table_name="chat_reports")
    op.drop_table("chat_reports")
    op.drop_table("chat_blocks")
    op.drop_column("users", "duel_streak_opps")
