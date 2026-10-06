// Generates public pages for the VK developer panel (terms, privacy) and docs/RULES_TEXT.md
// from the in-game texts: npx tsx tools/gen-docs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { legal, ru, type DocSection } from '../src/i18n/ru';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const linkify = (s: string): string => esc(s).replace(/(https:\/\/vk\.ru\/[\w/-]+(?:\.[\w/-]+)*)/g, '<a href="$1">$1</a>');

function page(title: string, sections: DocSection[]): string {
  const body = sections
    .map((s) => `${s.h ? `<h2>${esc(s.h)}</h2>` : ''}${s.p.map((p) => `<p>${linkify(p)}</p>`).join('')}`)
    .join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>body{max-width:760px;margin:0 auto;padding:24px 18px 48px;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2430}h1{font-size:26px;line-height:1.2}h2{font-size:19px;margin-top:28px}a{color:#2257b8}</style>
</head><body><h1>${esc(title)}</h1>
${body}
</body></html>
`;
}

const root = new URL('../', import.meta.url);
mkdirSync(new URL('public/', root), { recursive: true });
writeFileSync(new URL('public/terms.html', root), page(legal.terms.title, legal.terms.sections));
writeFileSync(new URL('public/privacy.html', root), page(legal.privacy.title, legal.privacy.sections));

const md = [`# ${ru.rules.title}`, '', '_Текст экрана «Правила игры». Источник: frontend/src/i18n/ru.ts._', ''];
for (const s of ru.rules.sections) md.push(`## ${s.h}`, '', ...s.p.flatMap((p) => [p, '']));
writeFileSync(new URL('../docs/RULES_TEXT.md', root), md.join('\n'));
console.log('docs generated');
