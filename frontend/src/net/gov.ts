// The government API: the weekly election of the mayor, his assistants, the bell.
import { api, ApiError } from './api';

export interface GovPlayer {
  id: number;
  name: string | null;
  photo: string | null;
  status?: 'invited' | 'accepted';
}

export interface GovEligibility {
  phase: 'candidacy' | 'voting';
  wins: { have: number; need: number };
  record: { have: number; need: number };
  ring: boolean;
  is_candidate: boolean;
  can_apply: boolean;
  /** conditions | voting | was_mayor | already | null */
  reason: string | null;
}

export interface GovState {
  week: string;
  phase: 'candidacy' | 'voting';
  voting_opens_at: number;
  ends_at: number;
  mayor: GovPlayer | null;
  assistants: GovPlayer[];
  candidates: GovPlayer[];
  me: {
    role: 'mayor' | 'assistant' | null;
    eligibility: GovEligibility;
    my_vote: number | null;
    can_vote: boolean;
    runs: number;
    vote_need_runs: number;
    invited: boolean;
  };
  settings: { bonus_on: boolean; play_color: string; colors: string[] };
  bonus_active: boolean;
  bonus_percent: number;
}

export interface Notice {
  id: number;
  kind: string;
  payload: { user?: GovPlayer | null; from?: GovPlayer | null; accepted?: boolean };
  at: number;
  unread: boolean;
  personal: boolean;
}

export type GovResult = { ok: true; state: GovState } | { ok: false; code: string };

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<GovResult> {
  try {
    const state = await api<GovState>(method, path, body);
    // Anything that is not a state (a broken answer) counts as a failure.
    if (!state || typeof state !== 'object' || !('me' in state)) return { ok: false, code: 'network' };
    return { ok: true, state };
  } catch (e) {
    return { ok: false, code: e instanceof ApiError ? e.code : 'network' };
  }
}

export const gov = {
  state: (): Promise<GovResult> => call('GET', '/gov/state'),
  apply: (): Promise<GovResult> => call('POST', '/gov/apply'),
  vote: (candidateId: number): Promise<GovResult> => call('POST', '/gov/vote', { candidate_id: candidateId }),
  invite: (userId: number): Promise<GovResult> => call('POST', '/gov/assistants', { user_id: userId }),
  remove: (userId: number): Promise<GovResult> => call('DELETE', `/gov/assistants/${userId}`),
  respond: (accept: boolean): Promise<GovResult> => call('POST', '/gov/respond', { accept }),
  settings: (s: { bonus?: boolean; play_color?: string }): Promise<GovResult> => call('PUT', '/gov/settings', s),
  async find(which: 'top' | 'chat' | 'rivals', q: string): Promise<GovPlayer[] | null> {
    try {
      return (await api<{ players: GovPlayer[] }>('GET', `/gov/find?which=${which}&q=${encodeURIComponent(q)}`)).players;
    } catch {
      return null;
    }
  },
  ping(): void {
    void api('POST', '/gov/ping').catch(() => undefined);
  },
  async notices(): Promise<{ items: Notice[]; unread: number } | null> {
    try {
      return await api<{ items: Notice[]; unread: number }>('GET', '/notifications');
    } catch {
      return null;
    }
  },
  async markRead(): Promise<void> {
    await api('POST', '/notifications/read').catch(() => undefined);
  },
};
