// HTML for every screen. Buttons use data-action/data-arg; main.ts handles them.
import { AGE_LABEL } from '../config';
import { legal, ru, type DocSection } from '../i18n/ru';
import type { FinishResult, Leaderboard, LeaderRow, Stats } from '../net/session';
import { esc } from './dom';
import type { Settings } from './settingsStore';

const BACK_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const CROWN =
  '<svg class="crown" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14L1 3l6 5 5-7 5 7 6-5-1 11z" fill="#FFD640" stroke="#8a5a00" stroke-width="1"/></svg>';

export const RULE_ICONS = [
  '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="#F6C343"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M4 4h16v7c0 5.5-3.6 9.3-8 11-4.4-1.7-8-5.5-8-11z" fill="#E8394A"/></svg>',
  '<svg viewBox="0 0 24 24"><path d="M0 16c4-4 8 4 12 0s8-4 12 0v8H0z" fill="#8A1A2A"/></svg>',
];

function header(title: string): string {
  return `<header class="screen-head">
    <button class="icon-btn back" data-action="back" aria-label="${ru.common.back}">${BACK_ICON}</button>
    <h2>${esc(title)}</h2>
  </header>`;
}

function sections(list: DocSection[]): string {
  return list
    .map(
      (s) =>
        `<section class="doc-section">${s.h ? `<h3>${esc(s.h)}</h3>` : ''}${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`,
    )
    .join('');
}

// ---------- Boot ----------

export function loadingView(progress: number, label: string, error: string | null): string {
  return `<div class="center-col">
    <h1 class="logo">${ru.appTitle}</h1>
    ${
      error
        ? `<p class="status warn">${esc(error)}</p><button class="primary" data-action="retryBoot">${ru.common.retry}</button>`
        : `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}">
             <div class="progress-fill" style="transform: scaleX(${progress.toFixed(3)})"></div>
           </div>
           <p class="status">${esc(label)}</p>`
    }
  </div>`;
}

export function consentView(error: string | null): string {
  return `<div class="panel wide">
    <h1 class="logo small">${ru.appTitle}</h1>
    <div class="age-badge">${esc(AGE_LABEL)}</div>
    <p class="note-top">${esc(ru.consent.age(AGE_LABEL))}</p>
    <p>${ru.consent.lead}</p>
    <div class="doc-links">
      <button class="link-btn" data-action="doc" data-arg="terms">${ru.consent.terms}</button>
      <button class="link-btn" data-action="doc" data-arg="privacy">${ru.consent.privacy}</button>
    </div>
    <label class="consent">
      <input type="checkbox" id="consentCheck" />
      <span>${ru.consent.check}</span>
    </label>
    ${error ? `<p class="status warn">${esc(error)}</p>` : ''}
    <button class="primary" id="acceptBtn" data-action="acceptConsent" disabled>${ru.consent.accept}</button>
    <button class="secondary" data-action="declineConsent">${ru.consent.decline}</button>
  </div>`;
}

export function declinedView(): string {
  return `<div class="panel">
    <h2>${ru.consent.declinedTitle}</h2>
    <p>${ru.consent.declinedText}</p>
    <button class="primary" data-action="back">${ru.consent.declinedBack}</button>
  </div>`;
}

export function docView(kind: 'terms' | 'privacy' | 'rules'): string {
  const doc = kind === 'rules' ? { title: ru.rules.title, sections: ru.rules.sections } : legal[kind];
  return `${header(doc.title)}<div class="scroll doc">${sections(doc.sections)}</div>`;
}

export function preparingView(): string {
  return `<div class="doors" aria-hidden="true"><span class="door left"></span><span class="door right"></span></div>
  <div class="center-col prep">
    <p class="prep-floor">${ru.loading.floors}</p>
    <div class="progress"><div class="progress-fill timed"></div></div>
    <p class="status">${ru.loading.preparing}</p>
  </div>`;
}

// ---------- Menu ----------

