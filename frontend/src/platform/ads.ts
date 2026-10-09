// VK ads only (rules 4.2.2, 5.1.2): an interstitial while the next run is loading.
// Rewarded ads are prepared as an interface but not used in the UI yet.
import bridge from '@vkontakte/vk-bridge';
import { isInVk } from './vk';

type LooseBridge = { send: (method: string, params?: object) => Promise<unknown> };
const loose = bridge as unknown as LooseBridge;

export interface AdsConfig {
  enabled: boolean;
  min_runs_before: number;
  every_n_runs: number;
  min_interval_sec: number;
  timeout_sec: number;
}

export const DEFAULT_ADS: AdsConfig = {
  enabled: false,
  min_runs_before: 2,
  every_n_runs: 3,
  min_interval_sec: 120,
  timeout_sec: 5,
};

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export interface AdService {
  /** True if VK has an ad to show right now (answers within `timeoutSec`, otherwise false). */
  check(timeoutSec: number): Promise<boolean>;
  /** Shows the ad. Resolves true if it was shown. Never rejects. */
  show(): Promise<boolean>;
  /** Resolves true if an ad was shown. Never rejects; silently false when unavailable. */
  showInterstitial(timeoutSec: number): Promise<boolean>;
  /** Reserved for a future rewarded ad with an explicit bonus (rule 5.1.5.1 "б"). Not shown in the UI. */
  showRewarded(): Promise<boolean>;
}

class VkAds implements AdService {
  async check(timeoutSec: number): Promise<boolean> {
    if (!isInVk()) return false;
    try {
      const check = (await withTimeout(
        loose.send('VKWebAppCheckNativeAds', { ad_format: 'interstitial' }),
        timeoutSec * 1000,
        { result: false },
      )) as { result?: boolean };
      return !!check?.result;
    } catch {
      return false;
    }
  }

  async show(): Promise<boolean> {
    try {
      // The ad itself can last up to ~30 s; a hard cap keeps the game from hanging.
      const shown = (await withTimeout(
        loose.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' }),
        60_000,
        { result: false },
      )) as { result?: boolean };
      return !!shown?.result;
    } catch {
      return false;
    }
  }

  async showInterstitial(timeoutSec: number): Promise<boolean> {
    return (await this.check(timeoutSec)) && (await this.show());
  }

  async showRewarded(): Promise<boolean> {
    return false;
  }
}

export const ads: AdService = new VkAds();
