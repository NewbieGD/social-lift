"""Chat moderation: no obscene words and no links. Pure functions, easy to test.

Text is normalised first (case, ё, Latin and digit look-alikes, separators between letters),
so "х у й", "xуй" or "п.и.з.д.а" are caught too. Links include "site dot ru" spellings.
"""

from __future__ import annotations

import re

MAX_LEN = 200

# Latin letters and digits that are used instead of Cyrillic ones.
_LOOKALIKE = str.maketrans(
    {
        "a": "а", "b": "в", "c": "с", "e": "е", "h": "н", "k": "к", "m": "м", "o": "о",
        "p": "р", "t": "т", "x": "х", "y": "у", "u": "у", "i": "и", "r": "р",
        "0": "о", "3": "з", "6": "б", "ё": "е",
    }
)

# Stems that never occur inside ordinary words, so they are also searched in the text
# with all separators removed.
_STRONG = (
    "хуй", "хуе", "хуя", "пизд", "пезд", "бляд", "блят", "блеат", "ебан", "ебат", "ебал", "ебну",
    "ебыр", "мудак", "мудил", "пидор", "пидар", "пидр", "педик", "залуп", "гандон", "гондон",
    "долбоеб", "уебан", "уебок", "заебал", "заебис", "сучар", "шлюх", "дрочи", "дрочу",
)
# Shorter stems are only checked at the start of a word (after an optional prefix).
_WORD_START = re.compile(
    r"^(?:по|на|за|вы|от|до|при|про|раз|съ|у|о|с|под)?(?:еб[аоуиеыя]|ёб|суки?$|сука|сучк|сучь|хер[аоуи]|говн|жоп[аыуе]|срать|срал|ссать|залуп)"
)

_URL = re.compile(
    r"(?:https?:|ftp:|www\.|//|\bvk\.cc|\bt\.me|\bwa\.me|@[a-z0-9_]{2,}|\bvk\s*\.\s*com|\bvk\s*\.\s*ru)",
    re.I,
)
_TLDS = (
    "ru|com|net|org|su|io|me|ly|gg|tk|xyz|info|biz|by|ua|kz|tv|cc|to|pro|club|online|site|link|app|dev|fm|"
    "рф|рус|мск|онлайн|сайт|us|de|uk|eu|co|ws|ru\\.com|cn|jp|in|fun|top|shop|store|live|page|click"
)
_DOMAIN = re.compile(rf"[a-zа-я0-9-]{{2,}}\.(?:{_TLDS})(?![a-zа-я0-9])", re.I)
_DOT_WORD = re.compile(r"[a-zа-я0-9]{2,}\s*(?:точка|dot|дот)\s*(?:ru|ру|com|ком|net|нет|org|орг|рф)", re.I)


def _normalise(text: str) -> str:
    t = text.lower().translate(_LOOKALIKE)
    return re.sub(r"\s+", " ", t)


def _squeeze(text: str) -> str:
    """Letters only, repeated letters collapsed: 'х.у.й' -> 'хуй', 'хуууй' -> 'хуй'."""
    letters = re.sub(r"[^а-я]", "", text)
    return re.sub(r"(.)\1+", r"\1", letters)


def has_link(text: str) -> bool:
    t = text.lower()
    # Obfuscated dots: "site[.]ru", "site(.)ru", "site . ru"
    t = re.sub(r"\s*[\[\(\{<]\s*\.\s*[\]\)\}>]\s*", ".", t)
    t = re.sub(r"\s*\.\s*", ".", t)
    return bool(_URL.search(t) or _DOMAIN.search(t) or _DOT_WORD.search(text.lower()))


def _chunks(norm: str) -> list[str]:
    """Words squeezed to letters; runs of one- or two-letter pieces ("х у й") are joined."""
    out: list[str] = []
    run = ""
    for token in norm.split(" "):
        sq = _squeeze(token)
        if not sq:
            continue
        if len(sq) <= 2:
            run += sq
            continue
        if run:
            out.append(run)
            run = ""
        out.append(sq)
    if run:
        out.append(run)
    return out


def has_profanity(text: str) -> bool:
    norm = _normalise(text)
    if any(stem in chunk for chunk in _chunks(norm) for stem in _STRONG):
        return True
    for word in re.findall(r"[а-я]+", norm):
        if _WORD_START.match(word):
            return True
    return False


def clean(text: object) -> str:
    """Trims and collapses whitespace; returns '' for anything that is not text."""
    if not isinstance(text, str):
        return ""
    return re.sub(r"\s+", " ", text).strip()[:MAX_LEN]


def check(text: str) -> str | None:
    """None if the message may be posted, otherwise 'empty', 'link' or 'words'."""
    if not text:
        return "empty"
    if has_link(text):
        return "link"
    if has_profanity(text):
        return "words"
    return None
