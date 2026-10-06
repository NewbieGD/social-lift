// Vibration only where the platform supports it (rule 2.3.6): VK Bridge in VK, Vibration API elsewhere.
import bridge from '@vkontakte/vk-bridge';
import { isInVk } from './vk';

type LooseBridge = {
  supportsAsync?: (method: string) => Promise<boolean>;
  send: (method: string, params?: object) => Promise<unknown>;
};
const loose = bridge as unknown as LooseBridge;

let supported = false;

export async function initHaptics(): Promise<void> {
  if (isInVk()) {
    try {
      supported = (await loose.supportsAsync?.('VKWebAppTapticImpactOccurred')) ?? false;
    } catch {
      supported = false;
    }
  } else {
    supported = typeof navigator.vibrate === 'function' && window.matchMedia('(pointer: coarse)').matches;
  }
}

export function hapticsSupported(): boolean {
  return supported;
}

export function haptic(kind: 'light' | 'heavy'): void {
  if (!supported) return;
  if (isInVk()) {
    loose.send('VKWebAppTapticImpactOccurred', { style: kind }).catch(() => undefined);
  } else {
    navigator.vibrate?.(kind === 'light' ? 12 : 45);
  }
}
