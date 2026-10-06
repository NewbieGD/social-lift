// Sharing a result on the VK wall or in a story. No rewards for sharing (rule 2.6.2);
// the buttons are shown only where the platform supports the method (rule 2.3.6).
import bridge from '@vkontakte/vk-bridge';
import { isInVk, launchParamsRaw } from './vk';

type LooseBridge = {
  supportsAsync?: (method: string) => Promise<boolean>;
  send: (method: string, params?: object) => Promise<unknown>;
};
const loose = bridge as unknown as LooseBridge;

const support = { wall: false, story: false };

export async function initShare(): Promise<void> {
  if (!isInVk()) return;
  try {
    support.wall = (await loose.supportsAsync?.('VKWebAppShowWallPostBox')) ?? false;
    support.story = (await loose.supportsAsync?.('VKWebAppShowStoryBox')) ?? false;
  } catch {
    /* keep both off */
  }
}

export function canShare(): { wall: boolean; story: boolean } {
  return support;
}

export function appLink(): string {
  const id = new URLSearchParams(launchParamsRaw()).get('vk_app_id');
  return id ? `https://vk.com/app${id}` : '';
}

export async function shareWall(message: string): Promise<boolean> {
  try {
    const link = appLink();
    await loose.send('VKWebAppShowWallPostBox', link ? { message, attachments: link } : { message });
    return true;
  } catch {
    return false;
  }
}

export async function shareStory(imageDataUrl: string): Promise<boolean> {
  try {
    const link = appLink();
    await loose.send('VKWebAppShowStoryBox', {
      background_type: 'image',
      blob: imageDataUrl,
      ...(link ? { attachment: { text: 'go_to', type: 'url', url: link } } : {}),
    });
    return true;
  } catch {
    return false;
  }
}
