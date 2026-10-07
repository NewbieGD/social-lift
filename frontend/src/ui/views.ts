// HTML for every screen. Buttons use data-action/data-arg; main.ts handles them.
import { AGE_LABEL } from '../config';
import { legal, ru, type DocSection } from '../i18n/ru';
import type { ChatMsg, ChatUser } from '../net/duel';
import type { CatalogItem, FinishResult, Leaderboard, LeaderRow, PublicProfile, ShopState, Stats } from '../net/session';
import { STYLE_SETS } from '../render/styles';
import { esc } from './dom';
import { keyLabel } from '../input/input';
import type { LightId } from '../core/gameConfig';
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

function rulesView(): string {
  const r = ru.rules;
  const list = r.sections
    .map(
      (sec, i) =>
        `<details class="rule-sec" style="--i:${i}"${i < 2 ? ' open' : ''}><summary><span class="rs-ico">${r.sectionIcons[i] ?? '📌'}</span><span class="rs-num">${i + 1}</span><span class="rs-title">${esc(sec.h ?? '')}</span><span class="rs-chev" aria-hidden="true"></span></summary><div class="rs-body">${sec.p.map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>`,
    )
    .join('');
  return `${header(r.title)}<div class="scroll doc rules-page">
    <div class="rules-hero"><i class="rh-orb o1"></i><i class="rh-orb o2"></i><i class="rh-orb o3"></i><div class="rh-ico">🛗</div><p>${esc(r.lead)}</p></div>
    <div class="quick-grid">${r.quick.map(([i, h, t], n) => `<div class="quick" style="--i:${n}"><span class="q-ico">${i}</span><b>${esc(h)}</b><span>${esc(t)}</span></div>`).join('')}</div>
    <div class="color-legend">${r.colors.map(([c, n, v]) => `<span class="cl" style="--c:${c}"><i></i>${esc(n)}<b>${esc(v)}</b></span>`).join('')}</div>
    <p class="rules-tap">${esc(r.tapHint)}</p>
    <div class="rule-list">${list}</div>
  </div>`;
}

export function docView(kind: 'terms' | 'privacy' | 'rules'): string {
  if (kind === 'rules') return rulesView();
  const doc = legal[kind];
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
  /** Coin balance; null when there is no server (offline, outside VK). */
  coins: number | null;
  mode: 'loading' | 'online' | 'offline' | 'outside';
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  crown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18L2 7l5.5 4L12 4l4.5 7L22 7l-1 11z" fill="#FFD640" stroke="#8a5a00" stroke-width="1.2"/><rect x="3" y="18.5" width="18" height="2.5" rx="1" fill="#E8B23A"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z" fill="#5AA8FF"/><path d="M4 21.5A2.5 2.5 0 016.5 19H20v3H6.5A2.5 2.5 0 014 21.5z" fill="#2257B8"/><path d="M8 6h8M8 9.5h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 2 .9 2.2-1.5 2.4 2.4-1.5 2.2.9 2 2.6.5v3.4l-2.6.5-.9 2 1.5 2.2-2.4 2.4-2.2-1.5-2 .9-.5 2.6h-3.4l-.5-2.6-2-.9-2.2 1.5-2.4-2.4 1.5-2.2-.9-2L2 13.7v-3.4l2.6-.5.9-2L4 5.6 6.4 3.2l2.2 1.5 2-.9z" fill="#B9C1CD"/><circle cx="12" cy="12" r="3.6" fill="#4A5262"/></svg>',
  swords:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3l7.5 7.5-2 2L2 5V3zM20 3l-7.5 7.5 2 2L22 5V3z" fill="#D3D8E2"/><path d="M6.5 14.5l3 3-2.5 2.5-1.5-1.5-1.5 1.5L3 19l1.5-1.5L3 16zM17.5 14.5l-3 3 2.5 2.5 1.5-1.5 1.5 1.5L21 19l-1.5-1.5L21 16z" fill="#E8B23A"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2h-8l-5 4v-4H4a2 2 0 01-2-2V6a2 2 0 012-2z" fill="#5AA8FF"/><circle cx="8" cy="10.5" r="1.3" fill="#fff"/><circle cx="12" cy="10.5" r="1.3" fill="#fff"/><circle cx="16" cy="10.5" r="1.3" fill="#fff"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3" fill="#38C673"/><path d="M3 7l9 6.5L21 7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" fill="#7FCF8A"/><circle cx="12" cy="12" r="3" fill="#3E8C4C"/><rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="#3E8C4C" stroke-width="1.5"/></svg>',
  floor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" fill="#8D96A6"/><rect x="6" y="4" width="5.5" height="16" fill="#C7CCD6"/><rect x="12.5" y="4" width="5.5" height="16" fill="#C7CCD6"/><path d="M12 6.5l-2.4 3h4.8z" fill="#FFB547"/></svg>',
};

const FS_ICON =
  '<svg class="fs-in" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="fs-out" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const HAND_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 013 0V10l.5-.1V8.5a1.5 1.5 0 013 0v2l.5-.1a1.5 1.5 0 013 .3V15c0 3.3-2.7 6-6 6h-1.2c-1.8 0-3.4-.8-4.5-2.2L4.6 15a1.5 1.5 0 012.3-1.9L9 15z" fill="currentColor"/></svg>';

