"""Initial schema.

Revision ID: 0001
Revises:
Create Date: 2026-10-02
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("last_seen_at", TS, nullable=False),
        sa.Column("display_name", sa.String(64)),
        sa.Column("photo_url", sa.String(512)),
        sa.Column("profile_deactivated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("profile_synced_at", TS),
        sa.Column("last_platform", sa.String(32)),
        sa.Column("consent_version", sa.Integer()),
        sa.Column("consent_at", TS),
        sa.Column("settings", JSON, nullable=False),
        sa.Column("settings_updated_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("tutorial_done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("best_all", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("best_all_at", TS),
        sa.Column("best_tier", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_score", sa.Integer()),
        sa.Column("last_run_at", TS),
        sa.Column("total_runs", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_users_best_all", "users", ["best_all", "best_all_at"])

    op.create_table(
        "runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seed", sa.BigInteger(), nullable=False),
        sa.Column("started_at", TS, nullable=False),
        sa.Column("finished_at", TS),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("score", sa.Integer()),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("tier", sa.Integer()),
        sa.Column("captures", sa.Integer()),
        sa.Column("max_combo", sa.Integer()),
        sa.Column("flags", sa.String(64)),
        sa.Column("input_log", sa.Text()),
    )
    op.create_index("ix_runs_user_id", "runs", ["user_id"])

    op.create_table(
        "week_best",
        sa.Column("week_id", sa.String(10), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("best_score", sa.Integer(), nullable=False),
        sa.Column("achieved_at", TS, nullable=False),
    )
    op.create_index("ix_week_best_rank", "week_best", ["week_id", "best_score", "achieved_at"])

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("platform", sa.String(32)),
        sa.Column("value", sa.Integer()),
    )
    op.create_index("ix_events_created_at", "events", ["created_at"])


def downgrade() -> None:
    op.drop_table("events")
    op.drop_table("week_best")
    op.drop_table("runs")
    op.drop_table("users")
