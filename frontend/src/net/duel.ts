// Live duels: a WebSocket to the server for presence, invitations and the opponent's inputs.
import { API_BASE_URL } from '../config';
import { isInVk, launchParamsRaw } from '../platform/vk';

export interface DuelPlayer {
  id: number;
  name: string | null;
  photo: string | null;
  /** How the opponent looks: worn styles and the pet (shown on their screen in the duel). */
  look?: { loadout: Record<string, string>; pet: string | null } | null;
}

export interface ChatUser {
  id: number;
  name: string | null;
  photo: string | null;
  /** Place in the all-time leaderboard when the player entered the chat. */
  rank: number | null;
  /** The game may offer a link to this player's VK page. */
  link?: boolean;
  /** A post in the government: the mayor or an assistant. */
  role?: 'mayor' | 'assistant' | null;
}

export interface ChatMsg {
  id: number;
  ts: number;
  user: ChatUser;
  text: string;
  /** Local system line ("X joined"), never sent by the server. */
  sys?: boolean;
}

/** A duel that is running now (for the list of duels to watch). */
export interface SpecRow {
  id: string;
  a: { id: number; name: string | null; photo: string | null };
  b: { id: number; name: string | null; photo: string | null };
  elapsed: number;
  watchers: number;
}

export type DuelMsg =
  | { t: 'chat_hist'; msgs: ChatMsg[]; users: ChatUser[]; wait: number }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'chat_users'; users: ChatUser[] }
  | { t: 'chat_user'; action: 'join'; user: ChatUser }
  | { t: 'chat_err'; code: 'empty' | 'link' | 'words' | 'cooldown' | 'muted'; wait?: number }
  | { t: 'chat_remove'; id: number }
  | { t: 'report_ok' }
  | { t: 'chat_notice'; kind: string; user: ChatUser }
  | { t: 'chat_warned'; removed: boolean; text: string }
  | { t: 'report_err'; code: 'gone' | 'too_many' }
  | { t: 'stake_short'; need: number; have: number; who: 'me' | 'them'; name?: string | null }
  | { t: 'chat_cd'; wait: number }
  | { t: 'busy'; who: 'me' | 'them'; name?: string | null }
  | { t: 'online'; n: number }
  | { t: 'none'; n: number }
  | { t: 'waiting'; to: DuelPlayer; timeout: number }
  | { t: 'declined' }
  | { t: 'invite'; from: DuelPlayer; timeout: number; stake?: number }
  | { t: 'invite_cancel' }
  | {
      t: 'start';
      duel: string;
      seed: number;
      start_at: number;
      ticket: { run_id: string; seed: number; started_at: number; token: string };
      opponent: DuelPlayer;
      stake?: number;
    }
  | { t: 'inputs'; upto: number; log: number[][] }
  | { t: 'spec_list'; duels: SpecRow[] }
  | { t: 'spec_start'; duel: string; seed: number; elapsed_ms: number; players: DuelPlayer[]; logs: Record<string, number[][]>; scores: Record<string, number | null> }
  | { t: 'spec_inputs'; duel: string; uid: number; upto: number; log: number[][] }
  | { t: 'spec_dead'; duel: string; uid: number; score: number }
  | { t: 'spec_end'; duel: string; outcome: Record<string, 'win' | 'loss' | 'draw'> }
  | { t: 'spec_err'; code: string }
  | { t: 'opp_dead'; score: number }
  | { t: 'opp_left' }
  | { t: 'result'; duel: string; outcome: 'win' | 'loss' | 'draw'; coins?: number };

export class DuelClient {
  online = 0;
  connected = false;
  /** Why the last connection ended (to explain a missing chat/duels to the player). */
  lastClose: { code: number; reason: string; opened: boolean } | null = null;
  private opened = false;
  onMessage: (m: DuelMsg) => void = () => undefined;
  onStatus: () => void = () => undefined;
  private ws: WebSocket | null = null;
  private stopped = false;
  private retryTimer = 0;

  connect(): void {
    if (!isInVk() || this.ws) return;
    this.stopped = false;
    const url = `${API_BASE_URL.replace(/^http/, 'ws')}/api/duel/ws?p=${encodeURIComponent(launchParamsRaw())}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.opened = true;
      this.connected = true;
      this.onStatus();
    };
    ws.onmessage = (ev) => {
      let m: DuelMsg;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.t === 'online' || m.t === 'none') this.online = m.n;
      this.onMessage(m);
      this.onStatus();
    };
    ws.onclose = (ev) => {
      this.lastClose = { code: ev.code, reason: ev.reason, opened: this.opened };
      this.opened = false;
      console.warn('[duel] соединение закрыто', ev.code, ev.reason);
      this.ws = null;
      this.connected = false;
      this.onStatus();
      // 4401/4403: not allowed; 4409: replaced by another tab. Otherwise reconnect quietly.
      if (!this.stopped && ![4401, 4403, 4409].includes(ev.code)) {
        clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.connect(), 5000);
      }
    };
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