export const COIN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#C99A2E"/><circle cx="12" cy="12" r="8" fill="#FFD640"/><path d="M12 7v10M9.4 9.4c.8-.9 2-1.2 3-.9 1.3.4 1.3 1.9 0 2.2l-1.6.4c-1.3.3-1.3 1.9 0 2.3 1 .3 2.2 0 3-.9" fill="none" stroke="#8A5A00" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="9" cy="8.4" rx="2.4" ry="1.2" fill="#fff" opacity=".45" transform="rotate(-30 9 8.4)"/></svg>';

function chip(icon: string, label: string, value: string, i: number, kind = ''): string {
  return `<div class="chip ${kind}" style="--i:${i}"><span class="chip-ico">${icon}</span><span class="chip-text"><span class="chip-label">${esc(label)}</span><b>${esc(value)}</b></span></div>`;
}

const PETS_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.4" rx="5.2" ry="4.4" fill="#F2A65A"/><ellipse cx="5.4" cy="10.4" rx="2.1" ry="2.8" fill="#F2A65A"/><ellipse cx="18.6" cy="10.4" rx="2.1" ry="2.8" fill="#F2A65A"/><ellipse cx="9.4" cy="5.6" rx="2" ry="2.7" fill="#F2A65A"/><ellipse cx="14.6" cy="5.6" rx="2" ry="2.7" fill="#F2A65A"/></svg>';

const DECOR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" fill="#5AA8FF"/><path d="M3 14l5-4 4 3 4-5 5 6v3H3z" fill="#2257B8"/><circle cx="8" cy="8.5" r="1.8" fill="#FFE58A"/><rect x="9" y="18" width="6" height="2.4" rx="1" fill="#B9C1CD"/></svg>';

const MORE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

const STYLES_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3l-5 3.5 2.2 3L7 8.4V21h10V8.4l1.8 1.1 2.2-3L16 3c-.6 1.6-2.2 2.6-4 2.6S8.6 4.6 8 3z" fill="#B58CFF"/><path d="M9.5 3.6c.7 1.1 1.5 1.7 2.5 1.7s1.8-.6 2.5-1.7" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></svg>';

export function menuView(d: MenuData): string {
  const s = d.stats;
  const fresh = !s || (s.total_runs === 0 && !s.best_all);
  const tier = s?.last_tier ?? 0;
  const chips = fresh
    ? `<div class="chip wide" style="--i:0">${ICON.floor}<span class="chip-text"><b>${ru.menu.firstRun}</b></span></div>`
    : [
        chip(ICON.crown, ru.menu.chipRank, s?.rank_all ? `#${s.rank_all}` : ru.wardrobe.none, 0, 'gold'),
        chip(ICON.bill, ru.menu.chipLast, String(s?.last_score ?? 0), 1, 'green'),
        chip(ICON.floor, ru.menu.chipTier, ru.tiers[tier] ?? ru.tiers[0], 2, 'blue'),
      ].join('');
  let status = '';
  if (d.mode === 'offline') {
    status = `<p class="status warn">${ru.menu.offline}</p><button class="link-btn" data-action="reconnect">${ru.common.retry}</button>`;
  } else if (d.mode === 'outside') {
    status = `<p class="status small">${ru.menu.outside}</p>`;
  }
  return `<div class="menu2">
    <div class="showcase">
      <div class="stage-top">
        <button class="top-btn more-btn" data-action="open" data-arg="moreMenu" aria-label="${ru.menu.more}" title="${ru.menu.more}">${MORE_ICON}</button>
        <button class="top-btn fs-btn" data-action="fullscreen" aria-label="${ru.menu.fullscreen}" title="${ru.menu.fullscreen}">${FS_ICON}</button>
        ${d.coins === null ? '' : `<div class="coin-pill" title="${ru.menu.coins}" aria-label="${ru.menu.coins}: ${d.coins}">${COIN_ICON}<b>${d.coins}</b></div>`}
      </div>
      <div class="hero-stage">
        <span class="stage-glow" aria-hidden="true"></span>
        <canvas id="menuHero" aria-hidden="true"></canvas>
        <button class="hero-hit" id="menuHeroHit" data-action="open" data-arg="wardrobe" aria-label="${ru.wardrobe.title}"></button>
        <span class="tap-hint">${HAND_ICON}${ru.wardrobe.hint}</span>
      </div>
      <div class="chips">${chips}</div>
    </div>
    <div class="menu-actions">
      <button class="primary big play" data-action="play">${ICON.play}<span>${ru.common.play}</span></button>
      <div class="menu-grid stagger">
        <button class="tile accent duel-tile" data-action="open" data-arg="duels">${ICON.swords}<span>${ru.menu.duels}</span></button>
        <button class="tile accent chat-tile" data-action="open" data-arg="chat">${ICON.chat}<span>${ru.menu.chat}</span></button>
        <button class="tile" data-action="open" data-arg="leaders">${ICON.crown}<span>${ru.menu.leaders}</span></button>
        <button class="tile accent styles-tile" data-action="open" data-arg="styles">${STYLES_ICON}<span>${ru.menu.styles}</span></button>
        <button class="tile accent decor-tile" data-action="open" data-arg="decor">${DECOR_ICON}<span>${ru.menu.decor}</span></button>
        <button class="tile accent pets-tile" data-action="open" data-arg="pets">${PETS_ICON}<span>${ru.menu.pets}</span></button>
      </div>
      ${status}
    </div>
  </div>`;
}

