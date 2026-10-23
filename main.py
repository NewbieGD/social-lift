"""Карта курьеров: Telegram Mini App.
Заведения и отзывы, теги, «полезно», рейтинг курьера, общий чат.
База: SQLite в постоянном хранилище (/data на Амвере).
"""
import asyncio
import calendar
import gzip
import shutil
import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from urllib.parse import parse_qsl

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse
try:
    from starlette.middleware.gzip import GZipMiddleware
except ImportError:          # только в упрощённых тестах; в FastAPI модуль есть всегда
    GZipMiddleware = None
from collections import deque
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("couriermap")

BASE = Path(__file__).parent
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
DEV_MODE = os.getenv("DEV_MODE") == "1"          # только для локальных проверок
DB_PATH = os.getenv("DB_PATH") or (
    "/data/couriers.db" if Path("/data").is_dir() else str(BASE / "couriers.db")
)
INIT_DATA_MAX_AGE = 3 * 24 * 3600

# Север Москвы (юг, запад, север, восток)
IMPORT_BBOX = (55.80, 37.43, 55.92, 37.62)
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# ключ: (подпись, «хорошее» свойство?)
TAGS = {
    "long_wait": ("Долго ждать заказ", False),
    "wrong_order": ("Путают заказы", False),
    "rude": ("Грубят", False),
    "no_parking": ("Негде оставить транспорт", False),
    "hard_entry": ("Сложно найти вход", False),
    "fast": ("Быстро отдают", True),
    "friendly": ("Вежливый персонал", True),
    "toilet": ("Можно в туалет", True),
}

# ---- игровая часть: опыт (XP), уровни, достижения ----
TEXT_MIN = 40                       # «подробный» отзыв, символов
XP = {
    "venue": 5,       # добавил заведение
    "venue_ok": 15,   # его заведение подтвердил отзывом другой курьер
    "review": 5,      # отзыв: оценка и теги
    "text": 5,        # подробный текст от TEXT_MIN символов
    "update": 4,      # обновил свой отзыв (не чаще раза в 7 дней)
    "helpful": 3,     # его отзыв отметили полезным
    "confirm": 2,     # подтвердил, что информация актуальна
    "news": 15,       # его новость прошла проверку и опубликована
    "poi": 3,         # добавил полезную точку
    "poi_ok": 5,      # другой курьер подтвердил, что точка работает
    "qa": 5,          # его ответ на вопрос попал в карточку заведения
}
XP_RULES = [
    ("📍", "Добавить заведение", "venue"),
    ("✅", "Другой курьер оценил ваше заведение", "venue_ok"),
    ("✍️", "Отзыв: оценка и теги", "review"),
    ("📝", f"Подробный текст от {TEXT_MIN} символов", "text"),
    ("🔄", "Обновить отзыв (раз в 7 дней)", "update"),
    ("👍", "Ваш отзыв отметили полезным", "helpful"),
    ("☑️", "Подтвердить, что информация актуальна", "confirm"),
    ("📰", "Новость прошла проверку", "news"),
    ("🚻", "Добавить полезную точку", "poi"),
    ("🛟", "Другой курьер подтвердил вашу точку", "poi_ok"),
    ("💬", "Ваш ответ попал в карточку заведения", "qa"),
]
# полезные точки: ключ → (название, значок, цвет на карте)
POI_KINDS = {
    "wc": ("Туалет", "🚻", "#6d28d9"),
    "warm": ("Погреться и отдохнуть", "☕", "#a2845e"),
    "charge": ("Зарядить телефон", "🔌", "#e8a400"),
    "water": ("Вода", "💧", "#32ade6"),
    "parking": ("Оставить транспорт", "🅿️", "#007aff"),
    "repair": ("Ремонт вело и самокатов", "🔧", "#64748b"),
    "food": ("Недорого поесть", "🍲", "#ff6b22"),
    "danger": ("Осторожно", "⚠️", "#ff3b30"),
}
POI_GONE_HIDE = 3   # столько «больше нет» (и больше, чем «работает») убирают точку с карты

LEVELS = [
    (0, "Новичок", "🌱"), (30, "Стажёр", "🚲"), (80, "Курьер", "📦"), (150, "Опытный", "🛵"),
    (250, "Профи", "⚡"), (400, "Знаток района", "🧭"), (600, "Мастер маршрутов", "🗺️"),
    (850, "Ветеран", "🎖️"), (1200, "Легенда района", "🏆"), (1700, "Король доставки", "👑"),
]
# ключ, значок, название, что считаем, цель, единица
ACHIEVEMENTS = [
    ("first_review", "✍️", "Первый отзыв", "reviews", 1, "отзыв"),
    ("reviews10", "🗒️", "Обозреватель", "reviews", 10, "отзывов"),
    ("reviews50", "📚", "Летописец", "reviews", 50, "отзывов"),
    ("reviews150", "🏛️", "Энциклопедист", "reviews", 150, "отзывов"),
    ("text10", "📝", "Подробно", "text_reviews", 10, "подробных"),
    ("first_venue", "📍", "Разведчик", "venues", 1, "заведение"),
    ("venues10", "🧭", "Картограф", "venues", 10, "заведений"),
    ("venues30", "🗺️", "Первопроходец", "venues", 30, "заведений"),
    ("venues_ok5", "✅", "Признание", "venues_confirmed", 5, "подтверждено"),
    ("helpful1", "👍", "Полезный", "helpful", 1, "«полезно»"),
    ("helpful25", "🔥", "Народный эксперт", "helpful", 25, "«полезно»"),
    ("helpful100", "💎", "Голос района", "helpful", 100, "«полезно»"),
    ("updates5", "🔄", "На страже", "updates", 5, "обновлений"),
    ("confirms20", "☑️", "Хранитель", "confirms", 20, "подтверждений"),
    ("news1", "📰", "Репортёр", "news", 1, "новость"),
    ("news10", "🗞️", "Корреспондент", "news", 10, "новостей"),
    ("comments20", "💬", "Собеседник", "comments", 20, "комментариев"),
    ("poi1", "🛟", "Помощник", "pois", 1, "точка"),
    ("poi10", "🏅", "Опора района", "pois", 10, "точек"),
    ("level5", "⚡", "Профи", "level", 5, "уровень"),
    ("level9", "🏆", "Легенда", "level", 9, "уровень"),
    ("level10", "👑", "Король", "level", 10, "уровень"),
]


def xp_sql(uid: str) -> str:
    return (
        f"({XP['review']}*(SELECT COUNT(*) FROM reviews rx WHERE rx.user_id={uid})"
        f" + {XP['text']}*(SELECT COUNT(*) FROM reviews rt WHERE rt.user_id={uid}"
        f" AND length(trim(rt.text))>={TEXT_MIN})"
        f" + {XP['helpful']}*(SELECT COUNT(*) FROM votes vx JOIN reviews ry ON ry.id=vx.review_id"
        f" WHERE ry.user_id={uid} AND vx.value=1)"
        f" + {XP['venue']}*(SELECT COUNT(*) FROM venues wx WHERE wx.added_by={uid})"
        f" + {XP['venue_ok']}*(SELECT COUNT(*) FROM venues wy WHERE wy.added_by={uid} AND EXISTS("
        f"SELECT 1 FROM reviews rz WHERE rz.venue_id=wy.id AND rz.user_id!={uid}))"
        f" + {XP['update']}*(SELECT COUNT(*) FROM review_history hx WHERE hx.user_id={uid})"
        f" + {XP['confirm']}*(SELECT COUNT(*) FROM confirmations cx WHERE cx.user_id={uid})"
        f" + {XP['news']}*(SELECT COUNT(*) FROM news nx WHERE nx.user_id={uid}"
        f" AND nx.status='published' AND nx.deleted=0)"
        f" + {XP['poi']}*(SELECT COUNT(*) FROM pois px WHERE px.added_by={uid} AND px.deleted=0)"
        f" + {XP['poi_ok']}*(SELECT COUNT(*) FROM pois py WHERE py.added_by={uid} AND py.deleted=0 AND EXISTS("
        f"SELECT 1 FROM poi_votes pv WHERE pv.poi_id=py.id AND pv.value=1 AND pv.user_id!={uid}))"
        f" + {XP['qa']}*(SELECT COUNT(*) FROM venue_answers ax WHERE ax.answer_user={uid}))"
    )


def all_xp(con, since: int = 0) -> dict:
    """Опыт всех курьеров за один проход по каждой таблице (вместо подзапросов на каждого человека).
    since > 0 — только опыт, набранный начиная с этого момента. Формула та же, что в xp_sql / xp_sql_since."""
    t = int(since)
    acc: dict = {}

    def add(mult: int, sql: str):
        for uid, n in con.execute(sql, (t,)):
            if uid is not None:
                acc[uid] = acc.get(uid, 0) + mult * n

    add(XP["review"], "SELECT user_id, COUNT(*) FROM reviews WHERE created_at>=? GROUP BY user_id")
    add(XP["text"], f"SELECT user_id, COUNT(*) FROM reviews WHERE created_at>=? AND length(trim(text))>={TEXT_MIN} "
                    "GROUP BY user_id")
    add(XP["helpful"], "SELECT r.user_id, COUNT(*) FROM votes v JOIN reviews r ON r.id=v.review_id "
                       "WHERE v.value=1 AND v.created_at>=? GROUP BY r.user_id")
    add(XP["venue"], "SELECT added_by, COUNT(*) FROM venues WHERE created_at>=? GROUP BY added_by")
    add(XP["venue_ok"], "SELECT w.added_by, COUNT(*) FROM venues w WHERE (SELECT MIN(r.created_at) FROM reviews r "
                        "WHERE r.venue_id=w.id AND r.user_id!=w.added_by)>=? GROUP BY w.added_by")
    add(XP["update"], "SELECT user_id, COUNT(*) FROM review_history WHERE archived_at>=? GROUP BY user_id")
    add(XP["confirm"], "SELECT user_id, COUNT(*) FROM confirmations WHERE created_at>=? GROUP BY user_id")
    add(XP["news"], "SELECT user_id, COUNT(*) FROM news WHERE status='published' AND deleted=0 "
                    "AND COALESCE(published_at,0)>=? GROUP BY user_id")
    add(XP["poi"], "SELECT added_by, COUNT(*) FROM pois WHERE deleted=0 AND created_at>=? GROUP BY added_by")
    add(XP["poi_ok"], "SELECT p.added_by, COUNT(*) FROM pois p WHERE p.deleted=0 AND (SELECT MIN(v.created_at) "
                      "FROM poi_votes v WHERE v.poi_id=p.id AND v.value=1 AND v.user_id!=p.added_by)>=? GROUP BY p.added_by")
    add(XP["qa"], "SELECT answer_user, COUNT(*) FROM venue_answers WHERE created_at>=? GROUP BY answer_user")
    return acc


_XP_CACHE = {"t": 0.0, "map": {}}


def xp_for_icons(con) -> dict:
    """Опыт всех для значков уровня рядом с именами (чат, отзывы, маячки). Точность до 10 секунд достаточна."""
    if time.time() - _XP_CACHE["t"] > 10:
        _XP_CACHE["map"] = all_xp(con)
        _XP_CACHE["t"] = time.time()
    return _XP_CACHE["map"]


def user_stats(con, uid: int) -> dict:
    q = lambda sql: con.execute(sql, (uid,) * sql.count("?")).fetchone()[0]
    st = {
        "reviews": q("SELECT COUNT(*) FROM reviews WHERE user_id=?"),
        "text_reviews": q(f"SELECT COUNT(*) FROM reviews WHERE user_id=? AND length(trim(text))>={TEXT_MIN}"),
        "helpful": q("SELECT COUNT(*) FROM votes v JOIN reviews r ON r.id=v.review_id "
                     "WHERE r.user_id=? AND v.value=1"),
        "venues": q("SELECT COUNT(*) FROM venues WHERE added_by=?"),
        "venues_confirmed": q("SELECT COUNT(*) FROM venues w WHERE w.added_by=? AND EXISTS("
                              "SELECT 1 FROM reviews r WHERE r.venue_id=w.id AND r.user_id!=?)"),
        "updates": q("SELECT COUNT(*) FROM review_history WHERE user_id=?"),
        "confirms": q("SELECT COUNT(*) FROM confirmations WHERE user_id=?"),
        "news": q("SELECT COUNT(*) FROM news WHERE user_id=? AND status='published' AND deleted=0"),
        "comments": q("SELECT COUNT(*) FROM comments WHERE user_id=? AND deleted=0"),
        "pois": q("SELECT COUNT(*) FROM pois WHERE added_by=? AND deleted=0"),
        "pois_confirmed": q("SELECT COUNT(*) FROM pois p WHERE p.added_by=? AND p.deleted=0 AND EXISTS("
                            "SELECT 1 FROM poi_votes v WHERE v.poi_id=p.id AND v.value=1 AND v.user_id!=?)"),
        "answers": q("SELECT COUNT(*) FROM venue_answers WHERE answer_user=?"),
    }
    st["xp"] = (XP["review"] * st["reviews"] + XP["text"] * st["text_reviews"]
                + XP["helpful"] * st["helpful"] + XP["venue"] * st["venues"]
                + XP["venue_ok"] * st["venues_confirmed"] + XP["update"] * st["updates"]
                + XP["confirm"] * st["confirms"] + XP["news"] * st["news"]
                + XP["poi"] * st["pois"] + XP["poi_ok"] * st["pois_confirmed"] + XP["qa"] * st["answers"])
    return st


# Telegram ID администраторов через запятую, переменная окружения ADMIN_IDS
ADMIN_IDS = {
    int(x) for x in os.getenv("ADMIN_IDS", "").replace(",", " ").split() if x.strip().isdigit()
}
FOREVER = 2**31 - 1

SETTINGS_DEFAULT = {
    "chat_cooldown": "30",      # секунд между сообщениями одного курьера
    "allow_links": "0",         # ссылки и @упоминания
    "filter_profanity": "1",    # фильтр мата
    "report_hide": "3",         # после скольких жалоб скрывать
    "chat_readonly": "0",       # писать могут только админы
    "stop_words": "",           # свои запрещённые слова
    "beacon_min_level": "1",    # с какого уровня доступен маячок «на линии»
    "beacon_radius_km": "1",    # в каком радиусе от себя курьер видит маячки других
    "auto_mute_reports": "5",   # автомут на сутки после жалоб от N разных людей за сутки (0 — выкл.)
    "chat_retention_days": "90",  # сколько дней хранить сообщения чата (0 — всегда)
    "backup_send": "1",         # присылать ежедневную копию базы админам в Telegram
    "qa_min_likes": "3",        # сколько 👍 нужно ответу, чтобы попасть в карточку заведения
}

# ---- фильтр мата: нормализуем обходы (латиница, цифры, х.у.й, х у й, хуууй) ----
_HOMO = str.maketrans({
    "a": "а", "b": "б", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х", "y": "у",
    "k": "к", "m": "м", "t": "т", "h": "н", "z": "з", "0": "о", "3": "з", "6": "б", "4": "ч", "@": "а",
})


def normalize(text: str) -> str:
    t = text.lower().replace("ё", "е").translate(_HOMO)
    t = re.sub(r"(?<=[а-я])[.\-_*+|,'`~]+(?=[а-я])", "", t)
    t = re.sub(r"(?<![а-я])(?:[а-я] ){2,}[а-я](?![а-я])", lambda m: m.group(0).replace(" ", ""), t)
    t = re.sub(r"([а-я])\1+", r"\1", t)
    return t


_B = r"(?<![а-я])"
PROFANITY = re.compile("|".join([
    _B + r"(?:на|по|ни|о|за|от|до|вы|раз|с)?ху[йеяюи]",
    r"пизд",
    _B + r"(?:за|на|по|от|до|вы|раз|разъ|подъ|отъ|объ|изъ|съ|въ|у|при|про|пере|недо|об|о|уе)?"
         r"еб(?:а|ан|ал|ат|ну|л|ыв|ис|ук|уч|ет|ут|ош|ок|ен|им)",
    r"долбо?еб",
    _B + r"бля(?:д|т|(?![а-я]))",
    _B + r"муд(?:ак|ил|о|ач|оз)",
    _B + r"пид[оа]р",
    r"залуп",
    _B + r"г[ао]ндон",
    r"шлюх",
    _B + r"сук(?:а|и|ой|у|ин)(?![а-я])",
    _B + r"манд[аеуы](?![а-я])",
    r"дроч",
]))
LINK = re.compile(
    r"(https?://|www\.|t\.me/|telegram\.me/|@[a-z0-9_]{4,}|"
    r"\b[a-zа-я0-9-]{2,}\.(?:ru|com|net|org|рф|me|io|su|info|biz|xyz|site|online|shop|store|"
    r"app|dev|pro|top|club|link|ly|gg|tv|cc|tk|by|kz|ua|uz)\b)",
    re.I,
)


def check_text(text: str, st: dict, is_admin: bool):
    """Вернёт текст ошибки или None."""
    if is_admin or not text:
        return None
    n = normalize(text)
    if st["filter_profanity"] and PROFANITY.search(n):
        return "Без мата, пожалуйста: текст не отправлен"
    for w in st["stop_words"]:
        if w in n:
            return "Текст содержит запрещённое слово"
    if not st["allow_links"] and LINK.search(text):
        return "Ссылки и @упоминания запрещены"
    return None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  tg_id INTEGER PRIMARY KEY, name TEXT NOT NULL, banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS venues(
  id INTEGER PRIMARY KEY AUTOINCREMENT, osm_id TEXT UNIQUE, name TEXT NOT NULL,
  name_l TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL,
  added_by INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS venues_geo ON venues(lat, lon);
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, UNIQUE(venue_id, user_id));
CREATE INDEX IF NOT EXISTS reviews_venue ON reviews(venue_id);
CREATE TABLE IF NOT EXISTS votes(
  review_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(review_id, user_id));
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(kind, ref_id, user_id));
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS review_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  venue_id INTEGER NOT NULL, rating INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '', version_at INTEGER NOT NULL, archived_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS history_review ON review_history(review_id);
CREATE TABLE IF NOT EXISTS confirmations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS confirm_venue ON confirmations(venue_id, user_id);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  text TEXT NOT NULL, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS comments_review ON comments(review_id);
CREATE TABLE IF NOT EXISTS news(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, service TEXT NOT NULL,
  title TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
  published_at INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS news_status ON news(status, published_at);
CREATE TABLE IF NOT EXISTS news_votes(
  news_id INTEGER NOT NULL, user_id INTEGER NOT NULL, value INTEGER NOT NULL,
  PRIMARY KEY(news_id, user_id));
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
  text TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '{}', dedupe TEXT, created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, id);
