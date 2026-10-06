// Writes docs/RULES_TEXT.md from the in-game rules (npx tsx tools/gen-rules.ts).
import { writeFileSync } from 'node:fs';
import { ru } from '../src/i18n/ru';

const md = [`# ${ru.rules.title}`, '', '_Текст экрана «Правила игры». Источник: frontend/src/i18n/ru.ts._', ''];
for (const s of ru.rules.sections) {
  md.push(`## ${s.h}`, '', ...s.p.flatMap((p) => [p, '']));
}
writeFileSync(new URL('../../docs/RULES_TEXT.md', import.meta.url), md.join('\n'));
