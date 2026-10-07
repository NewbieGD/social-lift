// Server session: bootstrap, consent, runs (with prefetch and retry queue), settings sync.
// The server is the source of truth; localStorage is only a cache.
import { LEADERBOARD_CACHE_MS, RUN_START_TIMEOUT_MS } from '../config';
import { isInVk } from '../platform/vk';
import { api, ApiError } from './api';

export interface Stats {
  best_all: number;
  best_tier: number;
  best_week: number;
  last_score: number | null;
  total_runs: number;
  rank_all: number | null;
  rank_week: number | null;
  last_tier?: number;
  best_combo?: number;
  total_captures?: number;
  items_mask?: number;
  item_misses?: number[];
  duel_wins?: number;
  /** The player holds the crown of the weekly leader. */
  crown?: boolean;
}

export type Slot = 'head' | 'torso' | 'arms' | 'legs' | 'feet' | 'torch';
export type Loadout = Partial<Record<Slot, string>>;

export interface CatalogItem {
  id: string;
  slot: Slot;
  set: string;
  /** Best single-run score that opens it, or null. */
  record: number | null;
  /** Duel wins in a row that open it, or null. */
  duel_streak: number | null;
  /** Price in coins, or null when it is not for sale. */
  price: number | null;
  drop: boolean;
  /** style | bg | prop | frame | fx | pet */
  kind: string;
  /** Premium: the product (sold for VK votes) this item belongs to, or "". */
  product: string;
}

/** Something sold for VK votes: all of its items come at once. */
export interface Product {
  id: string;
  title: string;
  votes: number;
  items: string[];
}

/** Coins, owned cosmetics, what is worn, and the catalog of rules (all from the server). */
/** An object standing on the main screen: where (0..1 of the stage) and how it is turned. */
export interface PropPlacement {
  id: string;
  x: number;
  y: number;
  /** 0 = standing, 90 / 270 = lying on its side. */
  r: 0 | 90 | 270;
}

/** The main-screen decoration chosen by the player (ids of owned items). */
export interface Decor {
  /** The chosen pet (pet_cat | pet_dog | pet_parrot). */
  pet?: string;
  bg?: string;
  frame?: string;
  fx?: string;
  props?: PropPlacement[];
}

export interface ShopState {
  coins: number;
  decor: Decor;
  owned: string[];
  loadout: Loadout;
  catalog: CatalogItem[];
  products?: Product[];
  duel_streak?: number;
  best_duel_streak?: number;
}

/** What other players see about a player: how they look, records, collection. */
export interface PublicProfile {
  id: number;
  name: string | null;
  photo: string | null;
  link: boolean;
  crown: boolean;
  stats: {
    best_all: number;
    best_tier: number;
    last_tier: number;
    rank_all: number | null;
    rank_week: number | null;
    duel_wins: number;
    total_runs: number;
    best_combo: number;
  };
  items_mask: number;
  loadout: Loadout;
  decor: Decor;
  styles_owned: number;
  styles_total: number;
  collection_owned: number;
  collection_total: number;
}

export interface CrownNotice {
  kind: 'won' | 'lost' | 'expired';
  name: string | null;
}

export interface CrownInfo {
  crown: boolean;
  holder: { id: number; name: string | null; photo: string | null } | null;
  notices: CrownNotice[];
}

export interface Bootstrap {
  profile: { id: number; name: string | null; photo: string | null };
  flags: { consent_ok: boolean; tutorial_done: boolean };
  terms_version: number;
  settings: Record<string, string | number | boolean>;
  settings_updated_at: number;
  stats: Stats;
  shop?: ShopState;
  /** Privacy choices of this player. */
  privacy?: { hide_vk_link: boolean };
  server_time: number;
  ads: Record<string, number | boolean>;
  crown?: CrownInfo;
}

export interface RunTicket {
  run_id: string;
  seed: number;
  started_at: number;
  token: string;
  items_mask?: number;
  item_misses?: number[];
  /** The cosmetic the server offers in this run (it may lie on a platform), or null. */
  drop?: string | null;
}

