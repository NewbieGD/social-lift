"""Database tables (design doc, section 8)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)  # vk_user_id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    display_name: Mapped[str | None] = mapped_column(String(64))
    photo_url: Mapped[str | None] = mapped_column(String(512))
    profile_deactivated: Mapped[bool] = mapped_column(Boolean, default=False)
    profile_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_platform: Mapped[str | None] = mapped_column(String(32))
    consent_version: Mapped[int | None] = mapped_column(Integer)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settings: Mapped[dict] = mapped_column(JsonType, default=dict)
    settings_updated_at: Mapped[int] = mapped_column(BigInteger, default=0)  # client ms timestamp
    tutorial_done: Mapped[bool] = mapped_column(Boolean, default=False)
    best_all: Mapped[int] = mapped_column(Integer, default=0)
    best_all_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    best_tier: Mapped[int] = mapped_column(Integer, default=0)
    last_score: Mapped[int | None] = mapped_column(Integer)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_runs: Mapped[int] = mapped_column(Integer, default=0)
    last_tier: Mapped[int] = mapped_column(Integer, default=0)
    best_combo: Mapped[int] = mapped_column(Integer, default=0)
    total_captures: Mapped[int] = mapped_column(Integer, default=0)
    # Collection: bit N = item of tier N; misses = runs that reached the tier without it.
    items_mask: Mapped[int] = mapped_column(Integer, default=0)
    item_misses: Mapped[str] = mapped_column(String(64), default="")
    duel_wins: Mapped[int] = mapped_column(Integer, default=0)
    duel_wins_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    runs: Mapped[list[Run]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    weeks: Mapped[list[WeekBest]] = relationship(cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (Index("ix_users_best_all", "best_all", "best_all_at"),)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seed: Mapped[int] = mapped_column(BigInteger)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="started")  # started|finished|rejected|abandoned
    score: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    tier: Mapped[int | None] = mapped_column(Integer)
    captures: Mapped[int | None] = mapped_column(Integer)
    max_combo: Mapped[int | None] = mapped_column(Integer)
    flags: Mapped[str | None] = mapped_column(String(64))
    input_log: Mapped[str | None] = mapped_column(Text)
    items_start: Mapped[int] = mapped_column(Integer, default=0)
    items: Mapped[int | None] = mapped_column(Integer)
    duel_id: Mapped[str | None] = mapped_column(String(36), index=True)

    user: Mapped[User] = relationship(back_populates="runs")


class WeekBest(Base):
    __tablename__ = "week_best"

    week_id: Mapped[str] = mapped_column(String(10), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    best_score: Mapped[int] = mapped_column(Integer)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_week_best_rank", "week_id", "best_score", "achieved_at"),)


class Event(Base):
    """Anonymous funnel log: no user id is stored."""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    type: Mapped[str] = mapped_column(String(32))
    platform: Mapped[str | None] = mapped_column(String(32))
    value: Mapped[int | None] = mapped_column(Integer)


class CrownState(Base):
    """Who holds the crown of the weekly leader. One row (id = 1)."""

    __tablename__ = "crown_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    week_id: Mapped[str] = mapped_column(String(10), default="")
    holder_id: Mapped[int | None] = mapped_column(BigInteger)
    since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CrownNotice(Base):
    """An in-game message for a player about the crown; shown once, then deleted."""

    __tablename__ = "crown_notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    kind: Mapped[str] = mapped_column(String(8))  # won | lost | expired
    other_name: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
