"""Repair the chat tables if they were created by an earlier, different version of 0013.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-13

0013 only creates a table when it is missing. If a table with that name already existed with other
columns (an older draft of the migration), it was left as it was and the game then failed with
"column chat_reports.reported_id does not exist". This migration compares the real columns with
the expected ones:
  - an empty table with wrong columns is dropped and created again (nothing is lost);
  - a table that has rows only gets the missing columns added (existing rows are kept).
It is safe to run on a database that is already correct: then it does nothing.
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

REPORT_COLUMNS = {"id", "reporter_id", "reported_id", "msg_ts", "text", "reason", "created_at"}
BLOCK_COLUMNS = {"user_id", "blocked_id", "created_at"}


def _create_reports() -> None:
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


def _create_blocks() -> None:
    op.create_table(
        "chat_blocks",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blocked_id", sa.BigInteger(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def _columns(insp, table: str) -> set[str]:
    return {c["name"] for c in insp.get_columns(table)}


def _count(bind, table: str) -> int:
    return int(bind.execute(sa.text(f'SELECT count(*) FROM "{table}"')).scalar() or 0)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    # ---- chat_reports
    if "chat_reports" not in tables:
        _create_reports()
    else:
        missing = REPORT_COLUMNS - _columns(insp, "chat_reports")
        if missing:
            if _count(bind, "chat_reports") == 0:
                op.drop_table("chat_reports")
                _create_reports()
            else:
                # Keep the rows: add what is missing with neutral values.
                specs = {
                    "id": None,
                    "reporter_id": (sa.BigInteger(), "0"),
                    "reported_id": (sa.BigInteger(), "0"),
                    "msg_ts": (sa.BigInteger(), "0"),
                    "text": (sa.String(240), "''"),
                    "reason": (sa.String(16), "'other'"),
                    "created_at": (sa.DateTime(timezone=True), "now()"),
                }
                for name in sorted(missing):
                    spec = specs.get(name)
                    if spec is None:
                        continue
                    op.add_column("chat_reports", sa.Column(name, spec[0], nullable=False, server_default=sa.text(spec[1])))
                existing = {i["name"] for i in sa.inspect(bind).get_indexes("chat_reports")}
                if "ix_chat_reports_reporter_id" not in existing:
                    op.create_index("ix_chat_reports_reporter_id", "chat_reports", ["reporter_id"])
                if "ix_chat_reports_reported_id" not in existing:
                    op.create_index("ix_chat_reports_reported_id", "chat_reports", ["reported_id"])
        else:
            existing = {i["name"] for i in insp.get_indexes("chat_reports")}
            if "ix_chat_reports_reporter_id" not in existing:
                op.create_index("ix_chat_reports_reporter_id", "chat_reports", ["reporter_id"])
            if "ix_chat_reports_reported_id" not in existing:
                op.create_index("ix_chat_reports_reported_id", "chat_reports", ["reported_id"])

    # ---- chat_blocks
    if "chat_blocks" not in tables:
        _create_blocks()
    else:
        missing = BLOCK_COLUMNS - _columns(insp, "chat_blocks")
        if missing:
            if _count(bind, "chat_blocks") == 0:
                op.drop_table("chat_blocks")
                _create_blocks()
            elif "created_at" in missing:
                op.add_column(
                    "chat_blocks",
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
                )


def downgrade() -> None:
    # The repair has nothing to undo: 0013 owns the tables.
    pass
