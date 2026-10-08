"""The owner's admin page and API: change balance numbers without a deploy, read chat complaints,
see simple numbers. Everything needs ADMIN_KEY (an Amvera variable); without it the page is off."""

from __future__ import annotations

import hmac
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import cosmetics, tunables
from .config import settings
from .core import utcnow
from .db import SessionLocal, get_session
from .models import BalanceOverride, ChatReport, Event, Run, User, VkOrder

router = APIRouter(prefix="/api/admin")
page_router = APIRouter()


async def reload_overrides() -> None:
    """Reads the overrides from the database into memory (called at start, after a change, and every 30 s)."""
    async with SessionLocal() as session:
        rows = await session.execute(select(BalanceOverride.key, BalanceOverride.value))
        tunables.set_overrides({k: float(v) for k, v in rows})


def _denied(request: Request) -> JSONResponse | None:
    key = settings.admin_key
    if not key:
        return JSONResponse({"error": {"code": "not_found", "message": "Not found"}}, status_code=404)
    if not hmac.compare_digest(request.headers.get("x-admin-key", ""), key):
        return JSONResponse({"error": {"code": "forbidden", "message": "Forbidden"}}, status_code=403)
    return None


def _item_prefixes() -> dict[str, set[str]]:
    return {
        "price": {i.id for i in cosmetics.ITEMS.values() if i.price is not None},
        "record": {i.id for i in cosmetics.ITEMS.values() if i.record is not None},
        "streak": {i.id for i in cosmetics.ITEMS.values() if i.duel_streak is not None},
    }


def balance_table() -> list[dict]:
    """Every number that can be changed: its default, the current value and whether it is overridden."""
    over = tunables.overrides()
    rows = []
    for t in tunables.TUNABLES.values():
        rows.append(
            {
                "key": t.key,
                "group": t.group,
                "desc": t.desc,
                "kind": t.kind,
                "lo": t.lo,
                "hi": t.hi,
                "default": t.default,
                "value": tunables.get(t.key),
                "overridden": t.key in over,
            }
        )
    for i in cosmetics.ITEMS.values():
        for prefix, default, group, label in (
            ("price", i.price, "Цены вещей (монеты)", "цена в монетах"),
            ("record", i.record, "Рекорды для вещей", "нужный рекорд за забег"),
            ("streak", i.duel_streak, "Серии побед для вещей", "нужная серия побед"),
        ):
            if default is None:
                continue
            key = f"{prefix}.{i.id}"
            rows.append(
                {
                    "key": key,
                    "group": group,
                    "desc": f"{i.id}: {label}",
                    "kind": "int",
                    "lo": 0,
                    "hi": 10_000_000,
                    "default": default,
                    "value": tunables.item_override(prefix, i.id, default),
                    "overridden": key in over,
                }
            )
    return rows


class BalanceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    value: float


@router.get("/balance")
async def get_balance(request: Request) -> JSONResponse:
    if (d := _denied(request)) is not None:
        return d
    return JSONResponse({"rows": balance_table()})


@router.put("/balance")
async def put_balance(body: BalanceIn, request: Request, session: AsyncSession = Depends(get_session)) -> JSONResponse:
    if (d := _denied(request)) is not None:
        return d
    err = tunables.check(body.key, body.value, _item_prefixes())
    if err:
        return JSONResponse({"error": {"code": err, "message": err}}, status_code=400)
    row = await session.get(BalanceOverride, body.key)
    if row is None:
        session.add(BalanceOverride(key=body.key, value=body.value, updated_at=utcnow()))
    else:
        row.value = body.value
        row.updated_at = utcnow()
    await session.commit()
    await reload_overrides()
    return JSONResponse({"rows": balance_table()})


@router.delete("/balance/{key:path}")
async def reset_balance(key: str, request: Request, session: AsyncSession = Depends(get_session)) -> JSONResponse:
    if (d := _denied(request)) is not None:
        return d
    await session.execute(delete(BalanceOverride).where(BalanceOverride.key == key))
    await session.commit()
    await reload_overrides()
    return JSONResponse({"rows": balance_table()})