/** The rest of the menu: rules, settings and the developer contact. */
export function moreMenuView(): string {
  return `<div class="panel more-menu">
    <button class="icon-btn close" data-action="back" aria-label="${ru.chat.close}">${CLOSE_ICON}</button>
    <h2>${ru.moreMenu.title}</h2>
    <button class="secondary menu-row" data-action="openFromMore" data-arg="rules">${ICON.book}<span>${ru.menu.rules}</span></button>
    <button class="secondary menu-row" data-action="openFromMore" data-arg="settings">${ICON.gear}<span>${ru.menu.settings}</span></button>
    <button class="secondary menu-row" data-action="openFromMore" data-arg="contact">${ICON.mail}<span>${ru.menu.contactShort}</span></button>
  </div>`;
}

const STAT_ICONS: Record<string, string> = {
  best: '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 13v4M8 20h8M10 17h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  week: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  all: '<svg viewBox="0 0 24 24"><path d="M3 18L2 7l5.5 4L12 4l4.5 7L22 7l-1 11zM4 21h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  runs: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0112-5l2-2v6h-6l2.2-2.2A4.5 4.5 0 007.5 12M19 12a7 7 0 01-12 5l-2 2v-6h6l-2.2 2.2A4.5 4.5 0 0016.5 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  combo: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.5 1 2.3 2 2.5C10.5 8.5 11 5.5 12 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  captures: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
};

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3" fill="currentColor"/><path d="M8 10V8a4 4 0 018 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';


export function wardrobeView(s: Stats | null, mask: number, who?: { name: string | null; crown: boolean }): string {
  const v = (n: number | null | undefined): string => (n === null || n === undefined || n === 0 ? ru.wardrobe.none : String(n));
  let owned = 0;
  for (let i = 0; i < 13; i++) if (mask & (1 << i)) owned++;
  const stats: [string, string, string, string][] = [
    ['best', ru.wardrobe.best, v(s?.best_all), 'gold'],
    ['week', ru.wardrobe.rankWeek, v(s?.rank_week), 'blue'],
    ['all', ru.wardrobe.rankAll, v(s?.rank_all), 'violet'],
    ['runs', ru.wardrobe.runs, v(s?.total_runs), 'green'],
    ['combo', ru.wardrobe.combo, v(s?.best_combo), 'orange'],
    ['captures', ru.wardrobe.captures, v(s?.total_captures), 'pink'],
  ];
  const itemNames = [
    'cap', 'slippers', 'sweats', 'shirt', 'trousers', 'jacket', 'watch', 'newTorch', 'tie', 'shoes', 'phone', 'glasses', 'helmet',
  ];
  const name = who?.name || ru.leaders.player;
  const bonus = owned * 5;
  return `${header(ru.wardrobe.title)}<div class="scroll wardrobe">
    <section class="ward-hero">
      <div class="ward-stage"><canvas id="wardHero" aria-hidden="true"></canvas></div>
      <div class="ward-ring" style="--p:${(owned / 13).toFixed(3)}" aria-label="${esc(ru.wardrobe.collected(owned))}">
        <span><b>${owned}</b><small>${ru.wardrobe.of13}</small></span>
      </div>
      <div class="ward-bonus${bonus ? '' : ' zero'}"><b>+${bonus}%</b><small>${ru.wardrobe.toMult}</small></div>
      <div class="ward-plate">${who?.crown ? `<span class="wp-crown">${CROWN}</span>` : ''}<b>${esc(name)}</b>${
        who?.crown ? `<small>${ru.wardrobe.leader}</small>` : ''
      }</div>
    </section>

    <section class="ward-card">
      <div class="ward-prog-head"><b>${esc(ru.wardrobe.collected(owned))}</b><span>${Math.round((owned / 13) * 100)}%</span></div>
      <div class="bonus-bar" aria-hidden="true"><i style="transform:scaleX(${(owned / 13).toFixed(3)})"></i></div>
      <p class="muted">${esc(ru.wardrobe.bonus())}</p>
    </section>

    <div class="ward-sec"><h3>${ru.wardrobe.statsTitle}</h3></div>
    <dl class="ward-stats stagger">${stats
      .map(
        ([ico, k, val, tone]) =>
          `<div class="ws ${tone}"><i aria-hidden="true">${STAT_ICONS[ico]}</i><dd>${val}</dd><dt>${k}</dt></div>`,
      )
      .join('')}</dl>

    <div class="ward-sec"><h3>${ru.wardrobe.collection}</h3><span class="pill">${owned}/13</span></div>
    <p class="muted ward-how">${ru.wardrobe.how}</p>
    <div class="looks items stagger">
      ${itemNames
        .map((name2, i) => {
          const has = (mask & (1 << i)) !== 0;
          return `<div class="look ${has ? 'owned' : 'locked'}">
              <em class="look-n">${String(i + 1).padStart(2, '0')}</em>
              <span class="look-state" aria-hidden="true">${has ? CHECK_ICON : LOCK_ICON}</span>
              <canvas data-item="${i}" aria-hidden="true"></canvas>
              <span class="look-name">${esc(has ? ru.items[name2] : ru.wardrobe.lockedAt(ru.tiers[i]))}</span>
            </div>`;
        })
        .join('')}
    </div>
  </div>`;
}