export interface MenuData {
  stats: Stats | null;
  mode: 'loading' | 'online' | 'offline' | 'outside';
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18L2 7l5.5 4L12 4l4.5 7L22 7l-1 11z" fill="#FFD640" stroke="#8a5a00" stroke-width="1.2"/><rect x="3" y="18.5" width="18" height="2.5" rx="1" fill="#E8B23A"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z" fill="#5AA8FF"/><path d="M4 21.5A2.5 2.5 0 016.5 19H20v3H6.5A2.5 2.5 0 014 21.5z" fill="#2257B8"/><path d="M8 6h8M8 9.5h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 2 .9 2.2-1.5 2.4 2.4-1.5 2.2.9 2 2.6.5v3.4l-2.6.5-.9 2 1.5 2.2-2.4 2.4-2.2-1.5-2 .9-.5 2.6h-3.4l-.5-2.6-2-.9-2.2 1.5-2.4-2.4 1.5-2.2-.9-2L2 13.7v-3.4l2.6-.5.9-2L4 5.6 6.4 3.2l2.2 1.5 2-.9z" fill="#B9C1CD"/><circle cx="12" cy="12" r="3.6" fill="#4A5262"/></svg>',
  swords:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l7.5 7.5-2 2L2 5V3zM20 3l-7.5 7.5 2 2L22 5V3z" fill="#D3D8E2"/><path d="M6.5 14.5l3 3-2.5 2.5-1.5-1.5-1.5 1.5L3 19l1.5-1.5L3 16zM17.5 14.5l-3 3 2.5 2.5 1.5-1.5 1.5 1.5L21 19l-1.5-1.5L21 16z" fill="#E8B23A"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" fill="#38C673"/><path d="M3 7l9 6.5L21 7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" fill="#7FCF8A"/><circle cx="12" cy="12" r="3" fill="#3E8C4C"/><rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="#3E8C4C" stroke-width="1.5"/></svg>',
  floor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" fill="#8D96A6"/><rect x="6" y="4" width="5.5" height="16" fill="#C7CCD6"/><rect x="12.5" y="4" width="5.5" height="16" fill="#C7CCD6"/><path d="M12 6.5l-2.4 3h4.8z" fill="#FFB547"/></svg>',
};

const HAND_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V10l.5-.1V8.5a1.5 1.5 0 013 0v2l.5-.1a1.5 1.5 0 013 .3V15c0 3.3-2.7 6-6 6h-1.2c-1.8 0-3.4-.8-4.5-2.2L4.6 15a1.5 1.5 0 012.3-1.9L9 15z" fill="currentColor"/></svg>';

function chip(icon: string, label: string, value: string, i: number): string {
  return `<div class="chip" style="--i:${i}">${icon}<span class="chip-text"><span class="chip-label">${esc(label)}</span><b>${esc(value)}</b></span></div>`;
}

export function menuView(d: MenuData): string {
  const s = d.stats;
  const fresh = !s || (s.total_runs === 0 && !s.best_all);
  const tier = s?.last_tier ?? 0;
  const chips = fresh
    ? `<div class="chip wide" style="--i:0">${ICON.floor}<span class="chip-text"><b>${ru.menu.firstRun}</b></span></div>`
    : [
        chip(ICON.crown, ru.menu.chipRank, s?.rank_all ? String(s.rank_all) : ru.wardrobe.none, 0),
        chip(ICON.bill, ru.menu.chipLast, String(s?.last_score ?? 0), 1),
        chip(ICON.floor, ru.menu.chipTier, ru.tiers[tier] ?? ru.tiers[0], 2),
      ].join('');
  let status = '';
  if (d.mode === 'offline') {
    status = `<p class="status warn">${ru.menu.offline}</p><button class="link-btn" data-action="reconnect">${ru.common.retry}</button>`;
  } else if (d.mode === 'outside') {
    status = `<p class="status small">${ru.menu.outside}</p>`;
  }
  return `<div class="menu2">
    <div class="showcase">
      <button class="hero-stage" data-action="open" data-arg="wardrobe" aria-label="${ru.wardrobe.title}">
        <span class="stage-glow" aria-hidden="true"></span>
        <canvas id="menuHero" aria-hidden="true"></canvas>
        <span class="tap-hint">${HAND_ICON}${ru.wardrobe.hint}</span>
      </button>
      <div class="chips">${chips}</div>
    </div>
    <div class="menu-actions">
      <button class="primary big play" data-action="play">${ICON.play}<span>${ru.common.play}</span></button>
      <div class="grid2 stagger">
        <button class="tile wide-tile" data-action="open" data-arg="duels">${ICON.swords}<span>${ru.menu.duels}</span></button>
        <button class="tile" data-action="open" data-arg="leaders">${ICON.crown}<span>${ru.menu.leaders}</span></button>
        <button class="tile" data-action="open" data-arg="rules">${ICON.book}<span>${ru.menu.rules}</span></button>
        <button class="tile" data-action="open" data-arg="settings">${ICON.gear}<span>${ru.menu.settings}</span></button>
        <button class="tile" data-action="open" data-arg="contact">${ICON.mail}<span>${ru.menu.contactShort}</span></button>
      </div>
      ${status}
    </div>
  </div>`;
}

