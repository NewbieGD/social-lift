"""The weekly mayor election: candidates, votes, terms, assistants, progress, rings, notifications.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-14
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe to run again (see 0013): a table or column that exists is left alone.
    insp = sa.inspect(op.get_bind())
    tables = set(insp.get_table_names())
    json_type = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    if "notif_read_id" not in {c["name"] for c in insp.get_columns("users")}:
        op.add_column("users", sa.Column("notif_read_id", sa.BigInteger(), nullable=False, server_default="0"))
    if "gov_elections" not in tables:
        op.create_table(
            "gov_elections",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("voting_notified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("winner_id", sa.BigInteger()),
        )
    if "gov_candidates" not in tables:
        op.create_table(
            "gov_candidates",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "gov_votes" not in tables:
        op.create_table(
            "gov_votes",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("voter_id", sa.BigInteger(), primary_key=True),
            sa.Column("candidate_id", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "gov_terms" not in tables:
        op.create_table(
            "gov_terms",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("mayor_id", sa.BigInteger()),
            sa.Column("bonus_on", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("play_color", sa.String(12), nullable=False, server_default="default"),
        )
    if "gov_assistants" not in tables:
        op.create_table(
            "gov_assistants",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("term_week", sa.String(10), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(10), nullable=False),
            sa.Column("invited_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("answered_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("term_week", "user_id", name="uq_gov_assistant"),
        )
        op.create_index("ix_gov_assistants_term_week", "gov_assistants", ["term_week"])
    if "gov_progress" not in tables:
        op.create_table(
            "gov_progress",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), primary_key=True),
            sa.Column("duel_wins", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("best_solo", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("runs", sa.Integer(), nullable=False, server_default="0"),
        )
    if "gov_rings" not in tables:
        op.create_table(
            "gov_rings",
            sa.Column("week", sa.String(10), primary_key=True),
            sa.Column("user_id", sa.BigInteger(), primary_key=True),
            sa.Column("found_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "notifications" not in tables:
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.BigInteger()),
            sa.Column("kind", sa.String(24), nullable=False),
            sa.Column("payload", json_type, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
        op.create_index("ix_notifications_created_at", "notifications", ["created_at"])


def downgrade() -> None:
    for table in ("notifications", "gov_rings", "gov_progress", "gov_assistants", "gov_terms", "gov_votes", "gov_candidates", "gov_elections"):
        op.drop_table(table)
    op.drop_column("users", "notif_read_id")
