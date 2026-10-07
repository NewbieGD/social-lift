"""Pydantic models for request bodies. Every field is bounded."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import game_config as gc


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConsentIn(Strict):
    version: int = Field(ge=1, le=10_000)


class SettingsIn(Strict):
    settings: dict = Field(default_factory=dict)
    updated_at: int = Field(ge=0, le=10**14)

    @field_validator("settings")
    @classmethod
    def small_and_flat(cls, v: dict) -> dict:
        if len(v) > 40:
            raise ValueError("too many settings")
        for key, value in v.items():
            if not isinstance(key, str) or len(key) > 40:
                raise ValueError("bad key")
            if not isinstance(value, (str, int, float, bool)) or (isinstance(value, str) and len(value) > 64):
                raise ValueError("bad value")
        return v


class RunFinishIn(Strict):
    run_id: str = Field(min_length=36, max_length=36)
    token: str = Field(min_length=10, max_length=128)
    score: int = Field(ge=0, le=10_000_000)
    duration_ms: int = Field(ge=0, le=24 * 3600 * 1000)
    tier: int = Field(ge=0, le=len(gc.TIER_THRESHOLDS) - 1)
    captures: int = Field(ge=0, le=1_000_000)
    max_combo: int = Field(ge=0, le=1_000_000)
    # Items picked up in this run (bit N = item of tier N). Older clients send nothing.
    items: int = Field(default=0, ge=0, lt=1 << gc.ITEM_COUNT)
    # The cosmetic offered for this run (if any) was picked up from a platform.
    drop_found: bool = False
    input_log: list[list[int]] = Field(default_factory=list, max_length=gc.MAX_INPUT_LOG)

    @field_validator("input_log")
    @classmethod
    def triples(cls, v: list[list[int]]) -> list[list[int]]:
        for item in v:
            if len(item) != 3:
                raise ValueError("input_log items must be [tick, axis, press]")
        return v


class LoadoutIn(Strict):
    # {slot: item_id | null}; the slot names and the items are checked against the catalog.
    loadout: dict[str, str | None] = Field(default_factory=dict, max_length=8)


class DecorIn(Strict):
    # {bg|frame|fx: item_id | null, props: {left|right|wall: item_id | null}}
    decor: dict = Field(default_factory=dict)

    @field_validator("decor")
    @classmethod
    def small(cls, v: dict) -> dict:
        if len(v) > 6 or len(v.get("props") or {}) > 4:
            raise ValueError("too many places")
        return v


class PrivacyIn(Strict):
    hide_vk_link: bool


class BuyIn(Strict):
    item_id: str = Field(min_length=1, max_length=40)


class EventIn(Strict):
    type: Literal[
        "tutorial_start",
        "tutorial_end",
        "run_start",
        "run_end",
        "tier_reached",
        "ad_shown",
        "settings_changed",
    ]
    value: int | None = Field(default=None, ge=0, le=10_000_000)