CREATE TABLE IF NOT EXISTS pois(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL, lon REAL NOT NULL, added_by INTEGER NOT NULL, created_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS pois_geo ON pois(lat, lon);
CREATE TABLE IF NOT EXISTS venue_live(
  id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS live_venue ON venue_live(venue_id, expires_at);
CREATE TABLE IF NOT EXISTS feedback(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', reply TEXT NOT NULL DEFAULT '',
  replied_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS daily_active(day TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(day, user_id));
CREATE TABLE IF NOT EXISTS beacons(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, lat REAL NOT NULL, lon REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS beacons_exp ON beacons(expires_at);
CREATE INDEX IF NOT EXISTS messages_time ON messages(created_at);
CREATE TABLE IF NOT EXISTS message_votes(
  message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, value INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(message_id, user_id));
CREATE TABLE IF NOT EXISTS venue_answers(
  id INTEGER PRIMARY KEY AUTOINCREMENT, venue_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
  question_text TEXT NOT NULL, question_user INTEGER NOT NULL, question_at INTEGER NOT NULL,
  answer_id INTEGER NOT NULL UNIQUE, answer_text TEXT NOT NULL, answer_user INTEGER NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS venue_answers_v ON venue_answers(venue_id);
CREATE TABLE IF NOT EXISTS usage(
  day TEXT NOT NULL, event TEXT NOT NULL, user_id INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, event, user_id));
CREATE TABLE IF NOT EXISTS polls(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, created_by INTEGER NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS poll_options(
  id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, label TEXT NOT NULL, pos INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS poll_votes(
  poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL, option_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(poll_id, user_id));
CREATE TABLE IF NOT EXISTS poi_edits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, poi_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  kind TEXT NOT NULL, note TEXT NOT NULL, price TEXT NOT NULL, hours TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  action TEXT NOT NULL DEFAULT 'edit');
CREATE INDEX IF NOT EXISTS poi_edits_p ON poi_edits(poi_id, id);
CREATE TABLE IF NOT EXISTS shifts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL DEFAULT 0, orders INTEGER NOT NULL DEFAULT 0, earned INTEGER NOT NULL DEFAULT 0,
  tips INTEGER NOT NULL DEFAULT 0, food INTEGER NOT NULL DEFAULT 0, transport INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS shifts_user ON shifts(user_id, started_at);
CREATE TABLE IF NOT EXISTS shift_breaks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER NOT NULL, started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS breaks_shift ON shift_breaks(shift_id);
CREATE TABLE IF NOT EXISTS poi_votes(
  poi_id INTEGER NOT NULL, user_id INTEGER NOT NULL, value INTEGER NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(poi_id, user_id));
"""


def _add_column(con, table, column, ddl) -> bool:
    cols = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
    if column not in cols:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
        return True
    return False


def get_settings(con) -> dict:
    raw = dict(SETTINGS_DEFAULT)
    for r in con.execute("SELECT k, v FROM settings"):
        if r["k"] in raw:
            raw[r["k"]] = r["v"]

    def num(v, lo, hi, dflt):
        try:
            return max(lo, min(hi, int(v)))
        except (TypeError, ValueError):
            return dflt

    words = [normalize(w.strip()) for w in re.split(r"[,\n]", raw["stop_words"] or "")]
    return {
        "chat_cooldown": num(raw["chat_cooldown"], 0, 3600, 30),
        "allow_links": raw["allow_links"] == "1",
        "filter_profanity": raw["filter_profanity"] == "1",
        "report_hide": num(raw["report_hide"], 1, 100, 3),
        "chat_readonly": raw["chat_readonly"] == "1",
        "stop_words": [w for w in words if w],
        "beacon_min_level": num(raw["beacon_min_level"], 1, 10, 1),
        "beacon_radius_km": num(raw["beacon_radius_km"], 1, 20, 1),
        "auto_mute_reports": num(raw["auto_mute_reports"], 0, 50, 5),
        "chat_retention_days": num(raw["chat_retention_days"], 0, 3650, 90),
        "backup_send": raw["backup_send"] == "1",
        "qa_min_likes": num(raw["qa_min_likes"], 1, 20, 3),
        "stop_words_raw": raw["stop_words"] or "",
    }


@contextmanager
def db():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=NORMAL")     # с WAL это безопасно и заметно быстрее
    con.execute("PRAGMA busy_timeout=15000")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    _add_column(con, "users", "muted_until", "muted_until INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "messages", "deleted", "deleted INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "reports", "reason", "reason TEXT NOT NULL DEFAULT ''")
    _add_column(con, "reviews", "updated_at", "updated_at INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "reviews", "update_reason", "update_reason TEXT NOT NULL DEFAULT ''")
    _add_column(con, "users", "pub_id", "pub_id TEXT")
    _add_column(con, "users", "level_seen", "level_seen INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "votes", "value", "value INTEGER NOT NULL DEFAULT 1")
    _add_column(con, "users", "last_seen", "last_seen INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "votes", "created_at", "created_at INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "users", "deleted", "deleted INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "messages", "reply_to", "reply_to INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "messages", "venue_id", "venue_id INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "users", "tax_rate", "tax_rate REAL NOT NULL DEFAULT 6")
    _add_column(con, "pois", "price", "price TEXT NOT NULL DEFAULT ''")
    _add_column(con, "pois", "hours", "hours TEXT NOT NULL DEFAULT ''")
    _add_column(con, "pois", "edited_at", "edited_at INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "pois", "edited_by", "edited_by INTEGER")
    _add_column(con, "users", "tax_tips", "tax_tips INTEGER NOT NULL DEFAULT 1")
    _add_column(con, "shifts", "tax_rate", "tax_rate REAL NOT NULL DEFAULT 6")
    _add_column(con, "shifts", "tax_tips", "tax_tips INTEGER NOT NULL DEFAULT 1")
    _add_column(con, "users", "real_name", "real_name TEXT NOT NULL DEFAULT ''")
    _add_column(con, "users", "push_enabled", "push_enabled INTEGER NOT NULL DEFAULT 1")
    _add_column(con, "users", "last_push", "last_push INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "users", "accepted_version", "accepted_version INTEGER NOT NULL DEFAULT 0")
    _add_column(con, "reports", "target_user", "target_user INTEGER")
    if _add_column(con, "notifications", "pushed", "pushed INTEGER NOT NULL DEFAULT 0"):
        con.execute("UPDATE notifications SET pushed=1")   # старые уведомления в Telegram не рассылаем
    for (old_uid,) in con.execute("SELECT tg_id FROM users WHERE pub_id IS NULL").fetchall():
        con.execute("UPDATE users SET pub_id=? WHERE tg_id=?", (secrets.token_hex(4), old_uid))
    con.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_pub ON users(pub_id)")
    con.commit()
    con.close()


# ---------------- вход через Telegram ----------------
def verify_init_data(init_data: str) -> dict:
    if not BOT_TOKEN:
        raise HTTPException(500, "На сервере не задан BOT_TOKEN")
    if not init_data:
        raise HTTPException(401, "Откройте приложение через бота в Telegram")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    got_hash = pairs.pop("hash", None)
    if not got_hash:
        raise HTTPException(401, "Неверные данные входа")
    check = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, got_hash):
        raise HTTPException(401, "Неверная подпись входа")
    try:
        age = time.time() - int(pairs.get("auth_date", "0"))
    except ValueError:
        raise HTTPException(401, "Неверные данные входа")
    if age > INIT_DATA_MAX_AGE:
        raise HTTPException(401, "Сессия устарела, откройте приложение заново")
    try:
        user = json.loads(pairs.get("user", "{}"))
    except ValueError:
        user = {}
    if not isinstance(user, dict) or "id" not in user:
        raise HTTPException(401, "Не удалось определить пользователя")
    return user


def current_user(
    x_init_data: str = Header(default=""),
    x_dev_user: str = Header(default=""),
) -> dict:
    if DEV_MODE and x_dev_user:
        uid = int(x_dev_user) if x_dev_user.isdigit() else 1
        user = {"id": uid, "first_name": f"Тест{uid}"}
    else:
        user = verify_init_data(x_init_data)
    uid = int(user["id"])
    # в приложении показываем только имя, без фамилии и юзернейма
    name = str(user.get("first_name") or "").strip()[:30] or "Курьер"
    with db() as con:
        ex = con.execute("SELECT name, banned FROM users WHERE tg_id=?", (uid,)).fetchone()
        if not ex:
            con.execute("INSERT INTO users(tg_id,name,created_at,pub_id) VALUES(?,?,?,?)",
                        (uid, name, int(time.time()), secrets.token_hex(4)))
        elif not ex["banned"] and ex["name"] != name:
            con.execute("UPDATE users SET name=? WHERE tg_id=?", (name, uid))
        now_i = int(time.time())
        if con.execute("UPDATE users SET last_seen=? WHERE tg_id=? AND last_seen<?",
                       (now_i, uid, now_i - 60)).rowcount:
            con.execute("INSERT OR IGNORE INTO daily_active(day,user_id) VALUES(?,?)", (msk_day(now_i), uid))
        row = con.execute("SELECT banned, muted_until, pub_id FROM users WHERE tg_id=?", (uid,)).fetchone()
    is_admin = uid in ADMIN_IDS
    if row["banned"] and not is_admin:
        raise HTTPException(403, "Доступ закрыт")
    return {"id": uid, "name": name, "is_admin": is_admin, "muted_until": row["muted_until"],
            "pid": row["pub_id"]}


def msk_day(ts: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts + 3 * 3600))


def msk_day_start(ts: int) -> int:
    return ts - (ts + 3 * 3600) % 86400


def admin_user(u: dict = Depends(current_user)) -> dict:
    if not u["is_admin"]:
        raise HTTPException(403, "Только для администратора")
    return u


def level_index(xp: int) -> int:
    idx = 0
    for i, (need, _, _) in enumerate(LEVELS):
        if xp >= need:
            idx = i
    return idx


def level_for(xp: int) -> str:
    return LEVELS[level_index(xp)][1]


def level_icon(xp: int) -> str:
    return LEVELS[level_index(xp)][2]


def notify(con, uid: int, kind: str, text: str, ref: dict = None, actor: int = None, dedupe: str = None):
    """Уведомление пользователю. Себе не шлём; dedupe не даёт дублей (повторные лайки и т. п.)."""
    if actor is not None and actor == uid:
        return
    if dedupe and con.execute(
            "SELECT 1 FROM notifications WHERE user_id=? AND dedupe=?", (uid, dedupe)).fetchone():
        return
    con.execute(
        "INSERT INTO notifications(user_id,kind,text,ref,dedupe,created_at) VALUES(?,?,?,?,?,?)",
        (uid, kind, text[:300], json.dumps(ref or {}, ensure_ascii=False), dedupe, int(time.time())))


def sync_level(con, uid: int) -> int:
    """Проверяет, не вырос ли уровень, и присылает уведомление о новом уровне."""
    xp = user_stats(con, uid)["xp"]
    lvl = level_index(xp) + 1
    seen = con.execute("SELECT level_seen FROM users WHERE tg_id=?", (uid,)).fetchone()[0]
    if seen and lvl > seen:
        _, name, icon = LEVELS[lvl - 1]
        notify(con, uid, "level", f"Новый уровень {lvl}: {name} {icon}", {"profile": "me"})
    if lvl != seen:
        con.execute("UPDATE users SET level_seen=? WHERE tg_id=?", (lvl, uid))
    return xp


def points_of(con, uid: int) -> int:
    return con.execute(
        "SELECT COUNT(*) c FROM votes v JOIN reviews r ON r.id=v.review_id WHERE r.user_id=? AND v.value=1",
        (uid,),
    ).fetchone()["c"]


# ---------------- импорт заведений из OpenStreetMap ----------------
def build_query() -> str:
    s, w, n, e = IMPORT_BBOX
    box = f"({s},{w},{n},{e})"
    return (
        "[out:json][timeout:120];("
        f'nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub)$"]["name"]{box};'
        f'nwr["shop"~"^(supermarket|convenience|mall|bakery)$"]["name"]{box};'
        ");out center tags;"
    )


def save_elements(elements: list) -> int:
    rows = []
    now = int(time.time())
    for el in elements:
        tags = el.get("tags") or {}
        name = " ".join(str(tags.get("name", "")).split())[:60]
        if not name:
            continue
        lat = el.get("lat") if el.get("lat") is not None else (el.get("center") or {}).get("lat")
        lon = el.get("lon") if el.get("lon") is not None else (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        osm_id = f"{str(el.get('type', 'x'))[0]}{el.get('id')}"
        kind = tags.get("amenity") or tags.get("shop") or ""
        rows.append((osm_id, name, name.lower(), kind, lat, lon, now))
    with db() as con:
        con.executemany(
            "INSERT OR IGNORE INTO venues(osm_id,name,name_l,kind,lat,lon,created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            rows,
        )
        con.execute("INSERT OR REPLACE INTO meta(k,v) VALUES('osm_import',?)", (str(len(rows)),))
    return len(rows)


async def import_osm():
    while True:
        with db() as con:
            done = con.execute("SELECT v FROM meta WHERE k='osm_import'").fetchone()
        if done:
            return
        for url in OVERPASS_URLS:
            try:
                async with httpx.AsyncClient(
                    timeout=180, headers={"User-Agent": "courier-map/1.0"}
                ) as client:
                    resp = await client.post(url, data={"data": build_query()})
                    resp.raise_for_status()
                    elements = resp.json().get("elements", [])
                count = await asyncio.to_thread(save_elements, elements)
                log.info("Импорт из OSM завершён: %s заведений", count)
                return
            except Exception as exc:
                log.warning("Импорт из %s не удался: %s", url, exc)
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if not BOT_TOKEN:
        log.warning("BOT_TOKEN не задан: вход через Telegram работать не будет")
    # По умолчанию карта чистая: заведения добавляют только курьеры.
    # IMPORT_OSM=1 включает автозагрузку заведений из OpenStreetMap.
    pusher = asyncio.create_task(push_loop()) if BOT_TOKEN and os.getenv("PUSH", "1") != "0" else None
    # BOT_POLLING=0 отключает ответы бота (например, если у бота уже есть другая программа)
    botter = asyncio.create_task(bot_loop()) if BOT_TOKEN and os.getenv("BOT_POLLING", "1") != "0" else None
    cleaner = asyncio.create_task(cleanup_loop())
    backuper = asyncio.create_task(backup_loop())
    task = None
    if os.getenv("IMPORT_OSM", "0") == "1":
        task = asyncio.create_task(import_osm())
    else:
        with db() as con:
            # убираем ранее загруженные из OSM заведения, у которых нет отзывов
            n = con.execute(
                "DELETE FROM venues WHERE osm_id IS NOT NULL "
                "AND id NOT IN (SELECT DISTINCT venue_id FROM reviews)"
            ).rowcount
            con.execute("DELETE FROM meta WHERE k='osm_import'")
        if n:
            log.info("Удалено загруженных из OSM заведений без отзывов: %s", n)
    yield
    if task:
        task.cancel()
    if pusher:
        pusher.cancel()
    if botter:
        botter.cancel()
    cleaner.cancel()
    backuper.cancel()


app = FastAPI(lifespan=lifespan)

# сжатие страницы и ответов: на мобильном интернете это секунды при запуске
if GZipMiddleware and hasattr(app, "add_middleware"):
    app.add_middleware(GZipMiddleware, minimum_size=800)

# сколько сервер сам обрабатывает каждый запрос (для раздела «Скорость» в админке)
SERVER_TIMES: deque = deque(maxlen=5000)


async def timing_mw(request, call_next):
    t0 = time.perf_counter()
    resp = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    try:
        resp.headers["Server-Timing"] = f"app;dur={ms:.1f}"
    except Exception:
        pass
    if path.startswith("/api/") and path not in ("/api/perf", "/api/track"):
        SERVER_TIMES.append((time.time(), path, ms))
    return resp


if hasattr(app, "middleware"):
    app.middleware("http")(timing_mw)


# ---------------- страницы ----------------
@app.get("/")
def index():
    return FileResponse(BASE / "index.html")


@app.get("/health")
def health():
    with db() as con:
        n = con.execute("SELECT COUNT(*) c FROM venues").fetchone()["c"]
        imp = con.execute("SELECT v FROM meta WHERE k='osm_import'").fetchone()
    return {"ok": True, "venues": n, "osm_import_done": bool(imp)}


@app.get("/api/config")
def config():
    return {"tags": [{"key": k, "label": v[0], "good": v[1]} for k, v in TAGS.items()],
            "xp": {**XP, "text_min": TEXT_MIN},
            "pois": [{"key": k, "label": v[0], "icon": v[1], "color": v[2]} for k, v in POI_KINDS.items()]}


@app.get("/api/me")
def me(u: dict = Depends(current_user)):
    uid = u["id"]
    with db() as con:
        sync_level(con, uid)
        st = user_stats(con, uid)
        xp = st["xp"]
        allx = all_xp(con)
        people = con.execute("SELECT tg_id, name, pub_id FROM users WHERE banned=0 AND deleted=0").fetchall()
        rank = sum(1 for p in people if allx.get(p["tg_id"], 0) > xp) + 1
        top = sorted(({"tg_id": p["tg_id"], "name": p["name"], "pub_id": p["pub_id"], "xp": allx.get(p["tg_id"], 0)}
                      for p in people if allx.get(p["tg_id"], 0) > 0), key=lambda r: -r["xp"])[:10]
    idx = level_index(xp)
    nxt = LEVELS[idx + 1][0] if idx + 1 < len(LEVELS) else None
    st["level"] = idx + 1
    with db() as con:
        prefs = con.execute("SELECT push_enabled, accepted_version FROM users WHERE tg_id=?", (uid,)).fetchone()
        online = con.execute("SELECT COUNT(*) FROM users WHERE banned=0 AND deleted=0 AND last_seen>?",
                             (int(time.time()) - 300,)).fetchone()[0]
    return {
        "id": uid, "pid": u["pid"], "name": u["name"], "is_admin": u["is_admin"],
        "accepted": prefs["accepted_version"] >= CONSENT_VERSION, "push_enabled": bool(prefs["push_enabled"]),
        "online": online,
        "muted_until": u["muted_until"] if u["muted_until"] > time.time() else 0,
        "points": st["helpful"], "reviews": st["reviews"], "venues": st["venues"],
        "stats": {k: v for k, v in st.items() if k != "xp"},
        "xp": xp, "rank": rank,
        "level": LEVELS[idx][1], "level_icon": LEVELS[idx][2], "level_n": idx + 1,
        "level_from": LEVELS[idx][0], "level_to": nxt,
        "levels": [{"n": i + 1, "xp": need, "name": name, "icon": icon}
                   for i, (need, name, icon) in enumerate(LEVELS)],
        "xp_rules": [{"key": key, "icon": ic, "label": label, "xp": XP[key]} for ic, label, key in XP_RULES],
        "achievements": [{"key": k, "icon": ic, "title": t, "value": min(st[stat], goal), "goal": goal,
                          "stat": stat, "unit": unit, "done": st[stat] >= goal}
                         for k, ic, t, stat, goal, unit in ACHIEVEMENTS],
        "top": [{"name": r["name"], "pid": r["pub_id"], "xp": r["xp"], "icon": level_icon(r["xp"]),
                 "me": r["tg_id"] == uid}
                for r in top],
    }


# ---------------- заведения ----------------
@app.get("/api/venues")
def venues(s: float, w: float, n: float, e: float, u: dict = Depends(current_user)):
    if (n - s) > 0.2 or (e - w) > 0.3:
        raise HTTPException(400, "Слишком большая область")
    with db() as con:
        rows = con.execute(
            f"""SELECT v.id, v.name, v.kind, v.lat, v.lon, AVG(r.rating) AS avg, COUNT(r.id) AS cnt,
                 {_LIVE_TOP} AS live
               FROM venues v LEFT JOIN reviews r ON r.venue_id=v.id
               WHERE v.lat BETWEEN ? AND ? AND v.lon BETWEEN ? AND ?
               GROUP BY v.id ORDER BY cnt DESC LIMIT 800""",
            (int(time.time()), s, n, w, e),
        ).fetchall()
    return [
        {"id": r["id"], "name": r["name"], "kind": r["kind"], "lat": r["lat"], "lon": r["lon"],
         "avg": r["avg"], "count": r["cnt"], "live": r["live"]}
        for r in rows
    ]


@app.get("/api/search")
def search(q: str = Query(min_length=2, max_length=60), u: dict = Depends(current_user)):
    like = "%" + q.strip().lower().replace("%", "").replace("_", "") + "%"
    with db() as con:
        rows = con.execute(
            "SELECT id,name,kind,lat,lon FROM venues WHERE name_l LIKE ? "
            "ORDER BY length(name_l) LIMIT 20",
            (like,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/venues/{vid}")
def venue_detail(vid: int, u: dict = Depends(current_user)):
    with db() as con:
        v = con.execute("SELECT id,name,kind,lat,lon,added_by FROM venues WHERE id=?", (vid,)).fetchone()
        if not v:
            raise HTTPException(404, "Заведение не найдено")
        agg = con.execute(
            "SELECT AVG(rating) a, COUNT(*) c FROM reviews WHERE venue_id=?", (vid,)
        ).fetchone()
        counts: dict = {}
        for row in con.execute("SELECT tags FROM reviews WHERE venue_id=?", (vid,)):
            for t in filter(None, row["tags"].split(",")):
                counts[t] = counts.get(t, 0) + 1
        hide_at = get_settings(con)["report_hide"]
        xpm = xp_for_icons(con)
        revs = con.execute(
            f"""SELECT r.id, r.rating, r.tags, r.text, r.created_at, r.updated_at, r.update_reason,
                 r.user_id, u.name AS author, u.pub_id AS author_pid,
                 (SELECT h.rating FROM review_history h WHERE h.review_id=r.id
                    ORDER BY h.archived_at DESC LIMIT 1) AS prev_rating,
                 (SELECT COUNT(*) FROM votes v WHERE v.review_id=r.id AND v.value=1) AS helpful,
                 (SELECT COUNT(*) FROM votes v WHERE v.review_id=r.id AND v.value=-1) AS down,
                 COALESCE((SELECT v.value FROM votes v WHERE v.review_id=r.id AND v.user_id=?), 0) AS my_vote,
                 0 AS xp
               FROM reviews r JOIN users u ON u.tg_id=r.user_id
               WHERE r.venue_id=?
                 AND (SELECT COUNT(*) FROM reports p WHERE p.kind='review' AND p.ref_id=r.id) < ?
               ORDER BY (helpful - down) DESC, r.created_at DESC LIMIT 100""",
            (u["id"], vid, hide_at),
        ).fetchall()
        last = con.execute(
            """SELECT name, pid, ts, kind FROM (
                 SELECT u.name, u.pub_id AS pid, r.created_at AS ts, 'review' AS kind FROM reviews r
                   JOIN users u ON u.tg_id=r.user_id WHERE r.venue_id=?
                 UNION ALL SELECT u.name, u.pub_id, r.updated_at, 'update' FROM reviews r
                   JOIN users u ON u.tg_id=r.user_id WHERE r.venue_id=? AND r.updated_at>0
                 UNION ALL SELECT u.name, u.pub_id, c.created_at, 'confirm' FROM confirmations c
                   JOIN users u ON u.tg_id=c.user_id WHERE c.venue_id=?
               ) ORDER BY ts DESC,
                 CASE kind WHEN 'confirm' THEN 3 WHEN 'update' THEN 2 ELSE 1 END DESC LIMIT 1""",
            (vid, vid, vid)).fetchone()
        my_conf = con.execute(
            "SELECT MAX(created_at) t FROM confirmations WHERE venue_id=? AND user_id=?",
            (vid, u["id"])).fetchone()["t"] or 0
        adder = con.execute("SELECT name, pub_id FROM users WHERE tg_id=?",
                            (v["added_by"],)).fetchone() if v["added_by"] else None
        comments: dict = {}
        rids = [r["id"] for r in revs]
        if rids:
            marks = ",".join("?" * len(rids))
            for c in con.execute(
                    f"SELECT c.id, c.review_id, c.text, c.created_at, c.user_id, u.name, u.pub_id "
                    f"FROM comments c JOIN users u ON u.tg_id=c.user_id "
                    f"WHERE c.deleted=0 AND c.review_id IN ({marks}) "
                    f"AND (SELECT COUNT(*) FROM reports p WHERE p.kind='comment' AND p.ref_id=c.id) < ? "
                    f"ORDER BY c.id", (*rids, hide_at)):
                comments.setdefault(c["review_id"], []).append({
                    "id": c["id"], "text": c["text"], "ts": c["created_at"], "author": c["name"],
                    "pid": c["pub_id"], "mine": c["user_id"] == u["id"]})
    now = int(time.time())
    with db() as con:
        live = live_for(con, vid, u["id"])
        qa = venue_qa(con, vid)
    vd = dict(v)
    vd.pop("added_by", None)
    return {
        "live": live,
        "qa_count": sum(len(x["answers"]) for x in qa["answered"]),
        "venue": {**vd, "avg": agg["a"], "count": agg["c"],
                  "added_by": {"name": adder["name"], "pid": adder["pub_id"]} if adder else None,
                  "last_update": dict(last) if last else None,
                  "my_confirm_next": my_conf + CONFIRM_EVERY if my_conf and my_conf + CONFIRM_EVERY > now else 0},
        "tags": sorted(
            [{"key": k, "n": n} for k, n in counts.items() if k in TAGS], key=lambda x: -x["n"]
        ),
        "reviews": [
            {
                "id": r["id"], "author": r["author"], "level": level_for(xpm.get(r["user_id"], 0)),
                "level_icon": level_icon(xpm.get(r["user_id"], 0)),
                "rating": r["rating"], "tags": [t for t in r["tags"].split(",") if t in TAGS],
                "text": r["text"], "ts": r["created_at"], "helpful": r["helpful"],
                "voted": r["my_vote"] == 1, "my_vote": r["my_vote"], "down": r["down"],
                "author_pid": r["author_pid"], "comments": comments.get(r["id"], [])[-30:],
                "mine": r["user_id"] == u["id"],
                "updated_at": r["updated_at"], "update_reason": UPDATE_REASONS.get(r["update_reason"], ""),
                "prev_rating": r["prev_rating"],
                **({"grace_until": r["created_at"] + REVIEW_GRACE if not r["updated_at"] else 0,
                    "next_update": (r["updated_at"] or r["created_at"]) + REVIEW_UPDATE_EVERY}
                   if r["user_id"] == u["id"] else {}),
            }
            for r in revs
        ],
    }


class VenueIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@app.post("/api/venues")
def add_venue(body: VenueIn, u: dict = Depends(current_user)):
    name = " ".join(body.name.split())
    if len(name) < 2:
        raise HTTPException(400, "Слишком короткое название")
    name_l = name.lower()
    with db() as con:
        err = check_text(name, get_settings(con), u["is_admin"])
        if err:
            raise HTTPException(400, err)
        dup = con.execute(
            "SELECT id FROM venues WHERE name_l=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (name_l, body.lat - 0.0004, body.lat + 0.0004, body.lon - 0.0007, body.lon + 0.0007),
        ).fetchone()
        if dup:
            return {"id": dup["id"], "existing": True}
        today = con.execute(
            "SELECT COUNT(*) c FROM venues WHERE added_by=? AND created_at>?",
            (u["id"], int(time.time()) - 86400),
        ).fetchone()["c"]
        if today >= 10:
            raise HTTPException(429, "Не больше 10 новых заведений в сутки")
        cur = con.execute(
            "INSERT INTO venues(name,name_l,kind,lat,lon,added_by,created_at) VALUES(?,?,?,?,?,?,?)",
            (name, name_l, "added", body.lat, body.lon, u["id"], int(time.time())),
        )
        return {"id": cur.lastrowid, "existing": False}


# ---------------- отзывы ----------------
UPDATE_REASONS = {
    "staff": "Сменился персонал", "rules": "Изменились правила выдачи",
    "repair": "Ремонт или переезд", "other": "Другое",
}
REVIEW_GRACE = 30 * 60               # первые 30 минут можно просто исправить
REVIEW_UPDATE_EVERY = 7 * 86400      # дальше обновление не чаще раза в 7 дней
CONFIRM_EVERY = 30 * 86400           # подтверждать актуальность одного заведения раз в 30 дней
CONFIRM_PER_DAY = 15


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    tags: list[str] = []
    text: str = Field(default="", max_length=500)
    reason: str = Field(default="", pattern="^(|staff|rules|repair|other)$")


@app.post("/api/venues/{vid}/reviews")
def add_review(vid: int, body: ReviewIn, u: dict = Depends(current_user)):
    tags = ",".join(t for t in dict.fromkeys(body.tags) if t in TAGS)
    text = body.text.strip()
    now = int(time.time())
    with db() as con:
        if not con.execute("SELECT 1 FROM venues WHERE id=?", (vid,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        err = check_text(text, get_settings(con), u["is_admin"])
        if err:
            raise HTTPException(400, err)
        old = con.execute(
            "SELECT id, rating, tags, text, created_at, updated_at FROM reviews WHERE venue_id=? AND user_id=?",
            (vid, u["id"])).fetchone()
        if not old:
            ven = con.execute("SELECT name, lat, lon, added_by FROM venues WHERE id=?", (vid,)).fetchone()
            first_other = ven["added_by"] and ven["added_by"] != u["id"] and not con.execute(
                "SELECT 1 FROM reviews WHERE venue_id=? AND user_id!=?", (vid, ven["added_by"])).fetchone()
            con.execute(
                "INSERT INTO reviews(venue_id,user_id,rating,tags,text,created_at) VALUES(?,?,?,?,?,?)",
                (vid, u["id"], body.rating, tags, text, now))
            if first_other:
                notify(con, ven["added_by"], "venue_ok",
                       f"{u['name']}: отзыв о добавленном вами заведении «{ven['name']}» · +{XP['venue_ok']} XP",
                       {"venue": vid, "lat": ven["lat"], "lon": ven["lon"]}, actor=u["id"], dedupe=f"vok:{vid}")
            return {"ok": True, "mode": "new"}
        if (old["rating"], old["tags"], old["text"]) == (body.rating, tags, text):
            raise HTTPException(400, "Ничего не изменилось")
        if not old["updated_at"] and now - old["created_at"] <= REVIEW_GRACE:
            con.execute("UPDATE reviews SET rating=?, tags=?, text=? WHERE id=?",
                        (body.rating, tags, text, old["id"]))
            return {"ok": True, "mode": "fix"}
        last = old["updated_at"] or old["created_at"]
        wait = REVIEW_UPDATE_EVERY - (now - last)
        if wait > 0 and not u["is_admin"]:
            raise HTTPException(429, f"Обновить отзыв можно через {math.ceil(wait / 86400)} дн.")
        if not body.reason:
            raise HTTPException(400, "Укажите, что изменилось")
        con.execute(
            "INSERT INTO review_history(review_id,user_id,venue_id,rating,tags,text,version_at,archived_at) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (old["id"], u["id"], vid, old["rating"], old["tags"], old["text"], last, now))
        con.execute(
            "UPDATE reviews SET rating=?, tags=?, text=?, updated_at=?, update_reason=? WHERE id=?",
            (body.rating, tags, text, now, body.reason, old["id"]))
    return {"ok": True, "mode": "update"}


@app.post("/api/venues/{vid}/confirm")
def confirm_venue(vid: int, u: dict = Depends(current_user)):
    now = int(time.time())
    with db() as con:
        if not con.execute("SELECT 1 FROM venues WHERE id=?", (vid,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        if not con.execute("SELECT 1 FROM reviews WHERE venue_id=?", (vid,)).fetchone():
            raise HTTPException(400, "Пока нечего подтверждать: у заведения нет отзывов")
        last = con.execute(
            "SELECT MAX(created_at) t FROM confirmations WHERE venue_id=? AND user_id=?",
            (vid, u["id"])).fetchone()["t"]
        if last and now - last < CONFIRM_EVERY:
            days = math.ceil((CONFIRM_EVERY - (now - last)) / 86400)
            raise HTTPException(429, f"Вы уже подтверждали. Снова можно через {days} дн.")
        today = con.execute(
            "SELECT COUNT(*) c FROM confirmations WHERE user_id=? AND created_at>?",
            (u["id"], now - 86400)).fetchone()["c"]
        if today >= CONFIRM_PER_DAY:
            raise HTTPException(429, f"Не больше {CONFIRM_PER_DAY} подтверждений в сутки")
        con.execute("INSERT INTO confirmations(venue_id,user_id,created_at) VALUES(?,?,?)", (vid, u["id"], now))
    return {"ok": True}


def _vote_review(rid: int, value: int, u: dict) -> dict:
    with db() as con:
        r = con.execute(
            "SELECT r.user_id, r.venue_id, v.name, v.lat, v.lon FROM reviews r "
            "JOIN venues v ON v.id=r.venue_id WHERE r.id=?", (rid,)).fetchone()
        if not r:
            raise HTTPException(404, "Отзыв не найден")
        if r["user_id"] == u["id"]:
            raise HTTPException(400, "Нельзя оценивать свой отзыв")
        had = con.execute("SELECT value FROM votes WHERE review_id=? AND user_id=?", (rid, u["id"])).fetchone()
        if had and had["value"] == value:
            con.execute("DELETE FROM votes WHERE review_id=? AND user_id=?", (rid, u["id"]))
            my = 0
        elif had:
            con.execute("UPDATE votes SET value=?, created_at=? WHERE review_id=? AND user_id=?",
                        (value, int(time.time()), rid, u["id"]))
            my = value
        else:
            con.execute("INSERT INTO votes(review_id,user_id,value,created_at) VALUES(?,?,?,?)",
                        (rid, u["id"], value, int(time.time())))
            my = value
        if my:
            text = (f"{u['name']}: 👍 ваш отзыв о «{r['name']}» полезен · +{XP['helpful']} XP" if my == 1
                    else f"{u['name']}: 👎 к вашему отзыву о «{r['name']}»")
            notify(con, r["user_id"], "vote", text, {"venue": r["venue_id"], "lat": r["lat"], "lon": r["lon"]},
                   actor=u["id"], dedupe=f"rv:{rid}:{u['id']}:{my}")
        up = con.execute("SELECT COUNT(*) c FROM votes WHERE review_id=? AND value=1", (rid,)).fetchone()["c"]
        down = con.execute("SELECT COUNT(*) c FROM votes WHERE review_id=? AND value=-1", (rid,)).fetchone()["c"]
    return {"helpful": up, "down": down, "my_vote": my, "voted": my == 1}


class VoteIn(BaseModel):
    value: int = Field(ge=-1, le=1)


@app.post("/api/reviews/{rid}/vote")
def vote_review(rid: int, body: VoteIn, u: dict = Depends(current_user)):
    if body.value == 0:
        raise HTTPException(400, "Неверная оценка")
    return _vote_review(rid, body.value, u)


@app.post("/api/reviews/{rid}/helpful")
def helpful(rid: int, u: dict = Depends(current_user)):
    return _vote_review(rid, 1, u)


# ---------------- комментарии к отзывам ----------------
class CommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)


@app.post("/api/reviews/{rid}/comments")
def add_comment(rid: int, body: CommentIn, u: dict = Depends(current_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Пустой комментарий")
    now = int(time.time())
    with db() as con:
        r = con.execute(
            "SELECT r.user_id, r.venue_id, v.name, v.lat, v.lon FROM reviews r "
            "JOIN venues v ON v.id=r.venue_id WHERE r.id=?", (rid,)).fetchone()
        if not r:
            raise HTTPException(404, "Отзыв не найден")
        if not u["is_admin"]:
            if u["muted_until"] > now:
                raise HTTPException(403, "Вам временно запрещено писать")
            last = con.execute("SELECT MAX(created_at) t FROM comments WHERE user_id=?", (u["id"],)).fetchone()["t"]
            if last and now - last < 10:
                raise HTTPException(429, {"msg": f"Подождите {10 - (now - last)} с", "wait": 10 - (now - last)})
            err = check_text(text, get_settings(con), False)
            if err:
                raise HTTPException(400, err)
        cur = con.execute("INSERT INTO comments(review_id,user_id,text,created_at) VALUES(?,?,?,?)",
                          (rid, u["id"], text, now))
        notify(con, r["user_id"], "comment",
               f"{u['name']}: ответ на ваш отзыв о «{r['name']}»: {text[:80]}",
               {"venue": r["venue_id"], "lat": r["lat"], "lon": r["lon"]}, actor=u["id"])
    return {"id": cur.lastrowid, "text": text, "ts": now, "author": u["name"], "pid": u["pid"], "mine": True}


@app.post("/api/comments/{cid}/delete")
def delete_comment(cid: int, u: dict = Depends(current_user)):
    with db() as con:
        c = con.execute("SELECT user_id FROM comments WHERE id=? AND deleted=0", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "Комментарий не найден")
        if c["user_id"] != u["id"] and not u["is_admin"]:
            raise HTTPException(403, "Можно удалять только свои комментарии")
        con.execute("UPDATE comments SET deleted=1 WHERE id=?", (cid,))
    return {"ok": True}


class ReportIn(BaseModel):
    kind: str = Field(pattern="^(review|message|comment|poi|beacon)$")
    ref_id: int
    reason: str = Field(default="other", pattern="^(spam|abuse|other)$")


def _owner_of(con, kind: str, ref_id: int):
    if kind == "beacon":
        r = con.execute("SELECT user_id FROM beacons WHERE id=?", (ref_id,)).fetchone()
    elif kind == "poi":
        r = con.execute("SELECT added_by AS user_id FROM pois WHERE id=? AND deleted=0", (ref_id,)).fetchone()
    elif kind == "comment":
        r = con.execute("SELECT user_id FROM comments WHERE id=? AND deleted=0", (ref_id,)).fetchone()
    elif kind == "message":
        r = con.execute("SELECT user_id FROM messages WHERE id=? AND deleted=0", (ref_id,)).fetchone()
    else:
        r = con.execute("SELECT user_id FROM reviews WHERE id=?", (ref_id,)).fetchone()
    return r["user_id"] if r else None


@app.post("/api/report")
def report(body: ReportIn, u: dict = Depends(current_user)):
    with db() as con:
        owner = _owner_of(con, body.kind, body.ref_id)
        if owner is None:
            raise HTTPException(404, "Не найдено")
        if owner == u["id"]:
            raise HTTPException(400, "Нельзя пожаловаться на своё")
        con.execute(
            "INSERT OR IGNORE INTO reports(kind,ref_id,user_id,created_at,reason,target_user) VALUES(?,?,?,?,?,?)",
            (body.kind, body.ref_id, u["id"], int(time.time()), body.reason, owner),
        )
        auto_moderate(con, owner)
    return {"ok": True}


def auto_moderate(con, target: int):
    """Если за сутки на человека пожаловались N разных людей, временно ограничиваем его на 24 часа."""
    limit = get_settings(con)["auto_mute_reports"]
    if not limit or target in ADMIN_IDS:
        return
    now = int(time.time())
    n = con.execute("SELECT COUNT(DISTINCT user_id) FROM reports WHERE target_user=? AND created_at>?",
                    (target, now - 86400)).fetchone()[0]
    row = con.execute("SELECT name, muted_until FROM users WHERE tg_id=?", (target,)).fetchone()
    if n < limit or not row or row["muted_until"] > now:
        return
    con.execute("UPDATE users SET muted_until=? WHERE tg_id=?", (now + 86400, target))
    notify(con, target, "automute", "Из-за жалоб других курьеров вам временно ограничили чат и публикации на 24 часа",
           {"profile": "me"})
    for aid in ADMIN_IDS:
        notify(con, aid, "admin_automute", f"Автомодерация: {row['name']} ограничен на 24 ч ({n} жалоб за сутки)",
               {"admin": "news"}, dedupe=f"am:{target}:{now // 86400}")


# ---------------- общий чат ----------------
class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    reply_to: int = 0


_MSG_SELECT = (
    "SELECT m.id, m.text, m.created_at, m.user_id, m.reply_to, u.name, u.pub_id, "
    "rm.text AS r_text, rm.deleted AS r_del, rm.user_id AS r_uid, ru.name AS r_name, rm.venue_id AS r_venue, "
    "m.venue_id, qv.name AS v_name, qv.kind AS v_kind, qv.lat AS v_lat, qv.lon AS v_lon, "
    "(SELECT AVG(rating) FROM reviews rv WHERE rv.venue_id=m.venue_id) AS v_avg, "
    "(SELECT COUNT(*) FROM reviews rv WHERE rv.venue_id=m.venue_id) AS v_cnt FROM messages m "
    "JOIN users u ON u.tg_id=m.user_id "
    "LEFT JOIN messages rm ON rm.id=m.reply_to LEFT JOIN users ru ON ru.tg_id=rm.user_id "
    "LEFT JOIN venues qv ON qv.id=m.venue_id "
)
_HIDDEN = "(SELECT COUNT(*) FROM reports p WHERE p.kind='message' AND p.ref_id=m.id)"


def _votes_for(con, ids, uid) -> dict:
    """Лайки и дизлайки сообщений: {id: [👍, 👎, мой голос]}."""
    ids = [int(i) for i in ids]
    if not ids:
        return {}
    out = {i: [0, 0, 0] for i in ids}
    marks = ",".join("?" * len(ids))
    for r in con.execute(f"SELECT message_id, user_id, value FROM message_votes WHERE message_id IN ({marks})", ids):
        v = out[r["message_id"]]
        v[0 if r["value"] == 1 else 1] += 1
        if r["user_id"] == uid:
            v[2] = r["value"]
    return out


def _msg_row(r, u, votes: dict = None, xpm: dict = None):
    d = {"id": r["id"], "text": r["text"], "ts": r["created_at"], "author": r["name"],
         "mine": r["user_id"] == u["id"], "admin": r["user_id"] in ADMIN_IDS, "pid": r["pub_id"],
         "level_icon": level_icon((xpm or {}).get(r["user_id"], 0))}
    v = (votes or {}).get(r["id"], [0, 0, 0])
    d.update(up=v[0], down=v[1], my_vote=v[2])
    if r["venue_id"] and r["v_name"]:
        d["venue"] = {"id": r["venue_id"], "name": r["v_name"], "kind": r["v_kind"], "lat": r["v_lat"], "lon": r["v_lon"],
                      "avg": r["v_avg"], "count": r["v_cnt"]}
    if r["reply_to"]:
        d["answers_question"] = bool(r["r_venue"])
        gone = r["r_text"] is None or r["r_del"]
        d["reply"] = {"id": r["reply_to"], "author": r["r_name"] or "", "text": "Сообщение удалено" if gone else r["r_text"][:120]}
        d["to_me"] = (not gone) and r["r_uid"] == u["id"] and r["user_id"] != u["id"]
    if u["is_admin"]:
        d["uid"] = r["user_id"]
    return d


CHAT_PAGE = 50


@app.get("/api/chat")
def chat_list(after: int = 0, before: int = 0, u: dict = Depends(current_user)):
    with db() as con:
        st = get_settings(con)
        where = f"WHERE m.deleted=0 AND {_HIDDEN} < ? "
        if after > 0:                              # новые сообщения при опросе
            rows = con.execute(_MSG_SELECT + where + "AND m.id>? ORDER BY m.id LIMIT 100",
                               (st["report_hide"], after)).fetchall()
        elif before > 0:                           # более старые при прокрутке вверх
            rows = con.execute(_MSG_SELECT + where + "AND m.id<? ORDER BY m.id DESC LIMIT ?",
                               (st["report_hide"], before, CHAT_PAGE)).fetchall()[::-1]
        else:                                      # первое открытие
            rows = con.execute(_MSG_SELECT + where + "ORDER BY m.id DESC LIMIT ?",
                               (st["report_hide"], CHAT_PAGE)).fetchall()[::-1]
        has_more = False
        if after <= 0 and rows:
            has_more = con.execute("SELECT 1 FROM messages WHERE deleted=0 AND id<? LIMIT 1",
                                   (rows[0]["id"],)).fetchone() is not None
        removed = [r["id"] for r in con.execute(
            f"SELECT m.id FROM messages m WHERE m.id > (SELECT COALESCE(MAX(id),0) - 300 FROM messages) "
            f"AND (m.deleted=1 OR {_HIDDEN} >= ?)", (st["report_hide"],))]
        online = con.execute("SELECT COUNT(*) c FROM users WHERE banned=0 AND last_seen>?",
                             (int(time.time()) - 300,)).fetchone()["c"]
        # голоса: у отданных сообщений и у недавних, где голоса могли поменяться
        recent = [r[0] for r in con.execute(
            "SELECT DISTINCT message_id FROM message_votes WHERE message_id > (SELECT COALESCE(MAX(id),0) - 300 FROM messages)")]
        votes = _votes_for(con, list({r["id"] for r in rows} | set(recent)), u["id"])
        min_likes = st["qa_min_likes"]
        xpm = xp_for_icons(con)
    now = time.time()
    return {
        "messages": [_msg_row(r, u, votes, xpm) for r in rows],
        "votes": {str(k): v for k, v in votes.items() if k in set(recent)},
        "qa_min_likes": min_likes,
        "has_more": has_more,
        "retention_days": st["chat_retention_days"],
        "removed": removed,
        "online": online,
        "cooldown": 0 if u["is_admin"] else st["chat_cooldown"],
        "readonly": st["chat_readonly"] and not u["is_admin"],
        "muted_until": u["muted_until"] if (u["muted_until"] > now and not u["is_admin"]) else 0,
    }


def _post_message(u: dict, text: str, reply_to: int = 0, venue_id: int = 0) -> dict:
    text = (text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    now = int(time.time())
    with db() as con:
        st = get_settings(con)
        if not u["is_admin"]:
            if st["chat_readonly"]:
                raise HTTPException(403, "Чат сейчас только для чтения")
            if u["muted_until"] > now:
                if u["muted_until"] >= FOREVER:
                    raise HTTPException(403, "Вам запрещено писать в чат")
                mins = math.ceil((u["muted_until"] - now) / 60)
                raise HTTPException(403, f"Вы не можете писать в чат ещё {mins} мин")
            last = con.execute(
                "SELECT text, created_at FROM messages WHERE user_id=? ORDER BY id DESC LIMIT 1",
                (u["id"],),
            ).fetchone()
            if last:
                wait = st["chat_cooldown"] - (now - last["created_at"])
                if wait > 0:
                    raise HTTPException(429, {"msg": f"Следующее сообщение через {wait} с", "wait": wait})
                if last["text"].strip().lower() == text.lower() and now - last["created_at"] < 600:
                    raise HTTPException(429, "Не повторяйте одно и то же сообщение")
            err = check_text(text, st, False)
            if err:
                raise HTTPException(400, err)
        target = None
        if reply_to:
            target = con.execute("SELECT id, user_id FROM messages WHERE id=? AND deleted=0",
                                 (int(reply_to),)).fetchone()
            if not target:
                raise HTTPException(404, "Сообщение, на которое вы отвечаете, удалено")
        if venue_id and not con.execute("SELECT 1 FROM venues WHERE id=?", (venue_id,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        cur = con.execute(
            "INSERT INTO messages(user_id,text,created_at,reply_to,venue_id) VALUES(?,?,?,?,?)",
            (u["id"], text, now, target["id"] if target else 0, int(venue_id or 0)))
        if target:
            notify(con, target["user_id"], "chat_reply", f"{u['name']}: ответ вам в чате: {text[:100]}",
                   {"chat": cur.lastrowid}, actor=u["id"])
        r = con.execute(_MSG_SELECT + "WHERE m.id=?", (cur.lastrowid,)).fetchone()
        return _msg_row(r, u, _votes_for(con, [cur.lastrowid], u["id"]), xp_for_icons(con))


@app.post("/api/chat")
def chat_send(body: ChatIn, u: dict = Depends(current_user)):
    return _post_message(u, body.text, int(getattr(body, "reply_to", 0) or 0))


class AskIn(BaseModel):
    text: str = Field(min_length=3, max_length=500)


@app.post("/api/venues/{vid}/ask")
def venue_ask(vid: int, body: AskIn, u: dict = Depends(current_user)):
    """Вопрос о заведении: уходит в общий чат с карточкой заведения."""
    if len((body.text or "").strip()) < 3:
        raise HTTPException(400, "Сформулируйте вопрос подробнее")
    return _post_message(u, body.text, 0, vid)


@app.post("/api/chat/{mid}/vote")
def chat_vote(mid: int, body: VoteIn, u: dict = Depends(current_user)):
    if body.value == 0:
        raise HTTPException(400, "Неверная оценка")
    with db() as con:
        m = con.execute("SELECT id, user_id, reply_to, text, created_at FROM messages WHERE id=? AND deleted=0",
                        (mid,)).fetchone()
        if not m:
            raise HTTPException(404, "Сообщение не найдено")
        if m["user_id"] == u["id"]:
            raise HTTPException(400, "Нельзя оценивать своё сообщение")
        had = con.execute("SELECT value FROM message_votes WHERE message_id=? AND user_id=?", (mid, u["id"])).fetchone()
        if had and had["value"] == body.value:
            con.execute("DELETE FROM message_votes WHERE message_id=? AND user_id=?", (mid, u["id"]))
        else:
            con.execute("INSERT OR REPLACE INTO message_votes(message_id,user_id,value,created_at) VALUES(?,?,?,?)",
                        (mid, u["id"], body.value, int(time.time())))
        v = _votes_for(con, [mid], u["id"])[mid]
        accepted = _sync_answer(con, m, v[0])
    return {"up": v[0], "down": v[1], "my_vote": v[2], "accepted": accepted}


def _sync_answer(con, m, up: int) -> bool:
    """Ответ на вопрос о заведении с нужным числом 👍 попадает в карточку заведения (и убирается, если лайков стало меньше)."""
    if not m["reply_to"]:
        return False
    q = con.execute("SELECT id, user_id, text, venue_id, created_at FROM messages WHERE id=? AND venue_id>0 AND deleted=0",
                    (m["reply_to"],)).fetchone()
    if not q:
        return False
    need = get_settings(con)["qa_min_likes"]
    ex = con.execute("SELECT id FROM venue_answers WHERE answer_id=?", (m["id"],)).fetchone()
    if up >= need:
        if ex:
            con.execute("UPDATE venue_answers SET likes=? WHERE id=?", (up, ex["id"]))
        else:
            con.execute(
                "INSERT INTO venue_answers(venue_id,question_id,question_text,question_user,question_at,answer_id,"
                "answer_text,answer_user,likes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (q["venue_id"], q["id"], q["text"], q["user_id"], q["created_at"], m["id"], m["text"], m["user_id"],
                 up, int(time.time())))
            vn = con.execute("SELECT name, lat, lon FROM venues WHERE id=?", (q["venue_id"],)).fetchone()
            notify(con, m["user_id"], "qa_ok",
                   f"Ваш ответ попал в карточку «{vn['name'] if vn else 'заведения'}» · +{XP['qa']} XP",
                   {"venue": q["venue_id"], "lat": vn["lat"] if vn else None, "lon": vn["lon"] if vn else None},
                   dedupe=f"qa:{m['id']}")
        return True
    if ex:
        con.execute("DELETE FROM venue_answers WHERE id=?", (ex["id"],))
    return False


@app.post("/api/chat/{mid}/delete")
def chat_delete(mid: int, u: dict = Depends(current_user)):
    with db() as con:
        owner = _owner_of(con, "message", mid)
        if owner is None:
            raise HTTPException(404, "Сообщение не найдено")
        if owner != u["id"] and not u["is_admin"]:
            raise HTTPException(403, "Можно удалять только свои сообщения")
        con.execute("UPDATE messages SET deleted=1 WHERE id=?", (mid,))
        con.execute("DELETE FROM venue_answers WHERE answer_id=?", (mid,))
    return {"ok": True}


# ---------------- админка ----------------
class SettingsIn(BaseModel):
    chat_cooldown: int = Field(ge=0, le=3600)
    allow_links: bool
    filter_profanity: bool
    report_hide: int = Field(ge=1, le=100)
    chat_readonly: bool
    stop_words: str = Field(default="", max_length=3000)
    beacon_min_level: int = Field(default=1, ge=1, le=10)
    beacon_radius_km: int = Field(default=1, ge=1, le=20)
    auto_mute_reports: int = Field(default=5, ge=0, le=50)
    chat_retention_days: int = Field(default=90, ge=0, le=3650)
    backup_send: bool = True
    qa_min_likes: int = Field(default=3, ge=1, le=20)


@app.get("/api/admin/settings")
def admin_settings(u: dict = Depends(admin_user)):
    with db() as con:
        st = get_settings(con)
    return {
        "chat_cooldown": st["chat_cooldown"], "allow_links": st["allow_links"],
        "filter_profanity": st["filter_profanity"], "report_hide": st["report_hide"],
        "chat_readonly": st["chat_readonly"], "stop_words": st["stop_words_raw"],
        "beacon_min_level": st["beacon_min_level"], "beacon_radius_km": st["beacon_radius_km"],
        "auto_mute_reports": st["auto_mute_reports"], "chat_retention_days": st["chat_retention_days"],
        "backup_send": st["backup_send"], "qa_min_likes": st["qa_min_likes"],
    }


@app.post("/api/admin/settings")
def admin_save_settings(body: SettingsIn, u: dict = Depends(admin_user)):
    vals = {
        "chat_cooldown": str(body.chat_cooldown),
        "allow_links": "1" if body.allow_links else "0",
        "filter_profanity": "1" if body.filter_profanity else "0",
        "report_hide": str(body.report_hide),
        "chat_readonly": "1" if body.chat_readonly else "0",
        "stop_words": body.stop_words.strip(),
        "beacon_min_level": str(getattr(body, "beacon_min_level", 1) or 1),
        "beacon_radius_km": str(getattr(body, "beacon_radius_km", 1) or 1),
        "auto_mute_reports": str(getattr(body, "auto_mute_reports", 5)),
        "chat_retention_days": str(getattr(body, "chat_retention_days", 90)),
        "backup_send": "1" if getattr(body, "backup_send", True) else "0",
        "qa_min_likes": str(getattr(body, "qa_min_likes", 3) or 3),
    }
    with db() as con:
        con.executemany("INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)", list(vals.items()))
    return {"ok": True}


@app.get("/api/admin/reports")
def admin_reports(u: dict = Depends(admin_user)):
    out = []
    with db() as con:
        groups = con.execute(
            "SELECT kind, ref_id, COUNT(*) n, GROUP_CONCAT(reason) reasons, MAX(created_at) last "
            "FROM reports GROUP BY kind, ref_id ORDER BY last DESC LIMIT 100"
        ).fetchall()
        for g in groups:
            if g["kind"] == "beacon":
                r = con.execute(
                    "SELECT b.note AS text, b.user_id, u.name FROM beacons b JOIN users u ON u.tg_id=b.user_id "
                    "WHERE b.id=?", (g["ref_id"],)).fetchone()
                if not r:
                    con.execute("DELETE FROM reports WHERE kind='beacon' AND ref_id=?", (g["ref_id"],))
                    continue
                where = "Маячок «на линии»"
            elif g["kind"] == "poi":
                r = con.execute(
                    "SELECT p.note AS text, p.kind AS pkind, p.added_by AS user_id, p.deleted, u.name FROM pois p "
                    "JOIN users u ON u.tg_id=p.added_by WHERE p.id=?", (g["ref_id"],)).fetchone()
                if not r or r["deleted"]:
                    con.execute("DELETE FROM reports WHERE kind='poi' AND ref_id=?", (g["ref_id"],))
                    continue
                where = "Полезная точка · " + POI_KINDS.get(r["pkind"], ("Точка",))[0]
            elif g["kind"] == "comment":
                r = con.execute(
                    "SELECT c.text, c.user_id, c.deleted, u.name FROM comments c "
                    "JOIN users u ON u.tg_id=c.user_id WHERE c.id=?", (g["ref_id"],)).fetchone()
                if not r or r["deleted"]:
                    con.execute("DELETE FROM reports WHERE kind='comment' AND ref_id=?", (g["ref_id"],))
                    continue
                where = "Комментарий к отзыву"
            elif g["kind"] == "message":
                r = con.execute(
                    "SELECT m.text, m.user_id, m.deleted, u.name FROM messages m "
                    "JOIN users u ON u.tg_id=m.user_id WHERE m.id=?", (g["ref_id"],)).fetchone()
                if not r or r["deleted"]:
                    con.execute("DELETE FROM reports WHERE kind='message' AND ref_id=?", (g["ref_id"],))
                    continue
                where = "Чат"
            else:
                r = con.execute(
                    "SELECT r.text, r.rating, r.user_id, u.name, v.name AS venue FROM reviews r "
                    "JOIN users u ON u.tg_id=r.user_id JOIN venues v ON v.id=r.venue_id WHERE r.id=?",
                    (g["ref_id"],)).fetchone()
                if not r:
                    con.execute("DELETE FROM reports WHERE kind='review' AND ref_id=?", (g["ref_id"],))
                    continue
                where = "Отзыв · " + r["venue"]
            counts: dict = {}
            for reason in (g["reasons"] or "").split(","):
                key = reason or "other"
                counts[key] = counts.get(key, 0) + 1
            out.append({
                "kind": g["kind"], "ref_id": g["ref_id"], "count": g["n"], "reasons": counts,
                "where": where, "text": r["text"], "author": r["name"], "author_id": r["user_id"],
                "author_admin": r["user_id"] in ADMIN_IDS, "last": g["last"],
            })
    return out


class TargetIn(BaseModel):
    kind: str = Field(pattern="^(review|message|comment|poi|beacon)$")
    ref_id: int


@app.post("/api/admin/delete")
def admin_delete(body: TargetIn, u: dict = Depends(admin_user)):
    with db() as con:
        if body.kind == "beacon":
            con.execute("DELETE FROM beacons WHERE id=?", (body.ref_id,))
        elif body.kind == "poi":
            _purge_poi(con, body.ref_id)
        elif body.kind == "comment":
            con.execute("UPDATE comments SET deleted=1 WHERE id=?", (body.ref_id,))
        elif body.kind == "message":
            con.execute("UPDATE messages SET deleted=1 WHERE id=?", (body.ref_id,))
            con.execute("DELETE FROM venue_answers WHERE answer_id=?", (body.ref_id,))
        else:
            con.execute("DELETE FROM votes WHERE review_id=?", (body.ref_id,))
            con.execute("DELETE FROM review_history WHERE review_id=?", (body.ref_id,))
            con.execute("DELETE FROM reviews WHERE id=?", (body.ref_id,))
        con.execute("DELETE FROM reports WHERE kind=? AND ref_id=?", (body.kind, body.ref_id))
    return {"ok": True}


@app.post("/api/admin/dismiss")
def admin_dismiss(body: TargetIn, u: dict = Depends(admin_user)):
    with db() as con:
        con.execute("DELETE FROM reports WHERE kind=? AND ref_id=?", (body.kind, body.ref_id))
    return {"ok": True}


class MuteIn(BaseModel):
    user_id: int
    minutes: int = Field(ge=-1, le=525600)   # 0 снять, -1 навсегда


@app.post("/api/admin/mute")
def admin_mute(body: MuteIn, u: dict = Depends(admin_user)):
    if body.user_id in ADMIN_IDS:
        raise HTTPException(400, "Нельзя ограничить администратора")
    until = 0 if body.minutes == 0 else (FOREVER if body.minutes < 0 else int(time.time()) + body.minutes * 60)
    with db() as con:
        con.execute("UPDATE users SET muted_until=? WHERE tg_id=?", (until, body.user_id))
    return {"ok": True, "muted_until": until}


class BanIn(BaseModel):
    user_id: int
    banned: bool


@app.post("/api/admin/ban")
def admin_ban(body: BanIn, u: dict = Depends(admin_user)):
    if body.user_id in ADMIN_IDS:
        raise HTTPException(400, "Нельзя забанить администратора")
    with db() as con:
        if body.banned:
            con.execute("UPDATE users SET banned=1, real_name=name, name=? WHERE tg_id=? AND banned=0",
                        (BANNED_NAME, body.user_id))
        else:
            con.execute("UPDATE users SET banned=0, name=CASE WHEN real_name!='' THEN real_name ELSE name END, "
                        "real_name='' WHERE tg_id=? AND banned=1", (body.user_id,))
    return {"ok": True}


@app.get("/api/admin/restricted")
def admin_restricted(u: dict = Depends(admin_user)):
    now = int(time.time())
    with db() as con:
        rows = con.execute(
            "SELECT tg_id, CASE WHEN real_name!='' THEN real_name ELSE name END AS name, banned, muted_until "
            "FROM users WHERE banned=1 OR muted_until>? ORDER BY name", (now,)).fetchall()
    return [{"id": r["tg_id"], "name": r["name"], "banned": bool(r["banned"]),
             "muted_until": r["muted_until"] if r["muted_until"] > now else 0} for r in rows]


# ---------------- новости по службам доставки ----------------
SERVICES = {
    "yandex": "Яндекс Доставка", "yandex_eda": "Яндекс Еда", "lavka": "Яндекс Лавка",
    "samokat": "Самокат", "5ka": "Пятёрочка Доставка", "perekrestok": "Перекрёсток Впрок",
    "magnit": "Магнит Доставка", "vkusvill": "ВкусВилл", "kuper": "Купер", "ozon": "Ozon",
    "wb": "Wildberries", "dostavista": "Достависта", "cdek": "СДЭК", "other": "Другое",
}
NEWS_PENDING_MAX = 3


class NewsIn(BaseModel):
    service: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=5, max_length=100)
    text: str = Field(min_length=20, max_length=2000)


def _news_rows(con, where: str, params: tuple, u: dict, limit: int = 20):
    rows = con.execute(
        f"""SELECT n.*, us.name AS author, us.pub_id AS pid, {xp_sql('n.user_id')} AS xp,
              (SELECT COUNT(*) FROM news_votes x WHERE x.news_id=n.id AND x.value=1) AS up,
              (SELECT COUNT(*) FROM news_votes x WHERE x.news_id=n.id AND x.value=-1) AS down,
              COALESCE((SELECT x.value FROM news_votes x WHERE x.news_id=n.id AND x.user_id=?), 0) AS my_vote
            FROM news n JOIN users us ON us.tg_id=n.user_id WHERE {where}
            ORDER BY COALESCE(NULLIF(n.published_at, 0), n.created_at) DESC, n.id DESC LIMIT {int(limit)}""",
        (u["id"], *params)).fetchall()
    return [{
        "id": r["id"], "service": r["service"], "service_label": SERVICES.get(r["service"], "Другое"),
        "title": r["title"], "text": r["text"], "status": r["status"], "reject_reason": r["reject_reason"],
        "ts": r["published_at"] or r["created_at"], "author": r["author"], "pid": r["pid"],
        "level_icon": level_icon(r["xp"]), "up": r["up"], "down": r["down"], "my_vote": r["my_vote"],
        "mine": r["user_id"] == u["id"],
    } for r in rows]


@app.get("/api/news")
def news_list(service: str = "", before: int = 0, u: dict = Depends(current_user)):
    where, params = "n.status='published' AND n.deleted=0", []
    if service in SERVICES:
        where += " AND n.service=?"
        params.append(service)
    if before > 0:
        where += " AND n.id<?"
        params.append(before)
    with db() as con:
        items = _news_rows(con, where, tuple(params), u)
        mine = _news_rows(con, "n.user_id=? AND n.status!='published' AND n.deleted=0", (u["id"],), u, 10)
    return {"news": items, "mine": mine,
            "services": [{"key": k, "label": v} for k, v in SERVICES.items()],
            "xp": XP["news"]}


@app.post("/api/news")
def news_submit(body: NewsIn, u: dict = Depends(current_user)):
    if body.service not in SERVICES:
        raise HTTPException(400, "Выберите службу доставки")
    title, text = " ".join(body.title.split()), body.text.strip()
    now = int(time.time())
    with db() as con:
        if not u["is_admin"]:
            if u["muted_until"] > now:
                raise HTTPException(403, "Вам временно запрещено публиковать")
            pending = con.execute(
                "SELECT COUNT(*) c FROM news WHERE user_id=? AND status='pending' AND deleted=0",
                (u["id"],)).fetchone()["c"]
            if pending >= NEWS_PENDING_MAX:
                raise HTTPException(429, f"У вас уже {pending} новости на проверке. Дождитесь решения")
            last = con.execute("SELECT MAX(created_at) t FROM news WHERE user_id=?", (u["id"],)).fetchone()["t"]
            if last and now - last < 600:
                raise HTTPException(429, "Новую новость можно предложить через 10 минут")
            err = check_text(title + "\n" + text, get_settings(con), False)
            if err:
                raise HTTPException(400, err)
        status = "published" if u["is_admin"] else "pending"
        cur = con.execute(
            "INSERT INTO news(user_id,service,title,text,status,created_at,published_at) VALUES(?,?,?,?,?,?,?)",
            (u["id"], body.service, title, text, status, now, now if status == "published" else 0))
        if status == "pending":
            for aid in ADMIN_IDS:
                notify(con, aid, "admin_news", f"Новость на проверке: «{title}» от {u['name']}",
                       {"admin": "news"}, actor=u["id"])
    return {"id": cur.lastrowid, "status": status}


@app.post("/api/news/{nid}/vote")
def news_vote(nid: int, body: VoteIn, u: dict = Depends(current_user)):
    if body.value == 0:
        raise HTTPException(400, "Неверная оценка")
    with db() as con:
        n = con.execute("SELECT user_id, title FROM news WHERE id=? AND status='published' AND deleted=0",
                        (nid,)).fetchone()
        if not n:
            raise HTTPException(404, "Новость не найдена")
        if n["user_id"] == u["id"]:
            raise HTTPException(400, "Нельзя оценивать свою новость")
        had = con.execute("SELECT value FROM news_votes WHERE news_id=? AND user_id=?", (nid, u["id"])).fetchone()
        if had and had["value"] == body.value:
            con.execute("DELETE FROM news_votes WHERE news_id=? AND user_id=?", (nid, u["id"]))
            my = 0
        elif had:
            con.execute("UPDATE news_votes SET value=? WHERE news_id=? AND user_id=?", (body.value, nid, u["id"]))
            my = body.value
        else:
            con.execute("INSERT INTO news_votes(news_id,user_id,value) VALUES(?,?,?)", (nid, u["id"], body.value))
            my = body.value
        if my:
            notify(con, n["user_id"], "news_vote",
                   f"{u['name']}: 👍 к вашей новости «{n['title']}»" if my == 1
                   else f"{u['name']}: 👎 к вашей новости «{n['title']}»",
                   {"news": nid}, actor=u["id"], dedupe=f"nv:{nid}:{u['id']}:{my}")
        up = con.execute("SELECT COUNT(*) c FROM news_votes WHERE news_id=? AND value=1", (nid,)).fetchone()["c"]
        down = con.execute("SELECT COUNT(*) c FROM news_votes WHERE news_id=? AND value=-1", (nid,)).fetchone()["c"]
    return {"up": up, "down": down, "my_vote": my}


@app.post("/api/news/{nid}/delete")
def news_delete(nid: int, u: dict = Depends(current_user)):
    with db() as con:
        n = con.execute("SELECT user_id FROM news WHERE id=? AND deleted=0", (nid,)).fetchone()
        if not n:
            raise HTTPException(404, "Новость не найдена")
        if n["user_id"] != u["id"] and not u["is_admin"]:
            raise HTTPException(403, "Можно удалять только свои новости")
        con.execute("UPDATE news SET deleted=1 WHERE id=?", (nid,))
    return {"ok": True}


@app.get("/api/admin/news")
def admin_news(u: dict = Depends(admin_user)):
    with db() as con:
        return _news_rows(con, "n.status='pending' AND n.deleted=0", (), u, 50)


@app.post("/api/admin/news/{nid}/approve")
def admin_news_approve(nid: int, u: dict = Depends(admin_user)):
    now = int(time.time())
    with db() as con:
        n = con.execute("SELECT user_id, title, status FROM news WHERE id=? AND deleted=0", (nid,)).fetchone()
        if not n:
            raise HTTPException(404, "Новость не найдена")
        con.execute("UPDATE news SET status='published', published_at=?, reject_reason='' WHERE id=?", (now, nid))
        if n["status"] != "published":
            notify(con, n["user_id"], "news_ok",
                   f"Ваша новость «{n['title']}» опубликована · +{XP['news']} XP", {"news": nid})
    return {"ok": True}


class RejectIn(BaseModel):
    reason: str = Field(default="", max_length=200)


@app.post("/api/admin/news/{nid}/reject")
def admin_news_reject(nid: int, body: RejectIn, u: dict = Depends(admin_user)):
    reason = body.reason.strip() or "не прошла проверку"
    with db() as con:
        n = con.execute("SELECT user_id, title FROM news WHERE id=? AND deleted=0", (nid,)).fetchone()
        if not n:
            raise HTTPException(404, "Новость не найдена")
        con.execute("UPDATE news SET status='rejected', reject_reason=? WHERE id=?", (reason, nid))
        notify(con, n["user_id"], "news_rejected", f"Новость «{n['title']}» отклонена: {reason}", {"news": nid})
    return {"ok": True}


# ---------------- уведомления ----------------
@app.get("/api/notifications/unread")
def notifications_unread(u: dict = Depends(current_user)):
    with db() as con:
        sync_level(con, u["id"])
        n = con.execute("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", (u["id"],)).fetchone()["c"]
    return {"count": n}


@app.get("/api/notifications")
def notifications_list(u: dict = Depends(current_user)):
    with db() as con:
        sync_level(con, u["id"])
        rows = con.execute(
            "SELECT id, kind, text, ref, created_at, read FROM notifications WHERE user_id=? "
            "ORDER BY id DESC LIMIT 50", (u["id"],)).fetchall()
    out = []
    for r in rows:
        try:
            ref = json.loads(r["ref"] or "{}")
        except ValueError:
            ref = {}
        out.append({"id": r["id"], "kind": r["kind"], "text": r["text"], "ref": ref,
                    "ts": r["created_at"], "read": bool(r["read"])})
    return out


@app.post("/api/notifications/read")
def notifications_read(u: dict = Depends(current_user)):
    with db() as con:
        con.execute("UPDATE notifications SET read=1 WHERE user_id=? AND read=0", (u["id"],))
    return {"ok": True}


# ---------------- профиль другого курьера ----------------
@app.get("/api/users/{pid}")
def user_profile(pid: str, u: dict = Depends(current_user)):
    with db() as con:
        row = con.execute("SELECT tg_id, name, created_at, banned, muted_until, deleted FROM users WHERE pub_id=?",
                          (pid,)).fetchone()
        if not row:
            raise HTTPException(404, "Пользователь не найден")
        if row["deleted"] or (row["banned"] and not u["is_admin"]):
            return {"pid": pid, "name": row["name"], "deleted": bool(row["deleted"]), "blocked": bool(row["banned"]),
                    "is_me": False}
        uid = row["tg_id"]
        st = user_stats(con, uid)
        xp = st["xp"]
        allx = all_xp(con)
        rank = sum(1 for p in con.execute("SELECT tg_id FROM users WHERE banned=0 AND deleted=0")
                   if allx.get(p[0], 0) > xp) + 1
        reviews = con.execute(
            "SELECT r.rating, r.text, r.created_at, r.updated_at, v.id AS vid, v.name AS vname, v.lat, v.lon "
            "FROM reviews r JOIN venues v ON v.id=r.venue_id WHERE r.user_id=? "
            "ORDER BY COALESCE(NULLIF(r.updated_at, 0), r.created_at) DESC LIMIT 10", (uid,)).fetchall()
        venues = con.execute(
            "SELECT id, name, lat, lon, created_at FROM venues WHERE added_by=? ORDER BY id DESC LIMIT 10",
            (uid,)).fetchall()
        news = con.execute(
            "SELECT id, title, service, published_at FROM news WHERE user_id=? AND status='published' "
            "AND deleted=0 ORDER BY published_at DESC LIMIT 5", (uid,)).fetchall()
    idx = level_index(xp)
    st["level"] = idx + 1
    out = {
        "pid": pid, "name": row["name"], "joined": row["created_at"], "xp": xp, "rank": rank,
        "level": LEVELS[idx][1], "level_icon": LEVELS[idx][2], "level_n": idx + 1,
        "level_from": LEVELS[idx][0], "level_to": LEVELS[idx + 1][0] if idx + 1 < len(LEVELS) else None,
        "stats": {k: v for k, v in st.items() if k != "xp"},
        "achievements": [{"key": k, "icon": ic, "title": t, "stat": stat, "goal": goal} for k, ic, t, stat, goal, unit in ACHIEVEMENTS
                         if st[stat] >= goal],
        "achievements_total": len(ACHIEVEMENTS),
        "reviews": [{"venue_id": r["vid"], "venue": r["vname"], "lat": r["lat"], "lon": r["lon"],
                     "rating": r["rating"], "text": r["text"], "ts": r["updated_at"] or r["created_at"]}
                    for r in reviews],
        "venues": [{"id": v["id"], "name": v["name"], "lat": v["lat"], "lon": v["lon"], "ts": v["created_at"]}
                   for v in venues],
        "news": [{"id": n["id"], "title": n["title"], "service_label": SERVICES.get(n["service"], "Другое"),
                  "ts": n["published_at"]} for n in news],
        "is_me": uid == u["id"], "is_admin_user": uid in ADMIN_IDS,
    }
    if u["is_admin"]:
        out.update({"tg_id": uid, "banned": bool(row["banned"]),
                    "muted_until": row["muted_until"] if row["muted_until"] > time.time() else 0})
    return out


# ---------------- полезные точки ----------------
class PoiIn(BaseModel):
    kind: str = Field(min_length=1, max_length=20)
    note: str = Field(default="", max_length=200)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


_POI_COUNTS = (
    "(SELECT COUNT(*) FROM poi_votes v WHERE v.poi_id=p.id AND v.value=1) AS ok, "
    "(SELECT COUNT(*) FROM poi_votes v WHERE v.poi_id=p.id AND v.value=-1) AS gone"
)


@app.get("/api/pois")
def pois_list(s: float, w: float, n: float, e: float, kind: str = "", u: dict = Depends(current_user)):
    if (n - s) > 0.2 or (e - w) > 0.3:
        raise HTTPException(400, "Слишком большая область")
    kinds = ",".join("'" + k + "'" for k in POI_KINDS)
    where, params = f"p.deleted=0 AND p.kind IN ({kinds}) AND p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?", [s, n, w, e]
    if kind in POI_KINDS:
        where += " AND p.kind=?"
        params.append(kind)
    with db() as con:
        rows = con.execute(
            f"SELECT * FROM (SELECT p.id, p.kind, p.lat, p.lon, p.note, p.price, {_POI_COUNTS} FROM pois p WHERE {where}) "
            f"WHERE NOT (gone >= ? AND gone > ok) LIMIT 600", (*params, POI_GONE_HIDE)).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/pois/{pid_}")
def poi_detail(pid_: int, u: dict = Depends(current_user)):
    with db() as con:
        p = con.execute(
            f"SELECT p.*, {_POI_COUNTS}, us.name AS author, us.pub_id AS author_pid FROM pois p "
            f"JOIN users us ON us.tg_id=p.added_by WHERE p.id=? AND p.deleted=0", (pid_,)).fetchone()
        if not p:
            raise HTTPException(404, "Точка не найдена")
        my = con.execute("SELECT value FROM poi_votes WHERE poi_id=? AND user_id=?", (pid_, u["id"])).fetchone()
        last = con.execute(
            "SELECT us.name, us.pub_id, v.created_at, v.value FROM poi_votes v JOIN users us ON us.tg_id=v.user_id "
            "WHERE v.poi_id=? ORDER BY v.created_at DESC LIMIT 1", (pid_,)).fetchone()
        ed = con.execute("SELECT name, pub_id FROM users WHERE tg_id=?", (p["edited_by"],)).fetchone() if p["edited_by"] else None
        edits = con.execute("SELECT COUNT(*) FROM poi_edits WHERE poi_id=? AND action!='origin'", (pid_,)).fetchone()[0]
        can_all = u["is_admin"] or p["added_by"] == u["id"]
        lvl = level_index(user_stats(con, u["id"])["xp"]) + 1 if not can_all else 99
    k = POI_KINDS.get(p["kind"], ("Точка", "📌", "#8e8e93"))
    return {
        "id": p["id"], "kind": p["kind"], "label": k[0], "icon": k[1], "color": k[2], "note": p["note"],
        "lat": p["lat"], "lon": p["lon"], "ts": p["created_at"], "ok": p["ok"], "gone": p["gone"],
        "author": p["author"], "author_pid": p["author_pid"], "mine": p["added_by"] == u["id"],
        "my_vote": my["value"] if my else 0,
        "last_vote": {"name": last["name"], "pid": last["pub_id"], "ts": last["created_at"], "value": last["value"]}
        if last else None,
        "price": p["price"], "hours": p["hours"], "edits": edits,
        "edited": {"name": ed["name"], "pid": ed["pub_id"], "ts": p["edited_at"]} if ed and p["edited_at"] else None,
        "can_edit": can_all or lvl >= POI_EDIT_MIN_LEVEL, "can_edit_all": can_all, "edit_min_level": POI_EDIT_MIN_LEVEL,
    }


@app.post("/api/pois")
def poi_add(body: PoiIn, u: dict = Depends(current_user)):
    if body.kind not in POI_KINDS:
        raise HTTPException(400, "Выберите тип точки")
    note = " ".join(body.note.split())
    now = int(time.time())
    with db() as con:
        err = check_text(note, get_settings(con), u["is_admin"])
        if err:
            raise HTTPException(400, err)
        dup = con.execute(
            "SELECT id FROM pois WHERE deleted=0 AND kind=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
            (body.kind, body.lat - 0.00023, body.lat + 0.00023, body.lon - 0.0004, body.lon + 0.0004)).fetchone()
        if dup:
            return {"id": dup["id"], "existing": True}
        today = con.execute("SELECT COUNT(*) c FROM pois WHERE added_by=? AND created_at>?",
                            (u["id"], now - 86400)).fetchone()["c"]
        if today >= 10 and not u["is_admin"]:
            raise HTTPException(429, "Не больше 10 новых точек в сутки")
        cur = con.execute(
            "INSERT INTO pois(kind,note,lat,lon,added_by,created_at) VALUES(?,?,?,?,?,?)",
            (body.kind, note, body.lat, body.lon, u["id"], now))
    return {"id": cur.lastrowid, "existing": False}


@app.post("/api/pois/{pid_}/vote")
def poi_vote(pid_: int, body: VoteIn, u: dict = Depends(current_user)):
    if body.value == 0:
        raise HTTPException(400, "Неверная отметка")
    now = int(time.time())
    with db() as con:
        p = con.execute("SELECT kind, lat, lon, added_by FROM pois WHERE id=? AND deleted=0", (pid_,)).fetchone()
        if not p:
            raise HTTPException(404, "Точка не найдена")
        if p["added_by"] == u["id"]:
            raise HTTPException(400, "Свою точку подтверждают другие курьеры")
        had = con.execute("SELECT value FROM poi_votes WHERE poi_id=? AND user_id=?", (pid_, u["id"])).fetchone()
        if had and had["value"] == body.value:
            con.execute("DELETE FROM poi_votes WHERE poi_id=? AND user_id=?", (pid_, u["id"]))
            my = 0
        else:
            con.execute("INSERT OR REPLACE INTO poi_votes(poi_id,user_id,value,created_at) VALUES(?,?,?,?)",
                        (pid_, u["id"], body.value, now))
            my = body.value
        label = POI_KINDS.get(p["kind"], ("Точка",))[0]
        if my == 1:
            notify(con, p["added_by"], "poi_ok", f"{u['name']}: ✅ ваша точка «{label}» работает · +{XP['poi_ok']} XP",
                   {"poi": pid_, "lat": p["lat"], "lon": p["lon"]}, actor=u["id"], dedupe=f"pok:{pid_}")
        elif my == -1:
            notify(con, p["added_by"], "poi_gone", f"{u['name']}: ❌ ваша точка «{label}» больше не работает",
                   {"poi": pid_, "lat": p["lat"], "lon": p["lon"]}, actor=u["id"], dedupe=f"pgone:{pid_}:{u['id']}")
        ok = con.execute("SELECT COUNT(*) c FROM poi_votes WHERE poi_id=? AND value=1", (pid_,)).fetchone()["c"]
        gone = con.execute("SELECT COUNT(*) c FROM poi_votes WHERE poi_id=? AND value=-1", (pid_,)).fetchone()["c"]
    return {"ok": ok, "gone": gone, "my_vote": my}


@app.post("/api/pois/{pid_}/delete")
def poi_delete(pid_: int, u: dict = Depends(current_user)):
    with db() as con:
        p = con.execute("SELECT added_by FROM pois WHERE id=? AND deleted=0", (pid_,)).fetchone()
        if not p:
            raise HTTPException(404, "Точка не найдена")
        if p["added_by"] != u["id"] and not u["is_admin"]:
            raise HTTPException(403, "Можно удалять только свои точки")
        _purge_poi(con, pid_)
    return {"ok": True}



# ---------------- удаление навсегда (админ) ----------------
def _purge_poi(con, poi_id: int):
    con.execute("DELETE FROM poi_edits WHERE poi_id=?", (poi_id,))
    con.execute("DELETE FROM poi_votes WHERE poi_id=?", (poi_id,))
    con.execute("DELETE FROM reports WHERE kind='poi' AND ref_id=?", (poi_id,))
    con.execute("DELETE FROM pois WHERE id=?", (poi_id,))


def _purge_venue(con, vid: int):
    rids = [r[0] for r in con.execute("SELECT id FROM reviews WHERE venue_id=?", (vid,))]
    for rid in rids:
        cids = [c[0] for c in con.execute("SELECT id FROM comments WHERE review_id=?", (rid,))]
        for cid in cids:
            con.execute("DELETE FROM reports WHERE kind='comment' AND ref_id=?", (cid,))
        con.execute("DELETE FROM comments WHERE review_id=?", (rid,))
        con.execute("DELETE FROM votes WHERE review_id=?", (rid,))
        con.execute("DELETE FROM review_history WHERE review_id=?", (rid,))
        con.execute("DELETE FROM reports WHERE kind='review' AND ref_id=?", (rid,))
    con.execute("DELETE FROM reviews WHERE venue_id=?", (vid,))
    con.execute("DELETE FROM confirmations WHERE venue_id=?", (vid,))
    con.execute("DELETE FROM venue_answers WHERE venue_id=?", (vid,))
    con.execute("UPDATE messages SET venue_id=0 WHERE venue_id=?", (vid,))
    con.execute("DELETE FROM venues WHERE id=?", (vid,))


@app.post("/api/admin/venues/{vid}/delete")
def admin_delete_venue(vid: int, u: dict = Depends(admin_user)):
    with db() as con:
        if not con.execute("SELECT 1 FROM venues WHERE id=?", (vid,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        _purge_venue(con, vid)
    return {"ok": True}


# ---------------- группировка точек на отдалённом масштабе ----------------
@app.get("/api/map/clusters")
def map_clusters(s: float, w: float, n: float, e: float, zoom: float = 12, layer: str = "all",
                 u: dict = Depends(current_user)):
    if (n - s) > 6 or (e - w) > 10:
        raise HTTPException(400, "Слишком большая область")
    zoom = max(3, min(int(round(zoom)), 18))   # во время жеста масштаб бывает дробным
    cell_lon = 360 / (256 * 2 ** zoom) * 64           # ячейка примерно 64 пикселя
    cell_lat = cell_lon * math.cos(math.radians((s + n) / 2))
    out = []
    with db() as con:
        if layer in ("all", "venues"):
            for r in con.execute(
                    """SELECT CAST((v.lat - ?) / ? AS INTEGER) AS gy, CAST((v.lon - ?) / ? AS INTEGER) AS gx,
                         COUNT(*) AS c, AVG(v.lat) AS lat, AVG(v.lon) AS lon, MIN(v.id) AS id,
                         AVG(r.a) AS avg, SUM(CASE WHEN r.rc > 0 THEN 1 ELSE 0 END) AS reviewed
                       FROM venues v
                       LEFT JOIN (SELECT venue_id, AVG(rating) AS a, COUNT(*) AS rc FROM reviews GROUP BY venue_id) r
                         ON r.venue_id = v.id
                       WHERE v.lat BETWEEN ? AND ? AND v.lon BETWEEN ? AND ?
                       GROUP BY gy, gx""", (s, cell_lat, w, cell_lon, s, n, w, e)):
                out.append({"type": "venues", "count": r["c"], "lat": r["lat"], "lon": r["lon"],
                            "id": r["id"] if r["c"] == 1 else None, "avg": r["avg"], "reviewed": r["reviewed"] or 0})
        if layer != "venues":
            kinds = list(POI_KINDS) if layer in ("all", "pois") else ([layer] if layer in POI_KINDS else [])
            if kinds:
                marks = ",".join("?" * len(kinds))
                for r in con.execute(
                        f"""SELECT CAST((p.lat - ?) / ? AS INTEGER) AS gy, CAST((p.lon - ?) / ? AS INTEGER) AS gx,
                              COUNT(*) AS c, AVG(p.lat) AS lat, AVG(p.lon) AS lon, MIN(p.id) AS id,
                              MIN(p.kind) AS k1, MAX(p.kind) AS k2
                            FROM pois p
                            WHERE p.deleted=0 AND p.kind IN ({marks}) AND p.lat BETWEEN ? AND ? AND p.lon BETWEEN ? AND ?
                            GROUP BY gy, gx""", (s, cell_lat, w, cell_lon, *kinds, s, n, w, e)):
                    out.append({"type": "pois", "count": r["c"], "lat": r["lat"], "lon": r["lon"],
                                "id": r["id"] if r["c"] == 1 else None,
                                "kind": r["k1"] if r["k1"] == r["k2"] else None})
    return out



# ---------------- маячок «я на линии» ----------------
BEACON_MINUTES = (5, 15, 30)
BEACON_STEP_LAT, BEACON_STEP_LON = 0.0015, 0.0025     # примерно 150-170 м: точную позицию не храним


def _round_pos(lat: float, lon: float):
    return (round(round(lat / BEACON_STEP_LAT) * BEACON_STEP_LAT, 5),
            round(round(lon / BEACON_STEP_LON) * BEACON_STEP_LON, 5))


class BeaconIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    minutes: int = Field(ge=1, le=60)
    note: str = Field(default="", max_length=120)


def _beacon_row(r, u, xpm: dict = None):
    return {"id": r["id"], "lat": r["lat"], "lon": r["lon"], "note": r["note"], "expires_at": r["expires_at"],
            "created_at": r["created_at"], "name": r["name"], "pid": r["pub_id"],
            "level_icon": level_icon((xpm if xpm is not None else _XP_CACHE["map"]).get(r["user_id"], 0)),
            "mine": r["user_id"] == u["id"]}


_BEACON_SELECT = (
    "SELECT b.*, us.name, us.pub_id FROM beacons b "
    "JOIN users us ON us.tg_id=b.user_id "
)


@app.post("/api/beacon")
def beacon_start(body: BeaconIn, u: dict = Depends(current_user)):
    if body.minutes not in BEACON_MINUTES:
        raise HTTPException(400, "Выберите 5, 15 или 30 минут")
    note = " ".join(body.note.split())
    now = int(time.time())
    with db() as con:
        xp_for_icons(con)          # опыт для значков уровня (кэш 10 с)
        st = get_settings(con)
        if not u["is_admin"]:
            if u["muted_until"] > now:
                raise HTTPException(403, "Вам временно недоступен маячок")
            lvl = level_index(user_stats(con, u["id"])["xp"]) + 1
            if lvl < st["beacon_min_level"]:
                raise HTTPException(403, f"Маячок доступен с {st['beacon_min_level']} уровня. Сейчас у вас {lvl}")
            err = check_text(note, st, False)
            if err:
                raise HTTPException(400, err)
        lat, lon = _round_pos(body.lat, body.lon)
        con.execute(
            "INSERT INTO beacons(user_id,lat,lon,note,created_at,expires_at) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, note=excluded.note, "
            "created_at=excluded.created_at, expires_at=excluded.expires_at",
            (u["id"], lat, lon, note, now, now + body.minutes * 60))
        r = con.execute(_BEACON_SELECT + "WHERE b.user_id=?", (u["id"],)).fetchone()
    return _beacon_row(r, u)


@app.post("/api/beacon/stop")
def beacon_stop(u: dict = Depends(current_user)):
    with db() as con:
        con.execute("DELETE FROM beacons WHERE user_id=?", (u["id"],))
    return {"ok": True}


@app.get("/api/beacon/me")
def beacon_me(u: dict = Depends(current_user)):
    with db() as con:
        xp_for_icons(con)          # опыт для значков уровня (кэш 10 с)
        r = con.execute(_BEACON_SELECT + "WHERE b.user_id=? AND b.expires_at>?", (u["id"], int(time.time()))).fetchone()
    return _beacon_row(r, u) if r else None


@app.get("/api/beacons")
def beacons_list(s: float = None, w: float = None, n: float = None, e: float = None,
                 lat: float = None, lon: float = None, u: dict = Depends(current_user)):
    now = int(time.time())
    with db() as con:
        xp_for_icons(con)          # опыт для значков уровня (кэш 10 с)
        con.execute("DELETE FROM beacons WHERE expires_at < ?", (now - 3600,))   # чистим старые
        radius = get_settings(con)["beacon_radius_km"]
        if u["is_admin"] and None not in (s, w, n, e):
            if (n - s) > 6 or (e - w) > 10:
                raise HTTPException(400, "Слишком большая область")
            box = (s, n, w, e)
        elif lat is not None and lon is not None:
            dlat = radius / 111.0
            dlon = radius / (111.0 * max(0.1, math.cos(math.radians(lat))))
            box = (lat - dlat, lat + dlat, lon - dlon, lon + dlon)
        else:
            box = None
        rows = []
        if box:
            rows = con.execute(
                _BEACON_SELECT + "WHERE b.expires_at>? AND us.banned=0 AND b.lat BETWEEN ? AND ? AND b.lon BETWEEN ? AND ? "
                "ORDER BY b.created_at DESC LIMIT 300", (now, *box)).fetchall()
        own = con.execute(_BEACON_SELECT + "WHERE b.user_id=? AND b.expires_at>?", (u["id"], now)).fetchone()
    out, seen = [], set()
    for r in rows:
        if not (u["is_admin"] and None not in (s, w, n, e)) and lat is not None:
            if dist_km(lat, lon, r["lat"], r["lon"]) > radius + 0.2:   # запас на округление позиции
                continue
        out.append(_beacon_row(r, u)); seen.add(r["id"])
    if own and own["id"] not in seen:
        out.append(_beacon_row(own, u))
    return out


def dist_km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))



# ---------------- живые статусы заведений ----------------
# ключ: (подпись, хороший ли, сколько минут живёт)
LIVE_KINDS = {
    "queue": ("Сейчас очередь", False, 90),
    "slow": ("Долго собирают заказы", False, 90),
    "terminal": ("Не работает терминал", False, 180),
    "closed": ("Закрылись раньше времени", False, 360),
    "fast": ("Сейчас отдают быстро", True, 60),
}
_LIVE_TOP = ("(SELECT l.kind FROM venue_live l WHERE l.venue_id=v.id AND l.expires_at>? ORDER BY "
             "CASE l.kind WHEN 'closed' THEN 1 WHEN 'terminal' THEN 2 WHEN 'queue' THEN 3 WHEN 'slow' THEN 4 ELSE 5 END "
             "LIMIT 1)")


def live_for(con, vid: int, uid: int):
    now = int(time.time())
    out = []
    for k, (label, good, _) in LIVE_KINDS.items():
        rows = con.execute(
            "SELECT id, user_id, created_at FROM venue_live WHERE venue_id=? AND kind=? AND expires_at>? "
            "ORDER BY created_at DESC", (vid, k, now)).fetchall()
        if rows:
            mine = next((r["id"] for r in rows if r["user_id"] == uid), None)
            out.append({"kind": k, "label": label, "good": good, "count": len(rows),
                        "last_ts": rows[0]["created_at"], "mine_id": mine})
    return out


class LiveIn(BaseModel):
    kind: str = Field(min_length=1, max_length=20)


@app.get("/api/live/kinds")
def live_kinds():
    return [{"key": k, "label": v[0], "good": v[1], "minutes": v[2]} for k, v in LIVE_KINDS.items()]


@app.post("/api/venues/{vid}/live")
def live_add(vid: int, body: LiveIn, u: dict = Depends(current_user)):
    if body.kind not in LIVE_KINDS:
        raise HTTPException(400, "Неизвестный статус")
    now = int(time.time())
    with db() as con:
        if not con.execute("SELECT 1 FROM venues WHERE id=?", (vid,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        if not u["is_admin"]:
            if u["muted_until"] > now:
                raise HTTPException(403, "Вам временно ограничены публикации")
            today = con.execute("SELECT COUNT(*) c FROM venue_live WHERE user_id=? AND created_at>?",
                                (u["id"], now - 86400)).fetchone()["c"]
            if today >= 40:
                raise HTTPException(429, "Слишком много статусов за сутки")
        ttl = LIVE_KINDS[body.kind][2] * 60
        mine = con.execute("SELECT id FROM venue_live WHERE venue_id=? AND user_id=? AND kind=? AND expires_at>?",
                           (vid, u["id"], body.kind, now)).fetchone()
        if mine:   # повторная отметка продлевает, а не дублирует
            con.execute("UPDATE venue_live SET created_at=?, expires_at=? WHERE id=?", (now, now + ttl, mine["id"]))
        else:
            con.execute("INSERT INTO venue_live(venue_id,user_id,kind,created_at,expires_at) VALUES(?,?,?,?,?)",
                        (vid, u["id"], body.kind, now, now + ttl))
        # противоположные отметки этого же человека снимаем
        if body.kind == "fast":
            con.execute("DELETE FROM venue_live WHERE venue_id=? AND user_id=? AND kind IN ('queue','slow')", (vid, u["id"]))
        elif body.kind in ("queue", "slow"):
            con.execute("DELETE FROM venue_live WHERE venue_id=? AND user_id=? AND kind='fast'", (vid, u["id"]))
        con.execute("DELETE FROM venue_live WHERE expires_at < ?", (now - 86400,))
        return {"live": live_for(con, vid, u["id"])}


@app.post("/api/live/{lid}/delete")
def live_delete(lid: int, u: dict = Depends(current_user)):
    with db() as con:
        r = con.execute("SELECT venue_id, user_id FROM venue_live WHERE id=?", (lid,)).fetchone()
        if not r:
            raise HTTPException(404, "Статус не найден")
        if r["user_id"] != u["id"] and not u["is_admin"]:
            raise HTTPException(403, "Можно убрать только свою отметку")
        con.execute("DELETE FROM venue_live WHERE id=?", (lid,))
        return {"live": live_for(con, r["venue_id"], u["id"])}


# ---------------- согласие и настройки пользователя ----------------
CONSENT_VERSION = 1


@app.post("/api/me/accept")
def me_accept(u: dict = Depends(current_user)):
    with db() as con:
        con.execute("UPDATE users SET accepted_version=? WHERE tg_id=?", (CONSENT_VERSION, u["id"]))
    return {"ok": True}


class PrefsIn(BaseModel):
    push: bool


@app.post("/api/me/settings")
def me_settings(body: PrefsIn, u: dict = Depends(current_user)):
    with db() as con:
        con.execute("UPDATE users SET push_enabled=? WHERE tg_id=?", (1 if body.push else 0, u["id"]))
    return {"ok": True, "push_enabled": bool(body.push)}


# ---------------- уведомления в Telegram через бота ----------------
WEBAPP_URL = os.getenv("WEBAPP_URL", "")


def _collect_push() -> dict:
    now = int(time.time())
    with db() as con:
        con.execute("UPDATE notifications SET pushed=1 WHERE pushed=0 AND (created_at<? OR user_id IN "
                    "(SELECT tg_id FROM users WHERE push_enabled=0))", (now - 6 * 3600,))
        rows = con.execute(
            "SELECT n.id, n.user_id, n.text FROM notifications n JOIN users u ON u.tg_id=n.user_id "
            "WHERE n.pushed=0 AND u.push_enabled=1 AND u.banned=0 AND u.last_push<? ORDER BY n.id LIMIT 500",
            (now - 60,)).fetchall()
    groups: dict = {}
    for r in rows:
        groups.setdefault(r["user_id"], []).append(r)
    return groups


def push_text(items) -> str:
    if len(items) == 1:
        return "🔔 " + items[0]["text"]
    lines = [f"🔔 Новых уведомлений: {len(items)}"] + ["• " + it["text"] for it in items[:3]]
    if len(items) > 3:
        lines.append(f"…и ещё {len(items) - 3}")
    return "\n".join(lines)


def _mark_pushed(uid: int, ids: list, retry_after: int = 0):
    now = int(time.time())
    with db() as con:
        con.execute(f"UPDATE notifications SET pushed=1 WHERE id IN ({','.join('?' * len(ids))})", ids)
        con.execute("UPDATE users SET last_push=? WHERE tg_id=?", (now + retry_after, uid))


async def push_loop():
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                groups = await asyncio.to_thread(_collect_push)
                for uid, items in groups.items():
                    payload = {"chat_id": uid, "text": push_text(items), "disable_web_page_preview": True}
                    if WEBAPP_URL:
                        payload["reply_markup"] = {"inline_keyboard": [[
                            {"text": "Открыть приложение", "web_app": {"url": WEBAPP_URL}}]]}
                    try:
                        resp = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json=payload)
                    except Exception as exc:
                        log.warning("Пуш не отправлен: %s", exc)
                        continue
                    if resp.status_code == 429:
                        await asyncio.sleep(5)
                        break
                    # 403: человек ещё не запускал бота или заблокировал его — попробуем позже, не чаще раза в 6 ч
                    await asyncio.to_thread(_mark_pushed, uid, [it["id"] for it in items],
                                            6 * 3600 if resp.status_code == 403 else 0)
                    await asyncio.sleep(0.05)
            except Exception as exc:
                log.warning("Ошибка рассылки: %s", exc)
            await asyncio.sleep(10)


# ---------------- статистика для админа ----------------
@app.get("/api/admin/stats")
def admin_stats(u: dict = Depends(admin_user)):
    now = int(time.time())
    d0 = msk_day_start(now)
    with db() as con:
        q = lambda sql, *a: con.execute(sql, a).fetchone()[0]
        out = {
            "users": q("SELECT COUNT(*) FROM users"),
            "new_today": q("SELECT COUNT(*) FROM users WHERE created_at>=?", d0),
            "new_7d": q("SELECT COUNT(*) FROM users WHERE created_at>=?", d0 - 6 * 86400),
            "dau": q("SELECT COUNT(*) FROM daily_active WHERE day=?", msk_day(now)),
            "wau": q("SELECT COUNT(DISTINCT user_id) FROM daily_active WHERE day>=?", msk_day(now - 6 * 86400)),
            "online": q("SELECT COUNT(*) FROM users WHERE last_seen>?", now - 300),
            "reviews_today": q("SELECT COUNT(*) FROM reviews WHERE created_at>=?", d0),
            "reviews_7d": q("SELECT COUNT(*) FROM reviews WHERE created_at>=?", d0 - 6 * 86400),
            "venues_7d": q("SELECT COUNT(*) FROM venues WHERE created_at>=? AND added_by IS NOT NULL", d0 - 6 * 86400),
            "pois_7d": q("SELECT COUNT(*) FROM pois WHERE created_at>=? AND deleted=0", d0 - 6 * 86400),
            "messages_today": q("SELECT COUNT(*) FROM messages WHERE created_at>=?", d0),
            "beacons_now": q("SELECT COUNT(*) FROM beacons WHERE expires_at>?", now),
            "news_pending": q("SELECT COUNT(*) FROM news WHERE status='pending' AND deleted=0"),
            "reports_24h": q("SELECT COUNT(*) FROM reports WHERE created_at>?", now - 86400),
            "muted_now": q("SELECT COUNT(*) FROM users WHERE muted_until>?", now),
            "feedback_new": q("SELECT COUNT(*) FROM feedback WHERE status='new'"),
        }
        days = []
        for i in range(13, -1, -1):
            start = d0 - i * 86400
            days.append({
                "day": msk_day(start), "active": q("SELECT COUNT(*) FROM daily_active WHERE day=?", msk_day(start)),
                "new": q("SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?", start, start + 86400),
                "reviews": q("SELECT COUNT(*) FROM reviews WHERE created_at>=? AND created_at<?", start, start + 86400),
            })
        out["days"] = days
    return out



# ---------------- бот: приветствие, описание, команды ----------------
BOT_SHORT = "Карта для курьеров: отзывы о заведениях, полезные точки, курьеры рядом, чат и новости."
BOT_DESCRIPTION = (
    "Геотегер — карта, которую делают сами курьеры.\n\n"
    "• Отзывы о заведениях: где долго ждать, где грубят, где оставить транспорт\n"
    "• Живые отметки: очередь, не работает терминал, отдают быстро\n"
    "• Туалеты, где погреться и зарядить телефон\n"
    "• Курьеры рядом «на линии», общий чат и новости служб доставки\n"
    "• Опыт, уровни и достижения\n\n"
    "Нажмите «Старт», а потом кнопку «Карта»."
)
_hint_sent: dict = {}


def welcome_text(name: str) -> str:
    hello = f"Привет, {name}! 👋" if name else "Привет! 👋"
    return (
        f"{hello} Это Геотегер — карта для курьеров, которую мы наполняем сами.\n\n"
        "Здесь можно:\n"
        "• смотреть отзывы курьеров о заведениях: где долго ждать, где грубят, где удобно оставить транспорт;\n"
        "• отмечать, что происходит прямо сейчас: очередь, не работает терминал, отдают быстро;\n"
        "• находить туалеты, где погреться, зарядить телефон и попить воды;\n"
        "• выходить «на линию» и видеть курьеров рядом;\n"
        "• общаться в чате, читать новости служб доставки и получать опыт, уровни и достижения.\n\n"
        "Нажмите кнопку ниже или «Карта» слева от поля ввода — откроется приложение."
    )


def hint_text() -> str:
    return "Чтобы открыть Геотегер, нажмите «Карта» слева от поля ввода или кнопку ниже 👇"


def bot_reply_for(msg: dict):
    """Что ответить на сообщение в личке бота. None — не отвечаем."""
    chat = msg.get("chat") or {}
    if chat.get("type") != "private":
        return None
    text = (msg.get("text") or "").strip()
    who = msg.get("from") or {}
    if text.startswith("/start") or text.startswith("/help"):
        return welcome_text(str(who.get("first_name") or "").strip()[:30])
    now = time.time()
    uid = who.get("id")
    if now - _hint_sent.get(uid, 0) < 600:     # подсказку не чаще раза в 10 минут
        return None
    _hint_sent[uid] = now
    return hint_text()


def _open_button():
    if not WEBAPP_URL:
        return None
    return {"inline_keyboard": [[{"text": "🗺 Открыть карту", "web_app": {"url": WEBAPP_URL}}]]}


def _meta_get(k: str):
    with db() as con:
        r = con.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
    return r["v"] if r else None


def _meta_set(k: str, v: str):
    with db() as con:
        con.execute("INSERT OR REPLACE INTO meta(k,v) VALUES(?,?)", (k, v))


async def bot_loop():
    base = f"https://api.telegram.org/bot{BOT_TOKEN}"
    async with httpx.AsyncClient(timeout=45) as client:
        # описание и команды: обновляем, только если текст поменялся
        try:
            sig = hashlib.sha1((BOT_SHORT + BOT_DESCRIPTION).encode()).hexdigest()
            if await asyncio.to_thread(_meta_get, "bot_desc") != sig:
                await client.post(base + "/setMyDescription", json={"description": BOT_DESCRIPTION})
                await client.post(base + "/setMyShortDescription", json={"short_description": BOT_SHORT})
                await client.post(base + "/setMyCommands", json={"commands": [
                    {"command": "start", "description": "Открыть Геотегер"},
                    {"command": "help", "description": "Что умеет приложение"}]})
                await asyncio.to_thread(_meta_set, "bot_desc", sig)
        except Exception as exc:
            log.warning("Не удалось обновить описание бота: %s", exc)
        # если у бота настроен вебхук (другая программа), не мешаем ей
        try:
            info = (await client.get(base + "/getWebhookInfo")).json()
            if info.get("ok") and info["result"].get("url"):
                log.warning("У бота настроен вебхук, приветствие отключено")
                return
        except Exception:
            pass
        offset = int(await asyncio.to_thread(_meta_get, "bot_offset") or 0)
        while True:
            try:
                r = await client.get(base + "/getUpdates", params={
                    "timeout": 30, "offset": offset, "allowed_updates": json.dumps(["message"])})
                data = r.json()
                if not data.get("ok"):
                    await asyncio.sleep(15)          # например, конфликт с другим экземпляром
                    continue
                for upd in data.get("result", []):
                    offset = upd["update_id"] + 1
                    msg = upd.get("message") or {}
                    text = bot_reply_for(msg)
                    if text:
                        payload = {"chat_id": msg["chat"]["id"], "text": text, "disable_web_page_preview": True}
                        if _open_button():
                            payload["reply_markup"] = _open_button()
                        try:
                            await client.post(base + "/sendMessage", json=payload)
                        except Exception as exc:
                            log.warning("Не отправлено приветствие: %s", exc)
                if data.get("result"):
                    await asyncio.to_thread(_meta_set, "bot_offset", str(offset))
            except Exception as exc:
                log.warning("Ошибка опроса бота: %s", exc)
                await asyncio.sleep(5)



# ---------------- рейтинг: неделя и всё время ----------------
def msk_week_start(ts: int) -> int:
    """Понедельник 00:00 по Москве."""
    d0 = msk_day_start(ts)
    return d0 - time.gmtime(ts + 3 * 3600).tm_wday * 86400


def xp_sql_since(uid: str, since: int) -> str:
    """Опыт, набранный начиная с момента since (та же формула, что xp_sql)."""
    t = int(since)
    return (
        f"({XP['review']}*(SELECT COUNT(*) FROM reviews rx WHERE rx.user_id={uid} AND rx.created_at>={t})"
        f" + {XP['text']}*(SELECT COUNT(*) FROM reviews rt WHERE rt.user_id={uid} AND rt.created_at>={t}"
        f" AND length(trim(rt.text))>={TEXT_MIN})"
        f" + {XP['helpful']}*(SELECT COUNT(*) FROM votes vx JOIN reviews ry ON ry.id=vx.review_id"
        f" WHERE ry.user_id={uid} AND vx.value=1 AND vx.created_at>={t})"
        f" + {XP['venue']}*(SELECT COUNT(*) FROM venues wx WHERE wx.added_by={uid} AND wx.created_at>={t})"
        f" + {XP['venue_ok']}*(SELECT COUNT(*) FROM venues wy WHERE wy.added_by={uid} AND "
        f"(SELECT MIN(rz.created_at) FROM reviews rz WHERE rz.venue_id=wy.id AND rz.user_id!={uid})>={t})"
        f" + {XP['update']}*(SELECT COUNT(*) FROM review_history hx WHERE hx.user_id={uid} AND hx.archived_at>={t})"
        f" + {XP['confirm']}*(SELECT COUNT(*) FROM confirmations cx WHERE cx.user_id={uid} AND cx.created_at>={t})"
        f" + {XP['news']}*(SELECT COUNT(*) FROM news nx WHERE nx.user_id={uid} AND nx.status='published'"
        f" AND nx.deleted=0 AND nx.published_at>={t})"
        f" + {XP['poi']}*(SELECT COUNT(*) FROM pois px WHERE px.added_by={uid} AND px.deleted=0 AND px.created_at>={t})"
        f" + {XP['poi_ok']}*(SELECT COUNT(*) FROM pois py WHERE py.added_by={uid} AND py.deleted=0 AND "
        f"(SELECT MIN(pv.created_at) FROM poi_votes pv WHERE pv.poi_id=py.id AND pv.value=1 AND pv.user_id!={uid})>={t})"
        f" + {XP['qa']}*(SELECT COUNT(*) FROM venue_answers ax WHERE ax.answer_user={uid} AND ax.created_at>={t}))"
    )


@app.get("/api/rating")
def rating(period: str = "week", u: dict = Depends(current_user)):
    now = int(time.time())
    week = period != "all"
    since = msk_week_start(now)
    with db() as con:
        total = all_xp(con)
        period_xp = all_xp(con, since) if week else total
        people = con.execute("SELECT tg_id, name, pub_id FROM users WHERE banned=0 AND deleted=0").fetchall()
    ranked = [{"tg_id": p["tg_id"], "name": p["name"], "pub_id": p["pub_id"], "xp": period_xp.get(p["tg_id"], 0),
               "total": total.get(p["tg_id"], 0)} for p in people]
    my_xp = period_xp.get(u["id"], 0)
    my_rank = (sum(1 for r in ranked if r["xp"] > my_xp) + 1) if my_xp > 0 else None
    rows = sorted((r for r in ranked if r["xp"] > 0), key=lambda r: (-r["xp"], -r["total"]))[:50]
    top, prev_xp, rank = [], None, 0
    for i, r in enumerate(rows):
        if r["xp"] != prev_xp:            # одинаковый опыт — одинаковое место
            rank, prev_xp = i + 1, r["xp"]
        top.append({"rank": rank, "name": r["name"], "pid": r["pub_id"], "xp": r["xp"],
                    "level_icon": level_icon(r["total"]), "me": r["tg_id"] == u["id"]})
    return {"period": "week" if week else "all",
            "since": since if week else None, "ends": since + 7 * 86400 if week else None,
            "top": top, "me": {"rank": my_rank, "xp": my_xp}}



# ---------------- связь с разработчиком ----------------
FEEDBACK_KINDS = {"idea": "Идея", "bug": "Ошибка", "other": "Другое"}


class FeedbackIn(BaseModel):
    kind: str = Field(pattern="^(idea|bug|other)$")
    text: str = Field(min_length=10, max_length=2000)


def _fb_row(r):
    return {"id": r["id"], "kind": r["kind"], "kind_label": FEEDBACK_KINDS.get(r["kind"], "Другое"),
            "text": r["text"], "ts": r["created_at"], "status": r["status"], "reply": r["reply"],
            "replied_at": r["replied_at"]}


@app.post("/api/feedback")
def feedback_send(body: FeedbackIn, u: dict = Depends(current_user)):
    text = body.text.strip()
    if len(text) < 10:
        raise HTTPException(400, "Опишите подробнее, от 10 символов")
    now = int(time.time())
    with db() as con:
        if not u["is_admin"]:
            last = con.execute("SELECT MAX(created_at) t FROM feedback WHERE user_id=?", (u["id"],)).fetchone()["t"]
            if last and now - last < 120:
                raise HTTPException(429, "Следующее обращение можно отправить через пару минут")
            today = con.execute("SELECT COUNT(*) c FROM feedback WHERE user_id=? AND created_at>?",
                                (u["id"], now - 86400)).fetchone()["c"]
            if today >= 5:
                raise HTTPException(429, "Не больше 5 обращений в сутки")
        cur = con.execute("INSERT INTO feedback(user_id,kind,text,created_at) VALUES(?,?,?,?)",
                          (u["id"], body.kind, text, now))
        for aid in ADMIN_IDS:
            notify(con, aid, "feedback_new",
                   f"Обращение ({FEEDBACK_KINDS[body.kind]}) от {u['name']}: {text[:100]}", {"admin": "feedback"},
                   actor=u["id"])
    return {"id": cur.lastrowid}


@app.get("/api/feedback/mine")
def feedback_mine(u: dict = Depends(current_user)):
    with db() as con:
        rows = con.execute("SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC LIMIT 10", (u["id"],)).fetchall()
    return [_fb_row(r) for r in rows]


@app.get("/api/admin/feedback")
def admin_feedback(u: dict = Depends(admin_user)):
    with db() as con:
        rows = con.execute(
            "SELECT f.*, us.name, us.pub_id FROM feedback f JOIN users us ON us.tg_id=f.user_id "
            "ORDER BY CASE f.status WHEN 'new' THEN 0 ELSE 1 END, f.id DESC LIMIT 100").fetchall()
    return [{**_fb_row(r), "author": r["name"], "pid": r["pub_id"]} for r in rows]


class FeedbackReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@app.post("/api/admin/feedback/{fid}/reply")
def admin_feedback_reply(fid: int, body: FeedbackReplyIn, u: dict = Depends(admin_user)):
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Пустой ответ")
    with db() as con:
        f = con.execute("SELECT user_id FROM feedback WHERE id=?", (fid,)).fetchone()
        if not f:
            raise HTTPException(404, "Обращение не найдено")
        con.execute("UPDATE feedback SET reply=?, replied_at=?, status='done' WHERE id=?", (text, int(time.time()), fid))
        notify(con, f["user_id"], "feedback_reply", f"Ответ разработчика на ваше обращение: {text[:200]}",
               {"feedback": fid})
    return {"ok": True}


@app.post("/api/admin/feedback/{fid}/done")
def admin_feedback_done(fid: int, u: dict = Depends(admin_user)):
    with db() as con:
        if not con.execute("SELECT 1 FROM feedback WHERE id=?", (fid,)).fetchone():
            raise HTTPException(404, "Обращение не найдено")
        con.execute("UPDATE feedback SET status=CASE status WHEN 'done' THEN 'new' ELSE 'done' END WHERE id=?", (fid,))
    return {"ok": True}



# ---------------- удаление аккаунта ----------------
DELETED_NAME = "Пользователь удалился"
BANNED_NAME = "Заблокирован за нарушение правил"
# где хранится автор/владелец: эти записи остаются, но переходят на анонимный номер
USER_REFS = [
    ("reviews", "user_id"), ("review_history", "user_id"), ("votes", "user_id"), ("comments", "user_id"),
    ("messages", "user_id"), ("news", "user_id"), ("news_votes", "user_id"), ("venues", "added_by"),
    ("pois", "added_by"), ("poi_votes", "user_id"), ("confirmations", "user_id"), ("venue_live", "user_id"),
    ("reports", "user_id"), ("reports", "target_user"),
    ("message_votes", "user_id"), ("venue_answers", "question_user"), ("venue_answers", "answer_user"),
    ("poll_votes", "user_id"), ("poi_edits", "user_id"), ("pois", "edited_by"),
]


@app.post("/api/me/delete")
def me_delete(u: dict = Depends(current_user)):
    uid = u["id"]
    with db() as con:
        old = con.execute("SELECT created_at FROM users WHERE tg_id=?", (uid,)).fetchone()
        # личные данные удаляем совсем
        for table in ("beacons", "notifications", "daily_active", "feedback", "usage"):
            con.execute(f"DELETE FROM {table} WHERE user_id=?", (uid,))
        con.execute("DELETE FROM shift_breaks WHERE shift_id IN (SELECT id FROM shifts WHERE user_id=?)", (uid,))
        con.execute("DELETE FROM shifts WHERE user_id=?", (uid,))
        # анонимный номер вместо Telegram ID (отрицательный, чтобы не совпасть с настоящими)
        while True:
            anon = -secrets.randbelow(10 ** 12) - 1
            if not con.execute("SELECT 1 FROM users WHERE tg_id=?", (anon,)).fetchone():
                break
        con.execute(
            "INSERT INTO users(tg_id,name,created_at,pub_id,deleted,push_enabled,accepted_version) VALUES(?,?,?,?,1,0,0)",
            (anon, DELETED_NAME, old["created_at"] if old else int(time.time()), secrets.token_hex(4)))
        for table, col in USER_REFS:
            con.execute(f"UPDATE {table} SET {col}=? WHERE {col}=?", (anon, uid))
        con.execute("DELETE FROM users WHERE tg_id=?", (uid,))
    _hint_sent.pop(uid, None)
    return {"ok": True}



# ---------------- срок хранения чата ----------------
def purge_old_messages() -> int:
    with db() as con:
        days = get_settings(con)["chat_retention_days"]
        if not days:
            return 0
        border = int(time.time()) - days * 86400
        ids = [r[0] for r in con.execute("SELECT id FROM messages WHERE created_at < ?", (border,))]
        for i in range(0, len(ids), 500):
            part = ids[i:i + 500]
            marks = ",".join("?" * len(part))
            con.execute(f"DELETE FROM reports WHERE kind='message' AND ref_id IN ({marks})", part)
            con.execute(f"DELETE FROM message_votes WHERE message_id IN ({marks})", part)
            con.execute(f"DELETE FROM messages WHERE id IN ({marks})", part)
        return len(ids)


async def cleanup_loop():
    while True:
        try:
            await asyncio.to_thread(purge_old_usage)
            n = await asyncio.to_thread(purge_old_messages)
            if n:
                log.info("Удалено старых сообщений чата: %s", n)
        except Exception as exc:
            log.warning("Ошибка очистки чата: %s", exc)
        await asyncio.sleep(3600)



# ---------------- дневник смены (личный, виден только самому курьеру) ----------------
MONEY_MAX = 1_000_000


def _shift_out(con, r) -> dict:
    now = int(time.time())
    end = r["ended_at"] or now
    brs = con.execute("SELECT started_at, ended_at FROM shift_breaks WHERE shift_id=? ORDER BY id", (r["id"],)).fetchall()
    br_secs = 0
    for b in brs:                       # перерыв считаем только внутри смены
        bs, be = max(b["started_at"], r["started_at"]), min(b["ended_at"] or end, end)
        br_secs += max(0, be - bs)
    work = max(0, end - r["started_at"] - br_secs)
    income = r["earned"] + r["tips"]
    expenses = r["food"] + r["transport"]
    hours = work / 3600
    rate = float(r["tax_rate"] if "tax_rate" in r.keys() else 6)
    tax_tips = bool(r["tax_tips"]) if "tax_tips" in r.keys() else True
    tax = round((r["earned"] + (r["tips"] if tax_tips else 0)) * rate / 100)
    net = income - expenses - tax
    return {
        "id": r["id"], "started_at": r["started_at"], "ended_at": r["ended_at"], "active": r["ended_at"] == 0,
        "on_break": r["ended_at"] == 0 and any(b["ended_at"] == 0 for b in brs),
        "break_started": next((b["started_at"] for b in brs if b["ended_at"] == 0), 0),
        "breaks": len(brs), "break_secs": br_secs, "work_secs": work,
        "orders": r["orders"], "earned": r["earned"], "tips": r["tips"], "food": r["food"], "transport": r["transport"],
        "income": income, "expenses": expenses, "tax": tax, "tax_rate": rate, "tax_tips": tax_tips, "net": net,
        "per_hour": round(income / hours) if hours >= 0.05 and income else 0,
        "net_per_hour": round(net / hours) if hours >= 0.05 and net > 0 else 0,
        "per_order": round(r["earned"] / r["orders"]) if r["orders"] else 0,
    }


def _active_shift(con, uid):
    return con.execute("SELECT * FROM shifts WHERE user_id=? AND ended_at=0 ORDER BY id DESC LIMIT 1", (uid,)).fetchone()


@app.get("/api/shifts/current")
def shift_current(u: dict = Depends(current_user)):
    with db() as con:
        r = _active_shift(con, u["id"])
        return {"shift": _shift_out(con, r) if r else None}


@app.post("/api/shifts/start")
def shift_start(u: dict = Depends(current_user)):
    with db() as con:
        if _active_shift(con, u["id"]):
            raise HTTPException(400, "Смена уже идёт")
        con.execute("INSERT INTO shifts(user_id,started_at) VALUES(?,?)", (u["id"], int(time.time())))
        return {"shift": _shift_out(con, _active_shift(con, u["id"]))}


@app.post("/api/shifts/break")
def shift_break(u: dict = Depends(current_user)):
    """Перерыв: начать или закончить."""
    now = int(time.time())
    with db() as con:
        r = _active_shift(con, u["id"])
        if not r:
            raise HTTPException(400, "Смена не начата")
        open_b = con.execute("SELECT id FROM shift_breaks WHERE shift_id=? AND ended_at=0", (r["id"],)).fetchone()
        if open_b:
            con.execute("UPDATE shift_breaks SET ended_at=? WHERE id=?", (now, open_b["id"]))
        else:
            con.execute("INSERT INTO shift_breaks(shift_id,started_at) VALUES(?,?)", (r["id"], now))
        return {"shift": _shift_out(con, r)}


class ShiftMoneyIn(BaseModel):
    orders: int = Field(ge=0, le=300)
    earned: int = Field(ge=0, le=MONEY_MAX)
    tips: int = Field(default=0, ge=0, le=MONEY_MAX)
    food: int = Field(default=0, ge=0, le=MONEY_MAX)
    transport: int = Field(default=0, ge=0, le=MONEY_MAX)


class ShiftEditIn(ShiftMoneyIn):
    tax_rate: float = Field(default=-1, ge=-1, le=30)     # -1 — оставить как было


class ShiftFinishIn(ShiftMoneyIn):
    ended_at: int = 0          # 0 — сейчас; иначе время, когда на самом деле закончили


@app.post("/api/shifts/finish")
def shift_finish(body: ShiftFinishIn, u: dict = Depends(current_user)):
    now = int(time.time())
    with db() as con:
        r = _active_shift(con, u["id"])
        if not r:
            raise HTTPException(400, "Смена не начата")
        end = int(getattr(body, "ended_at", 0) or 0) or now
        if end > now or end <= r["started_at"]:
            raise HTTPException(400, "Время окончания должно быть после начала смены и не позже текущего")
        con.execute("UPDATE shift_breaks SET ended_at=? WHERE shift_id=? AND ended_at=0", (end, r["id"]))
        pref = con.execute("SELECT tax_rate, tax_tips FROM users WHERE tg_id=?", (u["id"],)).fetchone()
        con.execute("UPDATE shifts SET ended_at=?, orders=?, earned=?, tips=?, food=?, transport=?, tax_rate=?, tax_tips=? "
                    "WHERE id=?",
                    (end, body.orders, body.earned, getattr(body, "tips", 0) or 0, getattr(body, "food", 0) or 0,
                     getattr(body, "transport", 0) or 0, pref["tax_rate"], pref["tax_tips"], r["id"]))
        r = con.execute("SELECT * FROM shifts WHERE id=?", (r["id"],)).fetchone()
        return {"shift": _shift_out(con, r)}


@app.post("/api/shifts/cancel")
def shift_cancel(u: dict = Depends(current_user)):
    with db() as con:
        r = _active_shift(con, u["id"])
        if r:
            con.execute("DELETE FROM shift_breaks WHERE shift_id=?", (r["id"],))
            con.execute("DELETE FROM shifts WHERE id=?", (r["id"],))
    return {"ok": True}


def _own_shift(con, sid: int, uid: int):
    r = con.execute("SELECT * FROM shifts WHERE id=? AND user_id=?", (sid, uid)).fetchone()
    if not r:
        raise HTTPException(404, "Смена не найдена")
    return r


@app.post("/api/shifts/{sid}/edit")
def shift_edit(sid: int, body: ShiftEditIn, u: dict = Depends(current_user)):
    with db() as con:
        r = _own_shift(con, sid, u["id"])
        if not r["ended_at"]:
            raise HTTPException(400, "Сначала закончите смену")
        con.execute("UPDATE shifts SET orders=?, earned=?, tips=?, food=?, transport=? WHERE id=?",
                    (body.orders, body.earned, getattr(body, "tips", 0) or 0, getattr(body, "food", 0) or 0,
                     getattr(body, "transport", 0) or 0, sid))
        rate = getattr(body, "tax_rate", -1)
        if rate is not None and rate >= 0:
            con.execute("UPDATE shifts SET tax_rate=? WHERE id=?", (round(float(rate), 2), sid))
        return {"shift": _shift_out(con, con.execute("SELECT * FROM shifts WHERE id=?", (sid,)).fetchone())}


@app.post("/api/shifts/{sid}/delete")
def shift_delete(sid: int, u: dict = Depends(current_user)):
    with db() as con:
        _own_shift(con, sid, u["id"])
        con.execute("DELETE FROM shift_breaks WHERE shift_id=?", (sid,))
        con.execute("DELETE FROM shifts WHERE id=?", (sid,))
    return {"ok": True}


def period_bounds(period: str, offset: int, now: int):
    """Границы дня, недели (с понедельника) или месяца по Москве; offset: 0 — текущий, -1 — прошлый."""
    if period == "day":
        start = msk_day_start(now) + offset * 86400
        return start, start + 86400
    if period == "week":
        start = msk_week_start(now) + offset * 7 * 86400
        return start, start + 7 * 86400
    t = time.gmtime(now + 3 * 3600)
    y, m = t.tm_year, t.tm_mon + offset
    while m < 1:
        y, m = y - 1, m + 12
    while m > 12:
        y, m = y + 1, m - 12
    start = calendar.timegm((y, m, 1, 0, 0, 0)) - 3 * 3600
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    return start, calendar.timegm((ny, nm, 1, 0, 0, 0)) - 3 * 3600


@app.get("/api/shifts/summary")
def shift_summary(period: str = "week", offset: int = 0, u: dict = Depends(current_user)):
    period = period if period in ("day", "week", "month") else "week"
    offset = max(-120, min(0, int(offset)))
    start, end = period_bounds(period, offset, int(time.time()))
    with db() as con:
        rows = con.execute("SELECT * FROM shifts WHERE user_id=? AND ended_at>0 AND started_at>=? AND started_at<? "
                           "ORDER BY started_at DESC", (u["id"], start, end)).fetchall()
        shifts = [_shift_out(con, r) for r in rows]
    t = {k: sum(x[k] for x in shifts) for k in ("orders", "earned", "tips", "food", "transport", "income",
                                                 "expenses", "tax", "net", "work_secs", "break_secs")}
    hours = t["work_secs"] / 3600
    t.update(shifts=len(shifts),
             per_hour=round(t["income"] / hours) if hours >= 0.05 and t["income"] else 0,
             per_order=round(t["earned"] / t["orders"]) if t["orders"] else 0,
             net_per_hour=round(t["net"] / hours) if hours >= 0.05 and t["net"] > 0 else 0)
    days = []
    if period != "day":
        d = start
        while d < end:
            day = [x for x in shifts if d <= x["started_at"] < d + 86400]
            days.append({"start": d, "income": sum(x["income"] for x in day), "net": sum(x["net"] for x in day),
                         "work_secs": sum(x["work_secs"] for x in day), "orders": sum(x["orders"] for x in day)})
            d += 86400
    return {"period": period, "offset": offset, "start": start, "end": end, "totals": t, "days": days, "shifts": shifts}



# ---------------- налог в дневнике смены ----------------
class TaxIn(BaseModel):
    tax_rate: float = Field(ge=0, le=30)
    tax_tips: bool = True


@app.get("/api/shifts/settings")
def shift_settings(u: dict = Depends(current_user)):
    with db() as con:
        r = con.execute("SELECT tax_rate, tax_tips FROM users WHERE tg_id=?", (u["id"],)).fetchone()
    return {"tax_rate": r["tax_rate"], "tax_tips": bool(r["tax_tips"])}


@app.post("/api/shifts/settings")
def shift_settings_save(body: TaxIn, u: dict = Depends(current_user)):
    rate = round(float(body.tax_rate), 2)
    with db() as con:
        con.execute("UPDATE users SET tax_rate=?, tax_tips=? WHERE tg_id=?",
                    (rate, 1 if getattr(body, "tax_tips", True) else 0, u["id"]))
        # текущая (ещё не закрытая) смена тоже получает новую ставку
        con.execute("UPDATE shifts SET tax_rate=?, tax_tips=? WHERE user_id=? AND ended_at=0",
                    (rate, 1 if getattr(body, "tax_tips", True) else 0, u["id"]))
    return {"tax_rate": rate, "tax_tips": bool(getattr(body, "tax_tips", True))}



# ---------------- резервные копии базы ----------------
BACKUP_DIR = Path(os.getenv("BACKUP_DIR") or (Path(DB_PATH).parent / "backups"))
BACKUP_KEEP = 7
BACKUP_EVERY = 24 * 3600
TG_FILE_LIMIT = 49 * 1024 * 1024          # бот может отправить файл до 50 МБ
_BACKUP_NAME = re.compile(r"^geoteger-\d{8}-\d{6}(-\d+)?\.db\.gz$")


def list_backups() -> list:
    if not BACKUP_DIR.is_dir():
        return []
    files = [f for f in BACKUP_DIR.iterdir() if _BACKUP_NAME.match(f.name)]

    def key(f: Path):
        m = re.match(r"^geoteger-(\d{8})-(\d{6})(?:-(\d+))?", f.name)   # время из имени + номер в пределах секунды
        return (m.group(1), m.group(2), int(m.group(3) or 0))
    files.sort(key=key, reverse=True)
    return files


def make_backup() -> Path:
    """Консистентная копия SQLite (работает и во время записи), сжатая gzip."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(now + 3 * 3600))
    ms = int(now * 1000) % 1000
    # миллисекунды и растущий номер: имя никогда не совпадёт с удалённой ротацией копией
    taken = [int(m.group(1)) for f in list_backups() for m in [re.match(rf"^geoteger-{stamp}-(\d+)", f.name)] if m]
    ms = max([ms] + [t + 1 for t in taken])
    name = f"geoteger-{stamp}-{ms:03d}.db.gz"
    tmp = BACKUP_DIR / (name + ".tmp")
    src = sqlite3.connect(DB_PATH, timeout=30)
    dst = sqlite3.connect(tmp)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    out = BACKUP_DIR / name
    with open(tmp, "rb") as fi, gzip.open(out, "wb", compresslevel=6) as fo:
        shutil.copyfileobj(fi, fo)
    tmp.unlink(missing_ok=True)
    for old in list_backups()[BACKUP_KEEP:]:       # храним последние 7
        old.unlink(missing_ok=True)
    return out


def _backup_info(f: Path) -> dict:
    st = f.stat()
    return {"name": f.name, "size": st.st_size, "created": int(st.st_mtime)}


def _download_sig(name: str, exp: int) -> str:
    key = hashlib.sha256(("backup:" + BOT_TOKEN).encode()).digest()
    return hmac.new(key, f"{name}:{exp}".encode(), hashlib.sha256).hexdigest()


def _backup_caption(f: Path) -> str:
    return (f"🗄 Резервная копия Геотегер\n{f.name}\n{round(f.stat().st_size / 1024 / 1024, 2)} МБ\n"
            "Храните этот файл: из него можно восстановить базу.")


async def send_backup_async(client, f: Path, chat_id: int) -> bool:
    if f.stat().st_size > TG_FILE_LIMIT:
        return False
    with open(f, "rb") as fh:
        r = await client.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument",
                              data={"chat_id": str(chat_id), "caption": _backup_caption(f)},
                              files={"document": (f.name, fh, "application/gzip")})
    return r.status_code == 200


async def backup_loop():
    await asyncio.sleep(60)                     # даём серверу спокойно запуститься
    while True:
        try:
            files = list_backups()
            if not files or time.time() - files[0].stat().st_mtime > BACKUP_EVERY - 600:
                f = await asyncio.to_thread(make_backup)
                log.info("Сделана резервная копия: %s", f.name)
                with db() as con:
                    send = get_settings(con)["backup_send"]
                if send and BOT_TOKEN and ADMIN_IDS:
                    async with httpx.AsyncClient(timeout=120) as client:
                        for aid in ADMIN_IDS:
                            try:
                                ok = await send_backup_async(client, f, aid)
                                if not ok:
                                    log.warning("Копия не отправлена админу %s (возможно, больше 50 МБ)", aid)
                            except Exception as exc:
                                log.warning("Не удалось отправить копию: %s", exc)
        except Exception as exc:
            log.warning("Ошибка резервного копирования: %s", exc)
        await asyncio.sleep(3600)


@app.get("/api/admin/backups")
def admin_backups(u: dict = Depends(admin_user)):
    files = list_backups()
    return {"backups": [_backup_info(f) for f in files], "keep": BACKUP_KEEP,
            "next_in": max(0, int(BACKUP_EVERY - (time.time() - files[0].stat().st_mtime))) if files else 0}


@app.post("/api/admin/backups/create")
def admin_backup_create(u: dict = Depends(admin_user)):
    return _backup_info(make_backup())


def _backup_file(name: str) -> Path:
    if not _BACKUP_NAME.match(name or ""):
        raise HTTPException(400, "Неверное имя копии")
    f = BACKUP_DIR / name
    if not f.is_file():
        raise HTTPException(404, "Копия не найдена")
    return f


@app.post("/api/admin/backups/{name}/send")
def admin_backup_send(name: str, u: dict = Depends(admin_user)):
    f = _backup_file(name)
    if f.stat().st_size > TG_FILE_LIMIT:
        raise HTTPException(400, "Копия больше 50 МБ, бот не сможет её отправить. Скачайте её по ссылке")
    with open(f, "rb") as fh:
        r = httpx.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendDocument", timeout=120,
                       data={"chat_id": str(u["id"]), "caption": _backup_caption(f)},
                       files={"document": (f.name, fh, "application/gzip")})
    if r.status_code != 200:
        raise HTTPException(502, "Telegram не принял файл. Нажмите «Старт» в чате с ботом и попробуйте снова")
    return {"ok": True}


@app.post("/api/admin/backups/{name}/link")
def admin_backup_link(name: str, u: dict = Depends(admin_user)):
    """Ссылка на скачивание на 10 минут (у браузера нет нашей подписи входа, поэтому — подписанная ссылка)."""
    f = _backup_file(name)
    exp = int(time.time()) + 600
    return {"url": f"/api/backups/download?name={f.name}&exp={exp}&sig={_download_sig(f.name, exp)}", "expires": exp}


@app.get("/api/backups/download")
def backup_download(name: str = "", exp: int = 0, sig: str = ""):
    if not BOT_TOKEN or exp < time.time() or not hmac.compare_digest(_download_sig(name, exp), sig or ""):
        raise HTTPException(403, "Ссылка устарела или неверна")
    f = _backup_file(name)
    return FileResponse(f, media_type="application/gzip", filename=f.name)



# ---------------- вопросы и ответы о заведении ----------------
def venue_qa(con, vid: int) -> dict:
    rows = con.execute(
        "SELECT a.*, qu.name AS qn, qu.pub_id AS qp, au.name AS an, au.pub_id AS ap FROM venue_answers a "
        "JOIN users qu ON qu.tg_id=a.question_user JOIN users au ON au.tg_id=a.answer_user "
        "WHERE a.venue_id=? ORDER BY a.question_at DESC, a.likes DESC", (vid,)).fetchall()
    answered, by_q = [], {}
    for r in rows:
        q = by_q.get(r["question_id"])
        if not q:
            q = {"id": r["question_id"], "text": r["question_text"], "ts": r["question_at"], "author": r["qn"],
                 "pid": r["qp"], "answers": []}
            by_q[r["question_id"]] = q
            answered.append(q)
        q["answers"].append({"id": r["id"], "message_id": r["answer_id"], "text": r["answer_text"], "author": r["an"],
                             "pid": r["ap"], "likes": r["likes"]})
    for q in answered:
        q["answers"].sort(key=lambda x: -x["likes"])
    open_q = con.execute(
        "SELECT m.id, m.text, m.created_at, u.name, u.pub_id, "
        "(SELECT COUNT(*) FROM messages x WHERE x.reply_to=m.id AND x.deleted=0) AS replies "
        "FROM messages m JOIN users u ON u.tg_id=m.user_id WHERE m.venue_id=? AND m.deleted=0 "
        "AND m.id NOT IN (SELECT question_id FROM venue_answers) AND m.created_at>? ORDER BY m.id DESC LIMIT 5",
        (vid, int(time.time()) - 30 * 86400)).fetchall()
    return {"answered": answered[:30],
            "open": [{"id": r["id"], "text": r["text"], "ts": r["created_at"], "author": r["name"], "pid": r["pub_id"],
                      "replies": r["replies"]} for r in open_q]}


@app.get("/api/venues/{vid}/qa")
def venue_qa_get(vid: int, u: dict = Depends(current_user)):
    with db() as con:
        if not con.execute("SELECT 1 FROM venues WHERE id=?", (vid,)).fetchone():
            raise HTTPException(404, "Заведение не найдено")
        out = venue_qa(con, vid)
        out["min_likes"] = get_settings(con)["qa_min_likes"]
    return out


@app.post("/api/admin/qa/{aid}/delete")
def admin_qa_delete(aid: int, u: dict = Depends(admin_user)):
    with db() as con:
        con.execute("DELETE FROM venue_answers WHERE id=?", (aid,))
    return {"ok": True}



# ---------------- счётчики использования функций ----------------
USAGE_EVENTS = {
    "open_venue": "Открыли карточку заведения", "open_poi": "Открыли полезную точку",
    "review_form": "Открыли форму отзыва", "route": "Построили маршрут", "live_mark": "Отметили «что там сейчас»",
    "qa_open": "Открыли вопросы и ответы", "ask": "Задали вопрос о заведении", "search": "Искали заведение",
    "filter": "Открыли фильтр", "near_on": "Включили «только рядом»", "locate": "Нажали «где я»",
    "add_point": "Начали добавлять точку", "beacon_open": "Открыли «Я на линии»", "beacon_start": "Вышли на линию",
    "chat_open": "Открыли чат", "chat_send": "Написали в чат", "chat_reply": "Ответили в чате",
    "chat_vote": "Оценили сообщение в чате", "news_open": "Открыли новости", "news_add": "Открыли форму новости",
    "rate_open": "Открыли рейтинг", "poll_open": "Открыли голосование", "poll_vote": "Проголосовали",
    "profile_open": "Открыли профиль", "shift_open": "Открыли дневник смены", "shift_start": "Начали смену",
    "shift_finish": "Закрыли смену", "notif_open": "Открыли уведомления", "feedback_open": "Открыли связь с разработчиком",
}
USAGE_KEEP_DAYS = 180


class TrackItem(BaseModel):
    e: str = Field(max_length=40)
    n: int = Field(default=1, ge=1, le=1000)


class TrackIn(BaseModel):
    events: list[TrackItem] = Field(default_factory=list, max_length=60)


@app.post("/api/track")
def track(body: TrackIn, u: dict = Depends(current_user)):
    day = msk_day(int(time.time()))
    rows = [(day, it.e, u["id"], min(int(it.n), 50)) for it in body.events if it.e in USAGE_EVENTS]
    if rows:
        with db() as con:
            con.executemany("INSERT INTO usage(day,event,user_id,n) VALUES(?,?,?,?) "
                            "ON CONFLICT(day,event,user_id) DO UPDATE SET n=MIN(n+excluded.n, 100000)", rows)
    return {"ok": True, "saved": len(rows)}


def purge_old_usage() -> None:
    with db() as con:
        con.execute("DELETE FROM usage WHERE day < ?", (msk_day(int(time.time()) - USAGE_KEEP_DAYS * 86400),))


@app.get("/api/admin/usage")
def admin_usage(days: int = 7, u: dict = Depends(admin_user)):
    days = max(1, min(int(days), 90))
    since = msk_day(int(time.time()) - (days - 1) * 86400)
    with db() as con:
        active = con.execute("SELECT COUNT(DISTINCT user_id) FROM daily_active WHERE day>=?", (since,)).fetchone()[0]
        rows = {r["event"]: r for r in con.execute(
            "SELECT event, COUNT(DISTINCT user_id) AS users, SUM(n) AS total FROM usage WHERE day>=? GROUP BY event",
            (since,))}
    out = []
    for key, label in USAGE_EVENTS.items():
        r = rows.get(key)
        users = r["users"] if r else 0
        out.append({"event": key, "label": label, "users": users, "total": r["total"] if r else 0,
                    "share": round(users * 100 / active) if active else 0})
    out.sort(key=lambda x: (-x["users"], -x["total"]))
    return {"days": days, "active": active, "events": out}


# ---------------- голосования (например, за лучшую доставку) ----------------
class PollIn(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    options: list[str] = Field(min_length=2, max_length=15)
    notify: bool = False


class PollVoteIn(BaseModel):
    option_id: int


def _poll_out(con, p, u: dict) -> dict:
    opts = con.execute("SELECT id, label FROM poll_options WHERE poll_id=? ORDER BY pos", (p["id"],)).fetchall()
    counts = {r["option_id"]: r["c"] for r in con.execute(
        "SELECT option_id, COUNT(*) AS c FROM poll_votes WHERE poll_id=? GROUP BY option_id", (p["id"],))}
    total = sum(counts.values())
    mine = con.execute("SELECT option_id FROM poll_votes WHERE poll_id=? AND user_id=?", (p["id"], u["id"])).fetchone()
    active = p["ended_at"] == 0
    show = (not active) or bool(mine) or u["is_admin"]          # результаты — после своего голоса или по окончании
    options = []
    for o in opts:
        item = {"id": o["id"], "label": o["label"]}
        if show:
            c = counts.get(o["id"], 0)
            item.update(votes=c, pct=round(c * 100 / total) if total else 0)
        options.append(item)
    winner = None
    if show and total:
        best = max(options, key=lambda x: x.get("votes", 0))
        if sum(1 for x in options if x.get("votes") == best["votes"]) == 1:
            winner = best["id"]
    return {"id": p["id"], "title": p["title"], "started_at": p["started_at"], "ended_at": p["ended_at"],
            "active": active, "total": total, "my_vote": mine["option_id"] if mine else None,
            "show_results": show, "winner": winner, "options": options}


@app.get("/api/polls")
def polls_list(u: dict = Depends(current_user)):
    with db() as con:
        act = con.execute("SELECT * FROM polls WHERE ended_at=0 ORDER BY id DESC").fetchall()
        fin = con.execute("SELECT * FROM polls WHERE ended_at>0 ORDER BY ended_at DESC LIMIT 10").fetchall()
        return {"active": [_poll_out(con, p, u) for p in act], "finished": [_poll_out(con, p, u) for p in fin]}


@app.post("/api/polls/{pid}/vote")
def poll_vote(pid: int, body: PollVoteIn, u: dict = Depends(current_user)):
    with db() as con:
        p = con.execute("SELECT * FROM polls WHERE id=?", (pid,)).fetchone()
        if not p:
            raise HTTPException(404, "Голосование не найдено")
        if p["ended_at"]:
            raise HTTPException(400, "Голосование уже завершено")
        if not con.execute("SELECT 1 FROM poll_options WHERE id=? AND poll_id=?", (body.option_id, pid)).fetchone():
            raise HTTPException(400, "Такого варианта нет")
        if con.execute("SELECT 1 FROM poll_votes WHERE poll_id=? AND user_id=?", (pid, u["id"])).fetchone():
            raise HTTPException(400, "Вы уже проголосовали в этом голосовании")
        con.execute("INSERT INTO poll_votes(poll_id,user_id,option_id,created_at) VALUES(?,?,?,?)",
                    (pid, u["id"], body.option_id, int(time.time())))
        return _poll_out(con, p, u)


@app.post("/api/admin/polls")
def admin_poll_create(body: PollIn, u: dict = Depends(admin_user)):
    title = " ".join(body.title.split())
    opts, seen = [], set()
    for o in body.options:
        o = " ".join(str(o).split())[:60]
        if o and o.lower() not in seen:
            seen.add(o.lower()); opts.append(o)
    if len(opts) < 2:
        raise HTTPException(400, "Нужно минимум два разных варианта")
    now = int(time.time())
    with db() as con:
        cur = con.execute("INSERT INTO polls(title,created_by,started_at) VALUES(?,?,?)", (title, u["id"], now))
        pid = cur.lastrowid
        con.executemany("INSERT INTO poll_options(poll_id,label,pos) VALUES(?,?,?)",
                        [(pid, o, i) for i, o in enumerate(opts)])
        sent = 0
        if getattr(body, "notify", False):
            for r in con.execute("SELECT tg_id FROM users WHERE banned=0 AND deleted=0").fetchall():
                notify(con, r["tg_id"], "poll", f"Голосование: «{title}». Выберите свой вариант во вкладке «Рейтинг»",
                       {"poll": pid}, dedupe=f"poll:{pid}")
                sent += 1
        return {**_poll_out(con, con.execute("SELECT * FROM polls WHERE id=?", (pid,)).fetchone(), u), "notified": sent}


@app.post("/api/admin/polls/{pid}/end")
def admin_poll_end(pid: int, u: dict = Depends(admin_user)):
    with db() as con:
        if not con.execute("SELECT 1 FROM polls WHERE id=?", (pid,)).fetchone():
            raise HTTPException(404, "Голосование не найдено")
        con.execute("UPDATE polls SET ended_at=? WHERE id=? AND ended_at=0", (int(time.time()), pid))
    return {"ok": True}


@app.post("/api/admin/polls/{pid}/delete")
def admin_poll_delete(pid: int, u: dict = Depends(admin_user)):
    with db() as con:
        con.execute("DELETE FROM poll_votes WHERE poll_id=?", (pid,))
        con.execute("DELETE FROM poll_options WHERE poll_id=?", (pid,))
        con.execute("DELETE FROM polls WHERE id=?", (pid,))
    return {"ok": True}


# ---------------- правка полезных точек (как в Википедии: с историей и откатом) ----------------
POI_EDIT_MIN_LEVEL = 2          # с какого уровня можно править чужие точки
POI_EDITS_PER_DAY = 10
POI_MOVE_MAX_M = 300            # автор может сдвинуть точку не дальше, чем на 300 м


class PoiEditIn(BaseModel):
    note: str = Field(default=None, max_length=200)
    price: str = Field(default=None, max_length=30)
    hours: str = Field(default=None, max_length=30)
    kind: str = Field(default=None, max_length=20)
    lat: float = Field(default=None, ge=-90, le=90)
    lon: float = Field(default=None, ge=-180, le=180)


def _poi_snapshot(con, p, user_id: int, ts: int, action: str):
    con.execute("INSERT INTO poi_edits(poi_id,user_id,created_at,kind,note,price,hours,lat,lon,action) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (p["id"], user_id, ts, p["kind"], p["note"], p["price"], p["hours"], p["lat"], p["lon"], action))


@app.post("/api/pois/{pid_}/edit")
def poi_edit(pid_: int, body: PoiEditIn, u: dict = Depends(current_user)):
    now = int(time.time())
    with db() as con:
        p = con.execute("SELECT * FROM pois WHERE id=? AND deleted=0", (pid_,)).fetchone()
        if not p:
            raise HTTPException(404, "Точка не найдена")
        can_all = u["is_admin"] or p["added_by"] == u["id"]
        st = get_settings(con)
        if not u["is_admin"]:
            if u["muted_until"] > now:
                raise HTTPException(403, "Вам временно ограничены правки")
            if not can_all:
                lvl = level_index(user_stats(con, u["id"])["xp"]) + 1
                if lvl < POI_EDIT_MIN_LEVEL:
                    raise HTTPException(403, f"Править чужие точки можно со {POI_EDIT_MIN_LEVEL} уровня")
            today = con.execute("SELECT COUNT(*) FROM poi_edits WHERE user_id=? AND created_at>? AND action='edit'",
                                (u["id"], now - 86400)).fetchone()[0]
            if today >= POI_EDITS_PER_DAY:
                raise HTTPException(429, f"Не больше {POI_EDITS_PER_DAY} правок в сутки")
        new = {k: p[k] for k in ("kind", "note", "price", "hours", "lat", "lon")}
        for k in ("note", "price", "hours"):
            v = getattr(body, k, None)
            if v is not None:
                v = " ".join(str(v).split())
                if v and not u["is_admin"]:
                    err = check_text(v, st, False)
                    if err:
                        raise HTTPException(400, err)
                new[k] = v
        kind, lat, lon = getattr(body, "kind", None), getattr(body, "lat", None), getattr(body, "lon", None)
        if kind is not None and kind != p["kind"]:
            if not can_all:
                raise HTTPException(403, "Тип точки может поменять только автор")
            if kind not in POI_KINDS:
                raise HTTPException(400, "Неизвестный тип точки")
            new["kind"] = kind
        if lat is not None and lon is not None and (abs(lat - p["lat"]) > 1e-7 or abs(lon - p["lon"]) > 1e-7):
            if not can_all:
                raise HTTPException(403, "Передвинуть точку может только автор")
            if not u["is_admin"] and dist_km(p["lat"], p["lon"], lat, lon) * 1000 > POI_MOVE_MAX_M:
                raise HTTPException(400, f"Можно сдвинуть не дальше чем на {POI_MOVE_MAX_M} м. Если место другое — добавьте новую точку")
            new["lat"], new["lon"] = lat, lon
        if all(new[k] == p[k] for k in new):
            raise HTTPException(400, "Ничего не изменилось")
        # первая правка: сохраняем исходную версию, чтобы её можно было вернуть
        if not con.execute("SELECT 1 FROM poi_edits WHERE poi_id=?", (pid_,)).fetchone():
            _poi_snapshot(con, p, p["added_by"], p["created_at"], "origin")
        con.execute("UPDATE pois SET kind=?, note=?, price=?, hours=?, lat=?, lon=?, edited_at=?, edited_by=? WHERE id=?",
                    (new["kind"], new["note"], new["price"], new["hours"], new["lat"], new["lon"], now, u["id"], pid_))
        p2 = con.execute("SELECT * FROM pois WHERE id=?", (pid_,)).fetchone()
        _poi_snapshot(con, p2, u["id"], now, "edit")
        if p["added_by"] != u["id"]:
            label = POI_KINDS.get(new["kind"], ("точку",))[0]
            notify(con, p["added_by"], "poi_edit", f"{u['name']} поправил(а) вашу точку «{label}»",
                   {"poi": pid_, "lat": new["lat"], "lon": new["lon"]}, actor=u["id"], dedupe=f"pe:{pid_}:{now // 3600}")
    return poi_detail(pid_, u)


@app.get("/api/pois/{pid_}/history")
def poi_history(pid_: int, u: dict = Depends(current_user)):
    with db() as con:
        if not con.execute("SELECT 1 FROM pois WHERE id=? AND deleted=0", (pid_,)).fetchone():
            raise HTTPException(404, "Точка не найдена")
        rows = con.execute("SELECT e.*, us.name, us.pub_id FROM poi_edits e JOIN users us ON us.tg_id=e.user_id "
                           "WHERE e.poi_id=? ORDER BY e.id DESC LIMIT 50", (pid_,)).fetchall()
    out = []
    for i, r in enumerate(rows):
        prev = rows[i + 1] if i + 1 < len(rows) else None
        out.append({"id": r["id"], "ts": r["created_at"], "name": r["name"], "pid": r["pub_id"], "action": r["action"],
                    "kind": r["kind"], "label": POI_KINDS.get(r["kind"], ("Точка",))[0], "note": r["note"],
                    "price": r["price"], "hours": r["hours"], "current": i == 0,
                    "moved": bool(prev) and (abs(prev["lat"] - r["lat"]) > 1e-7 or abs(prev["lon"] - r["lon"]) > 1e-7)})
    return {"versions": out, "can_revert": u["is_admin"]}


class PoiRevertIn(BaseModel):
    edit_id: int


@app.post("/api/admin/pois/{pid_}/revert")
def admin_poi_revert(pid_: int, body: PoiRevertIn, u: dict = Depends(admin_user)):
    now = int(time.time())
    with db() as con:
        e = con.execute("SELECT * FROM poi_edits WHERE id=? AND poi_id=?", (body.edit_id, pid_)).fetchone()
        if not e:
            raise HTTPException(404, "Версия не найдена")
        con.execute("UPDATE pois SET kind=?, note=?, price=?, hours=?, lat=?, lon=?, edited_at=?, edited_by=? WHERE id=?",
                    (e["kind"], e["note"], e["price"], e["hours"], e["lat"], e["lon"], now, u["id"], pid_))
        _poi_snapshot(con, con.execute("SELECT * FROM pois WHERE id=?", (pid_,)).fetchone(), u["id"], now, "revert")
    return poi_detail(pid_, u)



# ---------------- скорость: сервер против того, что видят курьеры ----------------
CLIENT_PERF: dict = {k: deque(maxlen=3000) for k in ("api", "net", "boot", "card", "resume", "glready")}


class PerfIn(BaseModel):
    api: list[list[float]] = Field(default_factory=list, max_length=200)    # [всего мс, из них сервер мс]
    boot: list[float] = Field(default_factory=list, max_length=20)
    card: list[float] = Field(default_factory=list, max_length=100)
    resume: list[float] = Field(default_factory=list, max_length=20)
    glready: list[float] = Field(default_factory=list, max_length=20)


@app.post("/api/perf")
def perf_report(body: PerfIn, u: dict = Depends(current_user)):
    now = time.time()
    ok = lambda x: isinstance(x, (int, float)) and 0 <= x < 120000
    for pair in (body.api or [])[:200]:
        if len(pair) >= 2 and ok(pair[0]) and ok(pair[1]):
            CLIENT_PERF["api"].append((now, float(pair[0])))
            CLIENT_PERF["net"].append((now, max(0.0, float(pair[0]) - float(pair[1]))))
    for key in ("boot", "card", "resume", "glready"):
        for x in (getattr(body, key, None) or [])[:100]:
            if ok(x):
                CLIENT_PERF[key].append((now, float(x)))
    return {"ok": True}


def _pct(vals: list, p: float) -> int:
    if not vals:
        return 0
    v = sorted(vals)
    return int(round(v[min(len(v) - 1, int(p * (len(v) - 1) + 0.5))]))


@app.get("/api/admin/perf")
def admin_perf(minutes: int = 60, u: dict = Depends(admin_user)):
    since = time.time() - max(5, min(int(minutes), 7 * 24 * 60)) * 60
    srv = [x for x in SERVER_TIMES if x[0] >= since]
    ms = [x[2] for x in srv]
    by_route: dict = {}
    for _, path, d in srv:
        by_route.setdefault(path, []).append(d)
    slow = sorted(({"path": k, "count": len(v), "p95": _pct(v, .95), "max": int(max(v))} for k, v in by_route.items()),
                  key=lambda x: -x["p95"])[:6]
    cl = {k: [x[1] for x in dq if x[0] >= since] for k, dq in CLIENT_PERF.items()}
    stat = lambda vals: {"count": len(vals), "p50": _pct(vals, .5), "p95": _pct(vals, .95), "max": int(max(vals)) if vals else 0}
    out = {"minutes": minutes, "server": stat(ms), "slow_routes": slow,
           "client": {k: stat(v) for k, v in cl.items()},
           "long_requests": sum(1 for x in cl["api"] if x > 5000)}
    s50, c50, n50 = out["server"]["p50"], out["client"]["api"]["p50"], out["client"]["net"]["p50"]
    if not out["client"]["api"]["count"]:
        verdict = "Пока мало данных от телефонов. Откройте приложение и походите по экранам, затем обновите."
    elif n50 > 4 * max(s50, 20):
        verdict = (f"Почти всё время уходит на дорогу до сервера: сеть и хостинг ≈ {n50} мс, сам сервер ≈ {s50} мс. "
                   "Помогут перенос сервера в российский регион и более быстрый тариф.")
    elif out["server"]["p95"] > 1000:
        verdict = "Сервер иногда долго обрабатывает запросы — посмотрите «Самые медленные запросы» ниже."
    else:
        verdict = "Сервер и сеть в норме."
    out["verdict"] = verdict
    return out
