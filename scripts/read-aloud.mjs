#!/usr/bin/env node
// Plays a screen-reader transcript through macOS speech, so anyone can hear a page the way the
// simulated reader describes it. Usage: npm run read-aloud -- <page-id> [section] [--print]
//   page-id: a transcript name, e.g. dream-home or workshop-recipe-dashboard-cook-modal-open
//   section: headings | landmarks | links | form | reading | tab (default: reading)
//   --print: print the lines instead of speaking them
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = 'tests/screen-reader/transcripts.spec.ts-snapshots';
const args = process.argv.slice(2);
const printOnly = args.includes('--print');
const [id, section = 'reading'] = args.filter((a) => a !== '--print');
const available = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => f.replace(/-screen-reader-chromium\.txt$/, '')) : [];

if (!id || !available.includes(id)) {
  console.error(`Usage: npm run read-aloud -- <page-id> [headings|landmarks|links|form|reading|tab]\nTranscripts: ${available.join(', ') || '(none yet: run npm test first)'}`);
  process.exit(1);
}

const text = fs.readFileSync(path.join(dir, `${id}-screen-reader-chromium.txt`), 'utf8');
const sections = text.split(/^## /m);
const chosen = sections.find((s) => s.toLowerCase().startsWith(section.toLowerCase()));
if (!chosen) {
  console.error(`No "${section}" section in ${id}. Sections: ${sections.slice(1).map((s) => s.split('\n')[0]).join('; ')}`);
  process.exit(1);
}

const lines = chosen
  .split('\n')
  .slice(1)
  .map((l) => l.replace(/^\s*(-|\d+\.)\s*/, '').replace(/⚠/g, 'warning,').trim())
  .filter(Boolean);

console.log(`${id}: ${chosen.split('\n')[0]} (${lines.length} lines)\n`);
if (printOnly || process.platform !== 'darwin') {
  console.log(lines.join('\n'));
  if (!printOnly) console.log('\nSpeech playback uses the macOS "say" command; on other systems the transcript is printed instead.');
  process.exit(0);
}
for (const line of lines) {
  console.log(line);
  execFileSync('say', ['-r', '230', line]);
}