export interface RunReport {
  run_id: string;
  token: string;
  score: number;
  duration_ms: number;
  tier: number;
  captures: number;
  max_combo: number;
  input_log: number[][];
  items: number;
  /** The offered cosmetic was picked up from a platform. */
  drop_found?: boolean;
}

export interface FinishResult {
  run_id: string;
  status: 'finished' | 'rejected';
  reason: string | null;
  score: number;
  best_all: number;
  best_tier: number;
  best_week: number;
  is_record: boolean;
  is_week_record: boolean;
  rank_all: number | null;
  rank_week: number | null;
  prev_rank_all: number | null;
  prev_rank_week: number | null;
  duel?: { status: 'pending' | 'done'; outcome?: Record<string, 'win' | 'loss' | 'draw'> } | null;
  /** Coins paid for this run, the new balance, and cosmetics this run opened. */
  coins?: number;
  coins_earned?: number;
  new_items?: string[];
}

export interface LeaderRow {
  rank: number;
  user_id: number;
  name: string | null;
  photo: string | null;
  deactivated: boolean;
  /** The game may offer a link to this player's VK page (false when they hid it). */
  link?: boolean;
  score: number;
}

export interface Leaderboard {
  scope: 'week' | 'all' | 'duels';
  week_id: string;
  reset_at: number;
  server_time: number;
  rows: LeaderRow[];
  me: { score: number; rank: number | null; next_rank: number | null; gap_to_next: number | null };
}

export type Mode = 'loading' | 'online' | 'offline' | 'outside';

const QUEUE_KEY = 'sl_pending_runs';
const MAX_QUEUE = 10;

export class Session {
  mode: Mode = 'loading';
  data: Bootstrap | null = null;
  /** Short code of the last bootstrap failure, shown on the error screen for support. */
  lastError: { code: string; status: number } | null = null;
  private prefetched: RunTicket | null = null;
  private prefetching: Promise<RunTicket | null> | null = null;

  private lbCache = new Map<string, { at: number; data: Leaderboard }>();

  get ranked(): boolean {
    return this.mode === 'online' && !!this.data?.flags.consent_ok;
  }

  async bootstrap(): Promise<void> {
    if (!isInVk()) {
      this.mode = 'outside';
      return;
    }
    this.mode = 'loading';
    try {
      this.data = await api<Bootstrap>('POST', '/session/bootstrap');
      this.mode = 'online';
      this.lastError = null;
      void this.flushQueue();
    } catch (e) {
      this.mode = 'offline';
      this.lastError = e instanceof ApiError ? { code: e.code, status: e.status } : { code: 'unknown', status: 0 };
    }
  }

  async acceptConsent(): Promise<void> {
    if (!this.data) return;
    await api('POST', '/consent', { version: this.data.terms_version });
    this.data.flags.consent_ok = true;
  }

  /** Returns a server ticket, or null to play an unranked run. */
  /** Why the last run had to start without a server ticket (shown to the player). */
  ticketError: 'outside' | 'offline' | 'consent' | 'network' | 'timeout' | 'restart' | 'limit' | 'auth' | 'server' | null = null;

  async takeTicket(): Promise<RunTicket | null> {
    this.ticketError = null;
    if (!this.ranked) {
      this.ticketError = this.mode === 'outside' ? 'outside' : this.mode === 'offline' ? 'offline' : 'consent';
      return null;
    }
    if (this.prefetched) {
      const t = this.prefetched;
      this.prefetched = null;
      return t;
    }
    if (this.prefetching) {
      const t = await this.prefetching;
      this.prefetched = null;
      if (t) return t;
    }
    return this.requestTicket();
  }

  /** While the player looks at the results, fetch the next ticket in advance. */
  prefetch(): void {
    if (!this.ranked || this.prefetched || this.prefetching) return;
    this.prefetching = this.requestTicket().then((t) => {
      this.prefetched = t;
      this.prefetching = null;
      return t;
    });
  }

