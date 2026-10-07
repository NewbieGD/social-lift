"""Purchases for VK votes (VK Payments notifications).

How it works: the game asks VK to open the purchase window for a product name. VK then calls this
server twice: `get_item` (what is the product and its price) and `order_status_change` with
status `chargeable` (the user paid: deliver the goods and confirm). Only after that answer does
VK charge the votes. Notifications are signed with the app's protected key; the same order may
be reported again, and then the answer must be the same as the first time.

The price and the content of every product are decided here, never by the client.
"""

from __future__ import annotations

import hashlib
import hmac
from urllib.parse import parse_qsl

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import cosmetics
from ..config import settings
from ..core import utcnow
from ..models import OwnedCosmetic, User, VkOrder
from . import shop

# Error codes of the VK Payments protocol.
COMMON_ERROR = 1
BAD_SIGNATURE = 10
BAD_REQUEST = 11
PRODUCT_NOT_EXIST = 20
USER_NOT_EXIST = 22
# 100 and up are ours and always come with a readable message.
ALREADY_OWNED = 100
PRICE_MISMATCH = 101


def parse_body(body: bytes) -> dict[str, str]:
    """The notification body is a urlencoded form (UTF-8)."""
    return dict(parse_qsl(body.decode("utf-8", errors="replace"), keep_blank_values=True))


def sign(params: dict[str, str], secret: str) -> str:
    """md5 of "name=value" pairs in the order of the names, followed by the protected key."""
    raw = "".join(f"{k}={params[k]}" for k in sorted(params) if k != "sig") + secret
    return hashlib.md5(raw.encode("utf-8")).hexdigest()  # noqa: S324 - the protocol requires md5


def signature_ok(params: dict[str, str]) -> bool:
    got = params.get("sig", "")
    if not got or not settings.vk_secret_key:
        return False
    return hmac.compare_digest(got.lower(), sign(params, settings.vk_secret_key))


def _err(code: int, msg: str, critical: bool = True) -> dict:
    return {"error": {"error_code": code, "error_msg": msg, "critical": critical}}


async def _owns_all(session: AsyncSession, user_id: int, product: cosmetics.Product) -> bool:
    return set(product.items) <= await shop.owned_ids(session, user_id)


async def handle(session: AsyncSession, params: dict[str, str]) -> dict:
    """Processes one notification and returns the JSON answer for VK (never raises)."""
    if not signature_ok(params):
        return _err(BAD_SIGNATURE, "Bad signature")
    try:
        if int(params.get("app_id", "0")) != settings.vk_app_id:
            return _err(BAD_REQUEST, "Wrong app")
        kind = params.get("notification_type", "")
        test = kind.endswith("_test")
        kind = kind.removesuffix("_test")
        user_id = int(params["user_id"])
        product = cosmetics.PRODUCTS.get(params.get("item", ""))
    except (KeyError, ValueError):
        return _err(BAD_REQUEST, "Bad request")

    if kind not in ("get_item", "order_status_change"):
        return _err(BAD_REQUEST, "Unsupported notification")
    # The item name comes from the client, so it may be anything.
    if product is None:
        return _err(PRODUCT_NOT_EXIST, "Product does not exist")
    user = await session.get(User, user_id)
    if user is None:
        return _err(USER_NOT_EXIST, "User does not exist")

    if kind == "get_item":
        if await _owns_all(session, user_id, product):
            return _err(ALREADY_OWNED, "Это уже куплено")
        return {"response": {"title": product.title[:48], "price": product.votes, "item_id": product.id, "expiration": 600}}

    # order_status_change
    try:
        order_id = int(params["order_id"])
        receiver = int(params.get("receiver_id", user_id))
        status = params["status"]
    except (KeyError, ValueError):
        return _err(BAD_REQUEST, "Bad request")
    if receiver != user_id:
        return _err(BAD_REQUEST, "Gifts are not supported")

    existing = (
        await session.execute(select(VkOrder).where(VkOrder.order_id == order_id, VkOrder.test == test))
    ).scalar_one_or_none()

    if status == "chargeable":
        if existing is not None:
            # A repeated notification gets the same answer as the first one.
            return {"response": {"order_id": order_id, "app_order_id": existing.id}}
        try:
            price = int(params.get("item_price", "-1"))
        except ValueError:
            price = -1
        if price != product.votes:
            return _err(PRICE_MISMATCH, "Цена товара изменилась")
        order = VkOrder(
            order_id=order_id,
            test=test,
            user_id=user_id,
            product=product.id,
            votes=product.votes,
            status="delivered",
            created_at=utcnow(),
        )
        session.add(order)
        try:
            await session.flush()
        except IntegrityError:
            # Two copies of the notification at the same moment: the other one won.
            await session.rollback()
            again = (
                await session.execute(select(VkOrder).where(VkOrder.order_id == order_id, VkOrder.test == test))
            ).scalar_one_or_none()
            if again is None:
                return _err(COMMON_ERROR, "Try again", critical=False)
            return {"response": {"order_id": order_id, "app_order_id": again.id}}
        await shop.grant(session, user, list(product.items), "vk")
        await session.commit()
        return {"response": {"order_id": order_id, "app_order_id": order.id}}

    if status == "refunded":
        if existing is None:
            return {"response": {"order_id": order_id}}
        if existing.status != "refunded":
            # Take the goods back: only what this purchase gave.
            await session.execute(
                delete(OwnedCosmetic).where(
                    OwnedCosmetic.user_id == user_id,
                    OwnedCosmetic.item_id.in_(product.items),
                    OwnedCosmetic.source == "vk",
                )
            )
            existing.status = "refunded"
            existing.refunded_at = utcnow()
            await session.commit()
        return {"response": {"order_id": order_id, "app_order_id": existing.id}}

    return _err(BAD_REQUEST, "Unsupported status")