// ---------- Styles ----------

function requirementText(c: CatalogItem | undefined): string {
  if (!c) return ru.styles.requireNone;
  if (c.record !== null) return ru.styles.requireRecord(c.record);
  if (c.duel_streak !== null) return ru.styles.requireStreak(c.duel_streak);
  if (c.drop) return ru.styles.requireDrop;
  if (c.price !== null) return ru.styles.requirePrice(c.price);
  return ru.styles.requireNone;
}

export function stylesView(shop: ShopState | null): string {
  if (!shop) {
    return `${header(ru.styles.title)}<div class="panel flat"><p class="status warn">${ru.duel.offline}</p></div>`;
  }
  const owned = new Set(shop.owned);
  const byId = new Map(shop.catalog.map((c) => [c.id, c]));
  const worn = (slot: string): string | undefined => (shop.loadout as Record<string, string | undefined>)[slot];
  const slotChips = (['head', 'torso', 'arms', 'legs', 'feet'] as const)
    .map((slot) => {
      const id = worn(slot);
      return `<button class="slot-chip ${id ? 'on' : ''}" ${id ? `data-action="takeOff" data-arg="${slot}"` : 'disabled'} aria-label="${ru.styles.slots[slot]}">
        ${id ? `<canvas data-style="${id}" aria-hidden="true"></canvas>` : '<span class="slot-empty"></span>'}
        <span>${ru.styles.slots[slot]}</span>
      </button>`;
    })
    .join('');
  const sets = STYLE_SETS.map((set) => {
    const ids = set.parts.map((slot) => `${set.id}_${slot}`).filter((id) => byId.has(id));
    const have = ids.filter((id) => owned.has(id));
    const allWorn = have.length > 0 && have.every((id) => worn(byId.get(id)!.slot) === id);
    const cards = ids
      .map((id) => {
        const c = byId.get(id)!;
        const isOwned = owned.has(id);
        const isWorn = worn(c.slot) === id;
        const note = isOwned ? (isWorn ? ru.styles.worn : ru.styles.wear) : requirementText(c);
        return `<button class="style-card ${isOwned ? 'owned' : 'locked'} ${isWorn ? 'worn' : ''}" ${isOwned ? `data-action="wearStyle" data-arg="${id}"` : 'disabled'} aria-label="${esc(ru.styles.parts[id])}">
          <canvas data-style="${id}" data-locked="${isOwned ? '0' : '1'}" aria-hidden="true"></canvas>
          <b>${esc(ru.styles.parts[id])}</b>
          <span>${esc(isOwned ? ru.styles.slots[c.slot] + ' · ' + note : note)}</span>
          ${isWorn ? '<i class="tick" aria-hidden="true">✓</i>' : ''}
        </button>`;
      })
      .join('');
    return `<section class="style-set">
      <div class="set-head">
        <h3>${esc(ru.styles.sets[set.id])}</h3>
        <span class="set-count">${ru.styles.progress(have.length, ids.length)}</span>
        ${have.length ? `<button class="mini-btn" data-action="${allWorn ? 'takeOffSet' : 'wearSet'}" data-arg="${set.id}">${allWorn ? ru.styles.takeOffAll : ru.styles.wearSet}</button>` : ''}
      </div>
      <div class="style-grid">${cards}</div>
    </section>`;
  }).join('');
  return `${header(ru.styles.title)}<div class="scroll styles-screen">
    <div class="styles-top">
      <div class="styles-stage"><span class="stage-glow" aria-hidden="true"></span><canvas id="stylesHero" aria-hidden="true"></canvas></div>
      <div class="slot-chips">${slotChips}</div>
    </div>
    <p class="muted small">${ru.styles.lead}</p>
    ${sets}
  </div>`;
}

// ---------- Decoration ----------

export type DecorTab = 'bg' | 'prop' | 'frame' | 'fx';

const BG_IDS = ['bg_default', 'bg_dusk', 'bg_roof', 'bg_metro', 'bg_neon', 'bg_winter', 'bg_space'];
const PROP_LIST = ['prop_football', 'prop_basketball', 'prop_lamp', 'prop_bat', 'prop_cup', 'prop_sword', 'prop_tv'];
const FRAME_LIST = ['frame_gold', 'frame_neon'];
const FX_LIST = ['fx_sparks', 'fx_snow'];

function decorRequirement(c: CatalogItem | undefined): string {
  if (!c) return ru.styles.requireNone;
  if (c.record !== null) return ru.styles.requireRecord(c.record);
  if (c.price !== null) return ru.styles.requirePrice(c.price);
  return ru.styles.requireNone;
}