async def _share(session: AsyncSession, kind: str, since, below: int | None = None, at_least: int | None = None) -> int:
    """Percent of reports of a kind below / at least a value (0 when there are none)."""
    total = int(await session.scalar(select(func.count()).select_from(Event).where(Event.type == kind, Event.created_at > since)) or 0)
    if not total:
        return 0
    cond = Event.value < below if below is not None else Event.value >= (at_least or 0)
    hit = int(await session.scalar(select(func.count()).select_from(Event).where(Event.type == kind, Event.created_at > since, cond)) or 0)
    return round(hit * 100 / total)


@router.get("/stats")
async def stats(request: Request, session: AsyncSession = Depends(get_session)) -> JSONResponse:
    if (d := _denied(request)) is not None:
        return d
    from . import duel_ws

    since = utcnow() - timedelta(days=1)
    week = utcnow() - timedelta(days=7)

    async def count(q) -> int:
        return int(await session.scalar(q) or 0)

    data = {
        "players_total": await count(select(func.count()).select_from(User)),
        "players_new_24h": await count(select(func.count()).select_from(User).where(User.created_at > since)),
        "players_active_24h": await count(select(func.count()).select_from(User).where(User.last_seen_at > since)),
        "players_active_7d": await count(select(func.count()).select_from(User).where(User.last_seen_at > week)),
        "runs_finished_24h": await count(select(func.count()).select_from(Run).where(Run.status == "finished", Run.finished_at > since)),
        "coins_in_circulation": await count(select(func.coalesce(func.sum(User.coins), 0))),
        "orders_total": await count(select(func.count()).select_from(VkOrder).where(VkOrder.test.is_(False))),
        "votes_total": await count(select(func.coalesce(func.sum(VkOrder.votes), 0)).where(VkOrder.test.is_(False), VkOrder.status == "delivered")),
        "chat_reports_24h": await count(select(func.count()).select_from(ChatReport).where(ChatReport.created_at > since)),
        # Speed on players' phones in the last 24 h (reports at the end of each run).
        "fps_avg_24h": await count(select(func.coalesce(func.avg(Event.value), 0)).where(Event.type == "perf_fps", Event.created_at > since)),
        "fps_under_30_share_pct": await _share(session, "perf_fps", since, below=30),
        "low_quality_share_pct": await _share(session, "perf_level", since, at_least=1),
        "online_now": len(duel_ws.conns),
        "duels_running": len(duel_ws.duels),
    }
    return JSONResponse(data)


@router.get("/chat-reports")
async def chat_reports(request: Request, session: AsyncSession = Depends(get_session)) -> JSONResponse:
    if (d := _denied(request)) is not None:
        return d
    rows = await session.execute(select(ChatReport).order_by(ChatReport.id.desc()).limit(200))
    return JSONResponse(
        {
            "reports": [
                {
                    "id": r.id,
                    "reporter": r.reporter_id,
                    "reported": r.reported_id,
                    "reason": r.reason,
                    "text": r.text,
                    "at": r.created_at.isoformat(),
                }
                for r in rows.scalars()
            ]
        }
    )


PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Социальный лифт: админка</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:0;background:#0f141b;color:#e8edf4}
header{padding:12px 16px;background:#18202b;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
main{padding:16px;max-width:1000px;margin:auto}
h2{margin:22px 0 8px;font-size:17px;color:#ffd640}
input,button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #3a4658;background:#1d2733;color:#e8edf4}
button{cursor:pointer;background:#2c4a86;border-color:#2c4a86}button.g{background:#2a3442;border-color:#3a4658}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #263142;text-align:left;vertical-align:top}
td.n{width:130px}.muted{color:#8da0b8;font-size:13px}.ov{color:#ffd640;font-weight:700}
.cards{display:flex;gap:10px;flex-wrap:wrap}.card{background:#18202b;border-radius:10px;padding:10px 14px;min-width:150px}.card b{display:block;font-size:22px}
#msg{color:#8ff0a8}
</style></head><body>
<header><b>Админка</b><input id="key" type="password" placeholder="ADMIN_KEY" size="26"><button id="go">Войти</button><span id="msg"></span></header>
<main id="app"><p class="muted">Введите ключ ADMIN_KEY (его вы задали в переменных Amvera).</p></main>
<script>
const $=s=>document.querySelector(s);let KEY=sessionStorage.getItem('ak')||'';$('#key').value=KEY;
async function api(m,p,b){const r=await fetch('/api/admin'+p,{method:m,headers:{'X-Admin-Key':KEY,'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
 if(r.status===404)throw new Error('Админка выключена: нет переменной ADMIN_KEY');if(r.status===403)throw new Error('Неверный ключ');if(!r.ok)throw new Error((await r.json()).error.code);return r.json()}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function flash(t){$('#msg').textContent=t;setTimeout(()=>$('#msg').textContent='',2500)}
async function load(){try{
 const [st,bal,rep]=await Promise.all([api('GET','/stats'),api('GET','/balance'),api('GET','/chat-reports')]);
 const names={players_total:'Игроков всего',players_new_24h:'Новых за сутки',players_active_24h:'Активных за сутки',players_active_7d:'Активных за неделю',runs_finished_24h:'Забегов за сутки',coins_in_circulation:'Монет у игроков',orders_total:'Покупок за голоса',votes_total:'Голосов получено',chat_reports_24h:'Жалоб за сутки',online_now:'Сейчас онлайн',duels_running:'Дуэлей идёт',fps_avg_24h:'Средний FPS за сутки',fps_under_30_share_pct:'Забегов ниже 30 FPS, %',low_quality_share_pct:'Устройств с упрощённой графикой, %'};
 let h='<h2>Сейчас</h2><div class="cards">'+Object.entries(names).map(([k,v])=>`<div class="card">${v}<b>${st[k]}</b></div>`).join('')+'</div>';
 const groups={};bal.rows.forEach(r=>(groups[r.group]=groups[r.group]||[]).push(r));
 h+='<h2>Баланс (меняется сразу, без выкладки)</h2><p class="muted">Жёлтым отмечено то, что вы изменили. «Сбросить» возвращает значение из кода. Изменения доходят до игроков примерно за 30 секунд.</p>';
 for(const g of Object.keys(groups)){h+=`<h3>${esc(g)}</h3><table>`+groups[g].map(r=>`<tr><td>${esc(r.desc)}<div class="muted">${esc(r.key)}${r.lo!==undefined&&r.key.indexOf('.')<0?` · от ${r.lo} до ${r.hi}`:''} · по умолчанию ${r.default}</div></td><td class="n"><input data-k="${esc(r.key)}" value="${r.value}" size="9" class="${r.overridden?'ov':''}"></td><td><button data-s="${esc(r.key)}">Сохранить</button> <button class="g" data-r="${esc(r.key)}">Сбросить</button></td></tr>`).join('')+'</table>'}
 h+='<h2>Жалобы на сообщения чата</h2>'+(rep.reports.length?'<table><tr><th>Когда</th><th>Кто пожаловался</th><th>На кого</th><th>Причина</th><th>Сообщение</th></tr>'+rep.reports.map(r=>`<tr><td>${esc(r.at.slice(0,16).replace('T',' '))}</td><td>${r.reporter}</td><td>${r.reported}</td><td>${esc(r.reason)}</td><td>${esc(r.text)}</td></tr>`).join('')+'</table>':'<p class="muted">Жалоб нет.</p>');
 $('#app').innerHTML=h;}catch(e){$('#app').innerHTML='<p style="color:#ff8a8a">'+esc(e.message)+'</p>'}}
document.addEventListener('click',async e=>{const s=e.target.dataset.s,r=e.target.dataset.r;if(!s&&!r)return;
 try{if(s){const v=Number(document.querySelector('input[data-k="'+s+'"]').value);await api('PUT','/balance',{key:s,value:v});flash('Сохранено')}else{await api('DELETE','/balance/'+r);flash('Сброшено')}await load()}catch(x){flash('Ошибка: '+x.message)}});
$('#go').onclick=()=>{KEY=$('#key').value.trim();sessionStorage.setItem('ak',KEY);load()};if(KEY)load();
</script></body></html>"""


@page_router.get("/admin", response_class=HTMLResponse)
async def admin_page() -> HTMLResponse:
    # The page itself holds no secrets; every request it makes needs the key.
    if not settings.admin_key:
        return HTMLResponse("<p>Админка выключена: добавьте переменную ADMIN_KEY.</p>", status_code=404)
    return HTMLResponse(PAGE, headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"})