export function wardrobeView(s: Stats | null, mask: number): string {
  const v = (n: number | null | undefined): string => (n === null || n === undefined || n === 0 ? ru.wardrobe.none : String(n));
  let owned = 0;
  for (let i = 0; i < 13; i++) if (mask & (1 << i)) owned++;
  const stats: [string, string][] = [
    [ru.wardrobe.best, v(s?.best_all)],
    [ru.wardrobe.rankWeek, v(s?.rank_week)],
    [ru.wardrobe.rankAll, v(s?.rank_all)],
    [ru.wardrobe.runs, v(s?.total_runs)],
    [ru.wardrobe.combo, v(s?.best_combo)],
    [ru.wardrobe.captures, v(s?.total_captures)],
  ];
  const itemNames = [
    'cap', 'slippers', 'sweats', 'shirt', 'trousers', 'jacket', 'watch', 'newTorch', 'tie', 'shoes', 'phone', 'glasses', 'helmet',
  ];
  return `${header(ru.wardrobe.title)}<div class="scroll wardrobe">
    <div class="ward-top">
      <div class="ward-stage"><span class="stage-glow"></span><canvas id="wardHero" aria-hidden="true"></canvas></div>
      <div class="ward-info">
        <p class="ward-look">${esc(ru.wardrobe.collected(owned))}</p>
        <div class="bonus-bar" aria-hidden="true"><i style="transform:scaleX(${(owned / 13).toFixed(3)})"></i></div>
        <p class="muted">${esc(ru.wardrobe.bonus())}</p>
        <dl class="ward-stats stagger">${stats.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')}</dl>
      </div>
    </div>
    <h3>${ru.wardrobe.collection}</h3>
    <p class="muted">${ru.wardrobe.how}</p>
    <div class="looks items stagger">
      ${itemNames
        .map((name, i) => {
          const has = (mask & (1 << i)) !== 0;
          return `<div class="look ${has ? 'owned' : 'locked'}">
              <canvas data-item="${i}" aria-hidden="true"></canvas>
              <span>${esc(has ? ru.items[name] : ru.wardrobe.lockedAt(ru.tiers[i]))}</span>
              
            </div>`;
        })
        .join('')}
    </div>
  </div>`;
}

// ---------- Rules card before a run ----------

export function rulesCardView(): string {
  return `<div class="panel">
    <button class="icon-btn close" data-action="back" aria-label="${ru.common.close}">${CLOSE_ICON}</button>
    <h2>${ru.rulesCard.title}</h2>
    <ul class="rule-list">
      ${ru.rulesCard.items.map((t, i) => `<li>${RULE_ICONS[i]}<span>${esc(t)}</span></li>`).join('')}
    </ul>
    <label class="check-row"><input type="checkbox" id="dontShowRules" /> <span>${ru.rulesCard.dontShow}</span></label>
    <button class="primary" data-action="playFromCard">${ru.common.play}</button>
    <button class="link-btn" data-action="open" data-arg="rules">${ru.rulesCard.fullRules}</button>
  </div>`;
}

// ---------- Settings ----------