  /** Asks the server for a run ticket, retrying briefly (e.g. while the server restarts). */
  private async requestTicket(): Promise<RunTicket | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const t = await api<RunTicket>('POST', '/runs/start', undefined, RUN_START_TIMEOUT_MS);
        this.ticketError = null;
        return t;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, 'network');
        this.ticketError =
          err.status === 0
            ? err.code === 'timeout'
              ? 'timeout'
              : 'network'
            : err.status === 429
              ? 'limit'
              : err.status === 401
                ? 'auth'
                : err.status === 403
                  ? 'consent'
                  : err.status === 502 || err.status === 503 || err.status === 504
                    ? 'restart'
                    : 'server';
        if (err.status && err.status < 500 && err.status !== 429) break;
        await new Promise((r) => setTimeout(r, 900));
      }
    }
    return null;
  }

  private lastReport: RunReport | null = null;

  async finish(report: RunReport): Promise<FinishResult | null> {
    this.lastReport = report;
    try {
      const res = await api<FinishResult>('POST', '/runs/finish', report);
      this.applyResult(res);
      return res;
    } catch (e) {
      // Only network trouble is worth retrying; a rejected request will not change.
      if (e instanceof ApiError && (e.offline || e.status >= 500 || e.status === 429)) this.enqueue(report);
      return null;
    }
  }

  async leaderboard(scope: 'week' | 'all' | 'duels', force = false): Promise<Leaderboard> {
    const hit = this.lbCache.get(scope);
    if (!force && hit && Date.now() - hit.at < LEADERBOARD_CACHE_MS) return hit.data;
    const data = await api<Leaderboard>('GET', `/leaderboard?scope=${scope}`);
    this.lbCache.set(scope, { at: Date.now(), data });
    return data;
  }

  /** Who wears the weekly crown now, plus my pending crown messages. Updates my own flag. */
  async syncCrown(): Promise<CrownInfo | null> {
    if (this.mode !== 'online' || !this.data) return null;
    try {
      const info = await api<CrownInfo>('GET', '/crown');
      this.data.stats.crown = info.crown;
      return info;
    } catch {
      return null;
    }
  }

  /** Anonymous funnel event; failures are ignored. */
  event(type: 'tutorial_start' | 'tutorial_end' | 'run_start' | 'run_end' | 'tier_reached' | 'ad_shown' | 'settings_changed', value?: number): void {
    if (this.mode !== 'online') return;
    api('POST', '/events', value === undefined ? { type } : { type, value }).catch(() => undefined);
  }

  async completeTutorial(): Promise<void> {
    if (this.data) this.data.flags.tutorial_done = true;
    if (this.mode !== 'online') return;
    try {
      await api('POST', '/tutorial/complete');
    } catch {
      /* local flag is enough until the next bootstrap */
    }
  }

  async deleteMe(): Promise<void> {
    await api('DELETE', '/me');
    this.data = null;
    this.prefetched = null;
    this.lbCache.clear();
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
  }

  async saveSettings(settings: Record<string, string | number | boolean>, updated_at: number): Promise<void> {
    if (this.mode !== 'online') return;
    try {
      await api('PUT', '/settings', { settings, updated_at });
      if (this.data) {
        this.data.settings = settings;
        this.data.settings_updated_at = updated_at;
      }
    } catch {
      /* keep local value; next change will sync */
    }
  }

  private applyResult(r: FinishResult): void {
    if (!this.data || r.status !== 'finished') return;
    this.lbCache.clear();
    const s = this.data.stats;
    s.best_all = r.best_all;
    s.best_tier = r.best_tier;
    s.best_week = r.best_week;
    s.last_score = r.score;
    s.rank_all = r.rank_all;
    s.rank_week = r.rank_week;
    s.total_runs += 1;
    s.last_tier = this.lastReport?.tier ?? s.last_tier;
    s.best_combo = Math.max(s.best_combo ?? 0, Math.min(this.lastReport?.max_combo ?? 0, this.lastReport?.captures ?? 0));
    s.total_captures = (s.total_captures ?? 0) + (this.lastReport?.captures ?? 0);
    if (this.lastReport) {
      s.items_mask = (s.items_mask ?? 0) | this.lastReport.items;
    }
    const shop = this.data.shop;
    if (shop) {
      if (typeof r.coins === 'number') shop.coins = r.coins;
      for (const id of r.new_items ?? []) if (!shop.owned.includes(id)) shop.owned.push(id);
    }
  }

  /** The in-game profile of another player (null when it is not available). */
  async fetchPlayer(id: number): Promise<PublicProfile | null> {
    try {
      return await api<PublicProfile>('GET', `/players/${id}`);
    } catch {
      return null;
    }
  }

  /** Hides (or shows) the link to this player's VK page for other players. */
  async setHideLink(hide: boolean): Promise<boolean | null> {
    if (!this.data) return null;
    try {
      const res = await api<{ hide_vk_link: boolean }>('PUT', '/privacy', { hide_vk_link: hide });
      this.data.privacy = { hide_vk_link: res.hide_vk_link };
      return res.hide_vk_link;
    } catch {
      return null;
    }
  }

  /** Reloads coins, owned cosmetics and the loadout from the server. */
  async refreshShop(): Promise<ShopState | null> {
    if (!this.data) return null;
    try {
      const shop = await api<ShopState>('GET', '/shop');
      this.data.shop = shop;
      return shop;
    } catch {
      return null;
    }
  }

  /** Wears or takes off cosmetics ({slot: id | null}). Returns the loadout the server saved. */
  async setLoadout(change: Partial<Record<Slot, string | null>>): Promise<Loadout | null> {
    if (!this.data?.shop) return null;
    try {
      const res = await api<{ loadout: Loadout }>('PUT', '/loadout', { loadout: change });
      this.data.shop.loadout = res.loadout;
      return res.loadout;
    } catch {
      return null;
    }
  }

  /** Changes the main-screen decoration; a null clears a place. Returns what the server saved. */
  async setDecor(change: { pet?: string | null; bg?: string | null; frame?: string | null; fx?: string | null; props?: PropPlacement[] }): Promise<Decor | null> {
    if (!this.data?.shop) return null;
    try {
      const res = await api<{ decor: Decor }>('PUT', '/decor', { decor: change });
      this.data.shop.decor = res.decor;
      return res.decor;
    } catch {
      return null;
    }
  }

  /** Buys an item for coins. Returns the new state, or the error code. */
  async buy(itemId: string): Promise<{ ok: true; shop: ShopState } | { ok: false; code: string }> {
    if (!this.data) return { ok: false, code: 'offline' };
    try {
      const shop = await api<ShopState>('POST', '/shop/buy', { item_id: itemId });
      this.data.shop = shop;
      return { ok: true, shop };
    } catch (e) {
      return { ok: false, code: e instanceof ApiError ? e.code : 'network' };
    }
  }

  private enqueue(report: RunReport): void {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as RunReport[];
      // Keep the queue small: long input logs are dropped from queued copies.
      const slim = JSON.stringify(report).length > 60_000 ? { ...report, input_log: [] } : report;
      q.push(slim);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
    } catch {
      /* storage unavailable */
    }
  }

  private async flushQueue(): Promise<void> {
    let q: RunReport[];
    try {
      q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as RunReport[];
    } catch {
      return;
    }
    if (!q.length) return;
    const left: RunReport[] = [];
    for (const report of q) {
      try {
        const res = await api<FinishResult>('POST', '/runs/finish', report);
        this.lastReport = report;
        this.applyResult(res);
      } catch (e) {
        if (e instanceof ApiError && (e.offline || e.status >= 500 || e.status === 429)) left.push(report);
      }
    }
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
    } catch {
      /* ignore */
    }
  }
}

/** Same rule as the server: add picked items, count a miss for every reached tier still missing. */
export function applyCollection(mask: number, misses: number[], picked: number, tier: number): { mask: number; misses: number[] } {
  const next = mask | picked;
  const m = Array.from({ length: 13 }, (_, i) => misses[i] ?? 0);
  for (let i = 0; i <= Math.min(tier, 12); i++) m[i] = next & (1 << i) ? 0 : m[i] + 1;
  return { mask: next, misses: m };
}
