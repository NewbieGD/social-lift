// Small DOM helpers.

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for safe insertion into HTML (names from VK, server data). */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