function toggle(key: keyof Settings, label: string, on: boolean): string {
  return `<label class="row toggle-row">
    <span>${label}</span>
    <input type="checkbox" role="switch" class="switch" data-setting="${key}" ${on ? 'checked' : ''} />
  </label>`;
}

function slider(key: keyof Settings, label: string, value: number, min: number, max: number, step: number): string {
  return `<label class="row slider-row">
    <span>${label}</span>
    <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
  </label>`;
}

function seg<T extends string>(key: keyof Settings, label: string, options: Record<T, string>, value: T): string {
  const keys = Object.keys(options) as T[];
  return `<div class="row seg-row">
    <span class="setting-label">${label}</span>
    <div class="seg ${keys.length === 2 ? 'seg-2' : ''}" role="radiogroup">
      ${keys
        .map(
          (k) =>
            `<button type="button" role="radio" aria-checked="${k === value}" class="${k === value ? 'on' : ''}" data-action="setSeg" data-key="${key}" data-arg="${k}">${options[k]}</button>`,
        )
        .join('')}
    </div>
  </div>`;
}

export function settingsView(s: Settings, opts: { vibration: boolean; playerId: number | null; canDelete: boolean }): string {
  return `${header(ru.settings.title)}<div class="scroll settings">
    <h3>${ru.settings.sound}</h3>
    ${toggle('music', ru.settings.music, s.music)}
    ${slider('musicVol', ru.settings.musicVol, s.musicVol, 0, 1, 0.05)}
    ${slider('sfxVol', ru.settings.sfxVol, s.sfxVol, 0, 1, 0.05)}
    ${opts.vibration ? toggle('vibration', ru.settings.vibration, s.vibration) : ''}

    <h3>${ru.settings.controls}</h3>
    ${seg('steer', ru.settings.steer, ru.settings.steerModes, s.steer)}
    ${s.steer === 'drag' ? slider('sens', ru.settings.sens, s.sens, 0.6, 1.8, 0.05) : ''}
    ${seg('layout', ru.settings.layout, ru.settings.layouts, s.layout)}
    ${seg('side', ru.settings.side, ru.settings.sides, s.side)}

    <h3>${ru.settings.comfort}</h3>
    ${toggle('colorblind', ru.settings.colorblind, s.colorblind)}
    ${toggle('reducedFx', ru.settings.reducedFx, s.reducedFx)}
    ${toggle('rulesCard', ru.settings.rulesCard, s.rulesCard)}
    ${toggle('cinematic', ru.settings.cinematic, s.cinematic)}

    <h3>${ru.settings.docs}</h3>
    <div class="doc-links left">
      <button class="link-btn" data-action="doc" data-arg="terms">${ru.consent.terms}</button>
      <button class="link-btn" data-action="doc" data-arg="privacy">${ru.consent.privacy}</button>
      <button class="link-btn" data-action="doc" data-arg="rules">${ru.rules.title}</button>
    </div>

    <h3>${ru.settings.data}</h3>
    ${
      opts.playerId
        ? `<p class="muted">${ru.settings.playerId(opts.playerId)}<br>${ru.settings.playerIdHint}</p>`
        : ''
    }
    ${opts.canDelete ? `<button class="danger" data-action="open" data-arg="confirmDelete">${ru.settings.deleteData}</button>` : ''}
  </div>`;
}

export function confirmDeleteView(error: string | null): string {
  return `<div class="panel">
    <h2>${ru.confirmDelete.title}</h2>
    <p>${ru.confirmDelete.text}</p>
    ${error ? `<p class="status warn">${esc(error)}</p>` : ''}
    <button class="danger" data-action="deleteData">${ru.confirmDelete.confirm}</button>
    <button class="secondary" data-action="back">${ru.common.cancel}</button>
  </div>`;
}

// ---------- Leaders ----------

export function leadersShell(scope: 'week' | 'all' | 'duels'): string {
  const tab = (id: 'week' | 'all' | 'duels', label: string): string =>
    `<button role="tab" class="${scope === id ? 'on' : ''}" aria-selected="${scope === id}" data-action="lbScope" data-arg="${id}">${label}</button>`;
  return `${header(ru.leaders.title)}
    <div class="tabs tabs-3" role="tablist">
      ${tab('week', ru.leaders.week)}${tab('all', ru.leaders.all)}${tab('duels', ru.leaders.duels)}
    </div>
    <p class="reset-line" id="lbReset"></p>
    <div class="scroll leaders" id="lbList">${skeleton()}</div>
    <div class="me-card" id="lbMe"></div>`;
}