export function decorView(shop: ShopState | null, tab: DecorTab, spot: 'left' | 'right' | 'wall'): string {
  if (!shop) {
    return `${header(ru.decor.title)}<div class="panel flat"><p class="status warn">${ru.duel.offline}</p></div>`;
  }
  const owned = new Set(shop.owned);
  const byId = new Map(shop.catalog.map((c) => [c.id, c]));
  const decor = shop.decor ?? {};
  const ids = tab === 'bg' ? BG_IDS : tab === 'prop' ? PROP_LIST : tab === 'frame' ? FRAME_LIST : FX_LIST;
  const isChosen = (id: string): boolean => {
    if (tab === 'bg') return (decor.bg ?? 'bg_default') === id;
    if (tab === 'prop') return Object.values(decor.props ?? {}).includes(id);
    return (tab === 'frame' ? decor.frame : decor.fx) === id;
  };
  const cards = ids
    .map((id) => {
      const c = byId.get(id);
      const free = id === 'bg_default';
      const has = free || owned.has(id);
      const chosen = isChosen(id);
      const priced = !has && c?.price !== null && c?.price !== undefined;
      const action = has ? `data-action="decorPick" data-arg="${id}"` : priced ? `data-action="askBuy" data-arg="${id}"` : 'disabled';
      const where = tab === 'prop' && chosen ? Object.entries(decor.props ?? {}).find(([, v]) => v === id)?.[0] : undefined;
      const note = has
        ? chosen
          ? where
            ? `${ru.decor.chosen} · ${ru.decor.spots[where]}`
            : ru.decor.chosen
          : tab === 'prop'
            ? ru.decor.place
            : ru.styles.wear
        : priced
          ? `${ru.decor.buy} · ${c!.price}`
          : decorRequirement(c);
      return `<button class="style-card decor-card ${has ? 'owned' : 'locked'} ${chosen ? 'worn' : ''}" ${action} aria-label="${esc(ru.decor.names[id])}">
        <canvas data-decor="${id}" data-kind="${tab}" data-locked="${has ? '0' : '1'}" aria-hidden="true"></canvas>
        <b>${esc(ru.decor.names[id])}</b>
        <span>${esc(note)}</span>
        ${chosen ? '<i class="tick" aria-hidden="true">✓</i>' : ''}
      </button>`;
    })
    .join('');
  const extra =
    tab === 'frame' || tab === 'fx'
      ? `<button class="style-card decor-card owned ${(tab === 'frame' ? decor.frame : decor.fx) ? '' : 'worn'}" data-action="decorPick" data-arg="${tab === 'frame' ? 'frame_none' : 'fx_none'}">
          <canvas data-decor="none" data-kind="${tab}" aria-hidden="true"></canvas>
          <b>${tab === 'frame' ? ru.decor.none : ru.decor.noneFx}</b><span>${(tab === 'frame' ? decor.frame : decor.fx) ? ru.styles.wear : ru.decor.chosen}</span>
        </button>`
      : '';
  const tabs = (['bg', 'prop', 'frame', 'fx'] as DecorTab[])
    .map((k) => `<button role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-action="decorTab" data-arg="${k}">${ru.decor.tabs[k]}</button>`)
    .join('');
  const spots =
    tab === 'prop'
      ? `<div class="spot-row"><span>${ru.decor.spotHint}</span>${(['left', 'right', 'wall'] as const)
          .map((s) => `<button class="mini-btn ${s === spot ? 'on' : ''}" data-action="decorSpot" data-arg="${s}">${ru.decor.spots[s]}</button>`)
          .join('')}${decor.props?.[spot] ? `<button class="mini-btn" data-action="decorClear" data-arg="${spot}">${ru.decor.remove}</button>` : ''}</div>`
      : '';
  return `${header(ru.decor.title)}<div class="scroll styles-screen">
    <div class="decor-stage"><canvas id="decorHero" aria-hidden="true"></canvas></div>
    <div class="tabs tabs-4" role="tablist">${tabs}</div>
    ${spots}
    ${tab === 'prop' ? `<p class="muted small">${ru.decor.tvHint}: ${ru.decor.names.prop_tv}.</p>` : ''}
    <div class="style-grid decor-grid">${extra}${cards}</div>
    <p class="muted small">${ru.decor.lead}</p>
  </div>`;
}

export function petsView(shop: ShopState | null): string {
  if (!shop) {
    return `${header(ru.pets.title)}<div class="panel flat"><p class="status warn">${ru.duel.offline}</p></div>`;
  }
  const owned = new Set(shop.owned);
  const byId = new Map(shop.catalog.map((c) => [c.id, c]));
  const chosenId = shop.decor?.pet;
  const cards = ['pet_cat', 'pet_dog', 'pet_parrot']
    .map((id) => {
      const has = owned.has(id);
      const chosen = chosenId === id;
      const c = byId.get(id);
      const note = has ? (chosen ? ru.pets.chosen : ru.pets.pick) : c?.record != null ? ru.pets.requireRecord(c.record) : ru.styles.requireNone;
      return `<button class="style-card decor-card ${has ? 'owned' : 'locked'} ${chosen ? 'worn' : ''}" ${has ? `data-action="petPick" data-arg="${id}"` : 'disabled'} aria-label="${esc(ru.pets.names[id])}">
        <canvas data-pet="${id}" data-locked="${has ? '0' : '1'}" aria-hidden="true"></canvas>
        <b>${esc(ru.pets.names[id])}</b>
        <span>${esc(note)}</span>
        ${chosen ? '<i class="tick" aria-hidden="true">✓</i>' : ''}
      </button>`;
    })
    .join('');
  const none = `<button class="style-card decor-card owned ${chosenId ? '' : 'worn'}" data-action="petPick" data-arg="pet_none">
      <canvas data-pet="none" aria-hidden="true"></canvas><b>${ru.pets.none}</b><span>${chosenId ? ru.pets.pick : ru.pets.chosen}</span>
    </button>`;
  return `${header(ru.pets.title)}<div class="scroll styles-screen">
    <div class="decor-stage"><canvas id="petsHero" aria-hidden="true"></canvas></div>
    <div class="style-grid decor-grid">${none}${cards}</div>
    <p class="muted small">${ru.pets.lead}</p>
  </div>`;
}

