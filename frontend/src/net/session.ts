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

export type Slot = 'head' | 'torso' | 'arms' | 'legs' | 'feet';
export type Loadout = Partial<Record<Slot, string>>;

export interface CatalogItem {
  id: string;
  slot: Slot;
  set: string;
  /** Best single-run score that opens it, or null. */
  record: number | null;
  /** Price in coins, or null when it is not for sale. */
  price: number | null;
  drop: boolean;
}

/** Coins, owned cosmetics, what is worn, and the catalog of rules (all from the server). */
export interface ShopState {
  coins: number;
  owned: string[];
  loadout: Loadout;
  catalog: CatalogItem[];
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
