// Purchases for VK votes. The game only names the product: the price and what is given are set
// on the server, which confirms the order to VK (see backend/app/services/payments.py).
import bridge from '@vkontakte/vk-bridge';
import { isInVk, isIOS } from './vk';

type LooseBridge = { send: (method: string, params?: object) => Promise<unknown> };
const loose = bridge as unknown as LooseBridge;

/** Purchases exist inside VK, and not on iPhone (digital goods are not sold there). */
export function canPay(): boolean {
  return isInVk() && !isIOS();
}

export type PayResult = 'ok' | 'cancel' | 'error';

/** Opens the VK purchase window for a product. 'ok' means VK charged the votes. */
export async function buyWithVotes(product: string): Promise<PayResult> {
  if (!canPay()) return 'error';
  try {
    const res = (await loose.send('VKWebAppShowOrderBox', { type: 'item', item: product })) as { success?: boolean };
    return res?.success ? 'ok' : 'error';
  } catch (e) {
    const err = e as { error_data?: { error_code?: number; error_reason?: string } };
    const code = err?.error_data?.error_code;
    const reason = (err?.error_data?.error_reason ?? '').toLowerCase();
    // Closing the window or declining is not a failure.
    return code === 4 || reason.includes('denied') || reason.includes('cancel') || reason.includes('close') ? 'cancel' : 'error';
  }
}