export function buyConfirmView(name: string, price: number, coins: number): string {
  const ok = coins >= price;
  return `<div class="panel">
    <h2>${ru.decor.buyTitle}</h2>
    <p>${esc(ru.decor.buyText(name, price))}</p>
    <p class="muted">${ru.decor.balance(coins)}</p>
    ${ok ? '' : `<p class="status warn">${ru.decor.notEnough}</p>`}
    <button class="primary" data-action="confirmBuy" ${ok ? '' : 'disabled'}>${ru.decor.buy}</button>
    <button class="secondary" data-action="back">${ru.decor.cancel}</button>
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

/** Message about the crown: you got it, it was taken, or the week ended. */
export function crownCardView(n: { kind: 'won' | 'lost' | 'expired'; name: string | null } | null): string {
  const t = ru.crown;
  const text = !n ? '' : n.kind === 'won' ? t.won : n.kind === 'lost' ? t.lost(esc(n.name || t.someone)) : t.expired;
  return `<div class="panel crown-card ${n?.kind === 'won' ? 'won' : 'lost'}">
    <div class="crown-big" aria-hidden="true">${CROWN}</div>
    <h2>${t.title}</h2>
    <p>${text}</p>
    <button class="primary" data-action="crownOk">${n?.kind === 'lost' ? t.play : t.ok}</button>
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

export interface KeysView {
  /** Only the browser version has a keyboard to configure. */
  show: boolean;
  rebinding: LightId | null;
  error: string | null;
}

function keyRows(s: Settings, k: KeysView): string {
  const codes: Record<LightId, string> = { yellow: s.keyYellow, blue: s.keyBlue, green: s.keyGreen, red: s.keyRed };
  const rows = (['yellow', 'blue', 'green', 'red'] as LightId[])
    .map((l) => {
      const listening = k.rebinding === l;
      return `<div class="row key-row">
        <span class="key-name"><i class="key-dot ${l}" aria-hidden="true"></i>${ru.settings.keyNames[l]}</span>
        <button type="button" class="key-btn${listening ? ' listening' : ''}" data-action="rebind" data-arg="${l}">${listening ? ru.settings.keyPress : esc(keyLabel(codes[l]))}</button>
      </div>`;
    })
    .join('');
  return `<h3>${ru.settings.keys}</h3>
    <p class="muted">${ru.settings.keysHint}</p>
    ${rows}
    ${k.error ? `<p class="status warn">${esc(k.error)}</p>` : ''}
    <button type="button" class="secondary key-reset" data-action="keysReset">${ru.settings.keysReset}</button>`;
}

export function settingsView(
  s: Settings,
  opts: { vibration: boolean; playerId: number | null; canDelete: boolean; keys: KeysView; hideLink: boolean | null },
): string {
  return `${header(ru.settings.title)}<div class="scroll settings">
    ${
      opts.hideLink === null
        ? ''
        : `<h3>${ru.settings.hideVk}</h3>
    <label class="row toggle-row"><span>${ru.settings.hideVk}</span><input type="checkbox" role="switch" class="switch" data-privacy="hideVk" ${opts.hideLink ? 'checked' : ''} /></label>
    <p class="muted small">${ru.settings.hideVkHint}</p>`
    }
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
    ${opts.keys.show ? keyRows(s, opts.keys) : ''}

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

const TAB_ICONS = {
  week: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M4 10h16M9 3v4M15 3v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  all: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 13v4M8 20h8M10 17h4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function leadersShell(scope: 'week' | 'all'): string {
  const tab = (id: 'week' | 'all', label: string): string =>
    `<button role="tab" class="${scope === id ? 'on' : ''}" aria-selected="${scope === id}" data-action="lbScope" data-arg="${id}">${TAB_ICONS[id]}<span>${label}</span></button>`;
  return `${header(ru.leaders.title)}
    <div class="tabs" role="tablist">
      ${tab('week', ru.leaders.week)}${tab('all', ru.leaders.all)}
    </div>
    <div class="crown-info"><span class="ci-icon" aria-hidden="true">${CROWN}</span><div><b>${ru.leaders.crownTitle}</b><p>${ru.leaders.crownText}</p></div></div>
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

function podAvatar(row: LeaderRow): string {
  const initial = esc((row.name || ru.leaders.player).slice(0, 1));
  const img = row.photo ? `<img src="${esc(row.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '';
  return `<span class="pod-ava"><span class="ava-inner">${img || `<b>${initial}</b>`}</span></span>`;
}

/** Top three on a podium (2 - 1 - 3), everyone else in the list below. */
export function leadersBoard(lb: Leaderboard, myId: number | null, clickable: boolean): string {
  if (!lb.rows.length) return leadersRows(lb, myId, clickable);
  const byRank = (n: number): LeaderRow | undefined => lb.rows.find((r) => r.rank === n);
  const pod = (n: 1 | 2 | 3): string => {
    const r = byRank(n);
    if (!r) return `<div class="pod p${n} ghost"><div class="pod-step"><b>${n}</b></div></div>`;
    const name = r.deactivated ? ru.leaders.deleted : r.name || ru.leaders.player;
    const canOpen = clickable && !r.deactivated;
    const tag = canOpen ? 'button' : 'div';
    const attrs = canOpen ? ` data-action="profile" data-arg="${r.user_id}"` : '';
    return `<${tag} class="pod p${n}${r.user_id === myId ? ' mine' : ''}"${attrs}>
      ${n === 1 ? `<span class="pod-crown" aria-hidden="true">${CROWN}</span>` : ''}
      ${podAvatar(r)}
      <span class="pod-name">${esc(name)}</span>
      <span class="pod-score">${r.score}${lb.scope === 'duels' ? `<small>${ru.leaders.winsWord}</small>` : ''}</span>
      <span class="pod-step"><b>${n}</b></span>
    </${tag}>`;
  };
  const rest: Leaderboard = { ...lb, rows: lb.rows.filter((r) => r.rank > 3) };
  return `<div class="podium${lb.scope === 'duels' ? ' duel-pod' : ''}">${pod(2)}${pod(1)}${pod(3)}</div>${
    rest.rows.length ? `<div class="lb-rest">${leadersRows(rest, myId, clickable)}</div>` : ''
  }`;
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
  /** Last loaded duel rating (shown at once while a fresh copy loads). */
  leadersHtml: { rows: string; me: string } | null;
}

export function duelsView(d: DuelView): string {
  let status = '';
  if (d.status === 'offline') status = ru.duel.offline;
  else if (d.status === 'connecting') status = ru.duel.connecting;
  else if (d.status === 'waiting') status = ru.duel.waiting(d.waitingFor || ru.duel.player);
  else if (d.status === 'none') status = ru.duel.none;
  else if (d.status === 'declined') status = ru.duel.declined;
  const canFind = d.status === 'idle' || d.status === 'none' || d.status === 'declined';
  return `${header(ru.duel.title)}<div class="scroll duel-scroll"><div class="panel flat duel-panel">
    <div class="duel-hero" aria-hidden="true"><i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i>${ICON.swords}</div>
    <p>${ru.duel.lead}</p>
    <p class="muted">${ru.duel.rulesNote}</p>
    ${d.status !== 'offline' && d.status !== 'connecting' ? `<p class="duel-online"><span class="dot"></span>${ru.duel.online(d.online)}</p>` : ''}
    ${status ? `<p class="status ${d.status === 'waiting' ? '' : 'warn'}">${esc(status)}</p>` : ''}
    ${
      d.status === 'waiting'
        ? `<button class="secondary" data-action="duelCancel">${ru.duel.cancel}</button>`
        : `<button class="primary" data-action="duelFind" ${canFind ? '' : 'disabled'}>${ru.duel.find}</button>`
    }
    <h3 class="duel-lb-title"><span>${ru.duel.leaders}</span></h3>
    <div class="duel-lb" id="duelLbList">${d.leadersHtml?.rows ?? '<div class="lb-row skeleton"><span></span><span></span><span></span></div>'}</div>
    <div class="me-card" id="duelLbMe">${d.leadersHtml?.me ?? ''}</div>
  </div></div>`;
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
  duel: { oppName: string; me: number; opp: number; oppOut: boolean } | null;
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
    <p class="coins-line" id="coinsLine"></p>
    <p class="new-styles" id="stylesLine"></p>
    ${
      d.duel
        ? `<div class="duel-score" id="duelScore">
        <div class="ds-side me"><small>${ru.duel.you}</small><b>${d.duel.me}</b></div>
        <div class="ds-vs">:</div>
        <div class="ds-side opp"><small>${esc(d.duel.oppName)}</small><b id="duelOppFinal">${d.duel.opp}</b><em id="duelOppState">${d.duel.oppOut ? '' : ru.duel.playing}</em></div>
      </div>`
        : ''
    }
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
  return `<div class="panel tut-done">
    <h2>${ru.tutorial.doneTitle}</h2>
    <p>${ru.tutorial.doneText}</p>
    <button class="primary" data-action="toMenu">${ru.tutorial.doneMenu}</button>
    <button class="secondary" data-action="afterTutorial">${ru.common.play}</button>
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

// ---------- Chat ----------


function chatAva(u: ChatUser, size = ''): string {
  const name = u.name || ru.leaders.player;
  const inner = u.photo
    ? `<img src="${esc(u.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<b>${esc(name.slice(0, 1))}</b>`;
  return `<button type="button" class="chat-ava ${size}" data-action="player" data-arg="${u.id}" aria-label="${esc(name)}">${inner}</button>`;
}

export function chatView(): string {
  return `${header(ru.chat.title)}
    <div class="chat-top"><span class="chat-count" id="chatCount"></span><div class="chat-who" id="chatWho"></div></div>
    <p class="chat-rules">${ru.chat.rules}</p>
    <div class="scroll chat-list" id="chatList"></div>
    <p class="chat-status" id="chatStatus"></p>
    <form class="chat-form" id="chatForm" autocomplete="off">
      <input id="chatInput" type="text" maxlength="200" placeholder="${ru.chat.placeholder}" enterkeyhint="send" />
      <button type="submit" class="primary" id="chatSend">${ru.chat.send}</button>
    </form>`;
}

export function chatWhoHtml(users: ChatUser[]): string {
  return users.map((u) => chatAva(u, 'small')).join('');
}

export function chatMsgHtml(m: ChatMsg, myId: number | null): string {
  if (m.sys) return `<p class="chat-sys">${esc(m.text)}</p>`;
  const t = new Date(m.ts);
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  const name = m.user.name || ru.leaders.player;
  return `<div class="chat-msg${m.user.id === myId ? ' mine' : ''}">
    ${chatAva(m.user)}
    <div class="chat-body">
      <div class="chat-meta"><button type="button" class="chat-name" data-action="player" data-arg="${m.user.id}">${esc(name)}</button>${m.user.rank ? `<span class="chat-rank">#${m.user.rank}</span>` : ''}<time>${time}</time></div>
      <p>${esc(m.text)}</p>
    </div>
  </div>`;
}

export interface ProfileWho {
  id: number;
  name: string | null;
  photo: string | null;
  link: boolean;
  /** Offer a duel challenge (chat only). */
  canDuel: boolean;
  mine: boolean;
}

/** Tap on a player in a rating or in the chat: the game profile or the VK page. */
export function profileChoiceView(w: ProfileWho): string {
  const name = w.name || ru.leaders.player;
  const img = w.photo ? `<img src="${esc(w.photo)}" alt="" referrerpolicy="no-referrer" />` : `<b>${esc(name.slice(0, 1))}</b>`;
  return `<div class="panel invite">
    <button class="icon-btn close" data-action="back" aria-label="${ru.chat.close}">${CLOSE_ICON}</button>
    <div class="invite-ava">${img}</div>
    <h2>${esc(name)}</h2>
    <button class="primary" data-action="openGameProfile" data-arg="${w.id}">${ru.profileChoice.game}</button>
    ${w.link ? `<button class="secondary" data-action="openVkProfile" data-arg="${w.id}">${ru.profileChoice.vk}</button>` : `<p class="muted small">${ru.profileChoice.hidden}</p>`}
    ${w.canDuel && !w.mine ? `<button class="secondary" data-action="challenge" data-arg="${w.id}">${ru.profileChoice.duel}</button>` : ''}
  </div>`;
}

export function profileView(p: PublicProfile | null, state: 'loading' | 'ready' | 'failed'): string {
  if (state !== 'ready' || !p) {
    return `${header(ru.profile.title)}<div class="panel flat center-col">${
      state === 'loading' ? `<p class="status">${ru.profile.loading}</p>` : `<p class="status warn">${ru.profile.failed}</p><button class="secondary" data-action="profileRetry">${ru.profile.retry}</button>`
    }</div>`;
  }
  const v = (n: number | null | undefined): string => (n === null || n === undefined || n === 0 ? ru.wardrobe.none : String(n));
  const rows: [string, string][] = [
    [ru.profile.best, v(p.stats.best_all)],
    [ru.profile.rankAll, p.stats.rank_all ? `#${p.stats.rank_all}` : ru.wardrobe.none],
    [ru.profile.rankWeek, p.stats.rank_week ? `#${p.stats.rank_week}` : ru.wardrobe.none],
    [ru.profile.duelWins, v(p.stats.duel_wins)],
    [ru.profile.combo, v(p.stats.best_combo)],
    [ru.profile.stage, ru.tiers[p.stats.best_tier] ?? ru.tiers[0]],
    [ru.profile.styles, ru.profile.of(p.styles_owned, p.styles_total)],
    [ru.profile.collection, ru.profile.of(p.collection_owned, p.collection_total)],
  ];
  const name = p.name || ru.leaders.player;
  return `${header(ru.profile.title)}<div class="scroll profile-screen">
    <div class="profile-stage"><canvas id="profileHero" aria-hidden="true"></canvas></div>
    <h2 class="profile-name">${esc(name)}${p.crown ? ` <span class="leader-badge">${ru.profile.leader}</span>` : ''}</h2>
    <dl class="ward-stats stagger">${rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
    ${p.link ? `<button class="secondary" data-action="openVkProfile" data-arg="${p.id}">${ru.profile.openVk}</button>` : `<p class="muted small">${ru.profileChoice.hidden}</p>`}
  </div>`;
}

export function playerCardView(u: ChatUser, mine: boolean): string {
  const name = u.name || ru.leaders.player;
  const img = u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer" />` : `<b>${esc(name.slice(0, 1))}</b>`;
  return `<div class="panel invite">
    <button class="icon-btn close" data-action="back" aria-label="${ru.chat.close}">${CLOSE_ICON}</button>
    <div class="invite-ava">${img}</div>
    <h2>${esc(name)}</h2>
    <p>${mine ? ru.chat.you : ru.chat.rank(u.rank)}</p>
    ${mine ? '' : `<button class="primary" data-action="challenge" data-arg="${u.id}">${ru.chat.duelBtn}</button>`}
    <button class="secondary" data-action="profile" data-arg="${u.id}">${ru.chat.profileBtn}</button>
  </div>`;
}