function skeleton(): string {
  return Array.from({ length: 8 }, () => '<div class="lb-row skeleton"><span></span><span></span><span></span></div>').join('');
}

export function leadersError(message: string, retry: boolean): string {
  return `<div class="empty"><p>${esc(message)}</p>${retry ? `<button class="secondary" data-action="lbRetry">${ru.common.retry}</button>` : ''}</div>`;
}

function avatar(row: LeaderRow): string {
  const initial = esc((row.name || ru.leaders.player).slice(0, 1));
  const img = row.photo ? `<img src="${esc(row.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '';
  return `<span class="avatar rank-${Math.min(row.rank, 4)}">${row.rank === 1 ? CROWN : ''}<span class="ava-inner">${img || `<b>${initial}</b>`}</span></span>`;
}

export function leadersRows(lb: Leaderboard, myId: number | null, clickable: boolean): string {
  if (!lb.rows.length) return `<div class="empty"><p>${lb.scope === 'duels' ? ru.leaders.emptyDuels : ru.leaders.emptyWeek}</p></div>`;
  return `<div class="stagger">${lb.rows
    .map((r) => {
      const name = r.deactivated ? ru.leaders.deleted : r.name || ru.leaders.player;
      const canOpen = clickable && !r.deactivated;
      const tag = canOpen ? 'button' : 'div';
      const attrs = canOpen ? ` data-action="profile" data-arg="${r.user_id}"` : '';
      return `<${tag} class="lb-row top-${Math.min(r.rank, 4)}${r.user_id === myId ? ' mine' : ''}"${attrs}>
        <span class="place">${r.rank}</span>
        ${avatar(r)}
        <span class="name">${esc(name)}</span>
        <span class="score">${r.score}</span>
      </${tag}>`;
    })
    .join('')}</div>`;
}

export function leadersMe(lb: Leaderboard): string {
  const me = lb.me;
  if (lb.scope === 'duels') {
    if (!me.rank) return `<p>${ru.leaders.noDuels}</p>`;
    const gap = me.rank > 1 && me.next_rank && me.gap_to_next ? ru.leaders.gapDuels(me.next_rank, me.gap_to_next) : me.rank === 1 ? ru.leaders.first : '';
    return `<p class="me-main">${ru.leaders.youDuels(me.score, me.rank)}</p>${gap ? `<p class="muted">${gap}</p>` : ''}`;
  }
  if (!me.rank) return `<p>${ru.leaders.noRuns}</p>`;
  const second =
    me.rank === 1
      ? ru.leaders.first
      : me.next_rank && me.gap_to_next
        ? ru.leaders.gap(me.next_rank, me.gap_to_next)
        : '';
  return `<p class="me-main">${ru.leaders.you(me.score, me.rank)}</p>${second ? `<p class="muted">${second}</p>` : ''}`;
}

export function resetLine(lb: Leaderboard, clientOffsetMs: number): string {
  if (lb.scope !== 'week') return '';
  const left = Math.max(0, lb.reset_at - (Date.now() + clientOffsetMs));
  const m = Math.floor(left / 60000);
  return ru.leaders.resetIn(Math.floor(m / 1440), Math.floor((m % 1440) / 60), m % 60);
}

// ---------- Duels ----------

export interface DuelView {
  status: 'offline' | 'connecting' | 'idle' | 'waiting' | 'none' | 'declined';
  online: number;
  waitingFor: string | null;
}

export function duelsView(d: DuelView): string {
  let status = '';
  if (d.status === 'offline') status = ru.duel.offline;
  else if (d.status === 'connecting') status = ru.duel.connecting;
  else if (d.status === 'waiting') status = ru.duel.waiting(d.waitingFor || ru.duel.player);
  else if (d.status === 'none') status = ru.duel.none;
  else if (d.status === 'declined') status = ru.duel.declined;
  const canFind = d.status === 'idle' || d.status === 'none' || d.status === 'declined';
  return `${header(ru.duel.title)}<div class="panel flat duel-panel">
    <div class="duel-hero" aria-hidden="true">${ICON.swords}</div>
    <p>${ru.duel.lead}</p>
    <p class="muted">${ru.duel.rulesNote}</p>
    ${d.status !== 'offline' && d.status !== 'connecting' ? `<p class="duel-online"><span class="dot"></span>${ru.duel.online(d.online)}</p>` : ''}
    ${status ? `<p class="status ${d.status === 'waiting' ? '' : 'warn'}">${esc(status)}</p>` : ''}
    ${
      d.status === 'waiting'
        ? `<button class="secondary" data-action="duelCancel">${ru.duel.cancel}</button>`
        : `<button class="primary" data-action="duelFind" ${canFind ? '' : 'disabled'}>${ru.duel.find}</button>`
    }
  </div>`;
}

export function inviteView(from: { name: string | null; photo: string | null }, seconds: number): string {
  const name = from.name || ru.duel.player;
  const img = from.photo ? `<img src="${esc(from.photo)}" alt="" referrerpolicy="no-referrer" />` : `<b>${esc(name.slice(0, 1))}</b>`;
  return `<div class="panel invite">
    <div class="invite-ava">${img}</div>
    <h2>${ru.duel.inviteTitle}</h2>
    <p>${esc(ru.duel.invite(name))}</p>
    <div class="invite-timer"><i style="animation-duration:${seconds}s"></i></div>
    <button class="primary" data-action="duelAccept">${ru.duel.accept}</button>
    <button class="secondary" data-action="duelDecline">${ru.duel.decline}</button>
  </div>`;
}

// ---------- Contact ----------

export function contactView(hasLink: boolean, playerId: number | null): string {
  return `${header(ru.contact.title)}<div class="panel flat">
    <p>${ru.contact.text}</p>
    <p class="muted">${ru.contact.sla}</p>
    ${playerId ? `<p class="muted">${ru.settings.playerId(playerId)}</p>` : ''}
    ${
      hasLink
        ? `<button class="primary" data-action="support">${ru.contact.button}</button>`
        : `<p class="status">${ru.contact.soon}</p>`
    }
  </div>`;
}

// ---------- In-run ----------

export function pauseView(s: Settings): string {
  return `<div class="panel stagger">
    <h2>${ru.pause.title}</h2>
    <div class="pause-sound">
      ${toggle('music', ru.settings.music, s.music)}
      ${slider('sfxVol', ru.settings.sfxVol, s.sfxVol, 0, 1, 0.05)}
    </div>
    <button class="primary" data-action="resume">${ru.pause.resume}</button>
    <button class="secondary" data-action="open" data-arg="rules">${ru.pause.rules}</button>
    <button class="secondary" data-action="open" data-arg="settings">${ru.pause.settings}</button>
    <button class="secondary" data-action="toMenu">${ru.pause.menu}</button>
  </div>`;
}

export interface ResultData {
  reason: string;
  tier: number;
  score: number;
  best: number;
  captures: number;
  maxCombo: number;
  seconds: number;
  record: boolean;
  canShare: boolean;
}

export function resultView(d: ResultData): string {
  const time = `${Math.floor(d.seconds / 60)}:${String(Math.floor(d.seconds % 60)).padStart(2, '0')}`;
  const words = ru.tiers[d.tier].split(' ');
  // Words of the headline appear one by one, like a press run.
  const headline = words.map((w, i) => `<span style="--w:${i}">${esc(w)}</span>`).join(' ');
  const magazine = d.tier >= 8;
  const cover = magazine
    ? `<div class="paper magazine">
        <p class="mag-title">${ru.press.magazine}</p>
        <canvas id="coverHero" class="cover-hero" width="72" height="96" aria-hidden="true"></canvas>
        <div class="mag-text">
          <p class="paper-kicker">${esc(d.reason)}</p>
          <p class="paper-label">${ru.result.reachedTitle}</p>
          <h2 class="paper-headline">${headline}</h2>
        </div>
      </div>`
    : `<div class="paper">
        <p class="paper-outlet">${ru.press.outlet}</p>
        <p class="paper-kicker">${esc(d.reason)}</p>
        <p class="paper-label">${ru.result.reachedTitle}</p>
        <h2 class="paper-headline">${headline}</h2>
      </div>`;
  return `<div class="panel result">
    ${cover}
    <div class="big-score" id="resultScore" data-target="${d.score}">0</div>
    <div class="record ${d.record && d.score > 0 ? '' : 'hidden'}" id="resultRecord">${ru.result.record}</div>
    <p class="rank" id="resultRank"></p>
    <p class="duel-line" id="duelLine"></p>
    <dl class="stats" id="resultStats">
      <dt>${ru.result.best}</dt><dd id="resultBest">${d.best}</dd>
      <dt>${ru.result.captures}</dt><dd>${d.captures}</dd>
      <dt>${ru.result.combo}</dt><dd>${d.maxCombo}</dd>
      <dt>${ru.result.time}</dt><dd>${time}</dd>
    </dl>
    <button class="primary" data-action="again">${ru.result.again}</button>
    <button class="secondary" data-action="toMenu">${ru.common.menu}</button>
    ${d.canShare ? `<button class="secondary share-btn" data-action="open" data-arg="share">${SHARE_ICON}${ru.share.button}</button>` : ''}
    <button class="link-btn" data-action="open" data-arg="rules">${ru.rules.title}</button>
  </div>`;
}

const SHARE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l7 7-7 7v-4c-5 0-8.5 1.6-11 5 1-5 4-10 11-11z" fill="currentColor"/></svg>';

export function shareView(opts: { wall: boolean; story: boolean }): string {
  return `<div class="panel">
    <button class="icon-btn close" data-action="back" aria-label="${ru.common.close}">${'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'}</button>
    <h2>${ru.share.title}</h2>
    ${opts.story ? `<button class="primary" data-action="shareStory">${ru.share.story}</button>` : ''}
    ${opts.wall ? `<button class="secondary" data-action="shareWall">${ru.share.wall}</button>` : ''}
  </div>`;
}

export function rankHtml(res: FinishResult): string {
  const line = (label: string, rank: number | null, prev: number | null): string => {
    if (!rank) return '';
    const up = prev && rank < prev ? ` <span class="up">↑${prev - rank}</span>` : '';
    return `${label}: ${rank}${up}`;
  };
  return [line(ru.result.rankWeek, res.rank_week, res.prev_rank_week), line(ru.result.rankAll, res.rank_all, res.prev_rank_all)]
    .filter(Boolean)
    .join('<br>');
}

export function tutorialDoneView(): string {
  return `<div class="panel">
    <h2>${ru.tutorial.doneTitle}</h2>
    <p>${ru.tutorial.doneText}</p>
    <button class="primary" data-action="afterTutorial">${ru.common.play}</button>
    <button class="secondary" data-action="toMenu">${ru.common.menu}</button>
  </div>`;
}

// ---------- Stubs ----------

export type StubKind = 'offline' | 'server' | 'maintenance' | 'unsupported';

export function stubView(kind: StubKind, code: string | null): string {
  const t = ru.stub;
  const map: Record<StubKind, [string, string]> = {
    offline: [t.offlineTitle, t.offlineText],
    server: [t.serverTitle, t.serverText],
    maintenance: [t.maintenanceTitle, t.maintenanceText],
    unsupported: [t.unsupportedTitle, t.unsupportedText],
  };
  const [title, text] = map[kind];
  return `<div class="panel">
    <h2>${title}</h2>
    <p>${text}</p>
    ${kind === 'unsupported' ? '' : `<button class="primary" data-action="retryBoot">${ru.common.retry}</button>`}
    ${kind === 'offline' || kind === 'server' ? `<button class="secondary" data-action="playOffline">${t.playOffline}</button>` : ''}
    ${code ? `<p class="note">${esc(t.errorCode(code))}</p>` : ''}
  </div>`;
}
