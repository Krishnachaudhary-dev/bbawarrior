/**
 * One-shot font vendoring: downloads the latin subsets of Inter and Outfit from
 * Google Fonts, stores them under public/fonts/, and writes the matching
 * @font-face rules (with local URLs) into src/organizer.css. After this the
 * page loads no stylesheet from any third party.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap';
/* A current browser UA is required: Google serves woff2 only to UA strings it
   recognises, and plain curl gets legacy formats. */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const cssRes = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) {
  console.error('fonts: Google Fonts responded ' + cssRes.status);
  process.exit(1);
}
const css = await cssRes.text();

const blockRe = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
const faces = [];
let match;
while ((match = blockRe.exec(css))) {
  const subset = match[1];
  const block = match[2];
  if (subset !== 'latin') continue;
  const family = (block.match(/font-family:\s*'([^']+)'/) || [])[1];
  const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1];
  const url = (block.match(/url\((https:[^)]+)\)/) || [])[1];
  if (!family || !weight || !url) continue;
  faces.push({ family, weight, url, block });
}

if (faces.length !== 7) {
  console.error('fonts: expected 7 latin faces, got ' + faces.length);
  process.exit(1);
}

mkdirSync('public/fonts', { recursive: true });

const parts = [];
for (const face of faces) {
  const name = face.family.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + face.weight + '-latin.woff2';
  const path = 'public/fonts/' + name;
  if (!existsSync(path)) {
    const res = await fetch(face.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      console.error('fonts: download failed for ' + face.family + ' ' + face.weight + ': ' + res.status);
      process.exit(1);
    }
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const localBlock = face.block.replace(/url\(https:[^)]+\)/, 'url(/fonts/' + name + ')');
  parts.push('/* ' + face.family + ' ' + face.weight + ', latin, self hosted */\n' + localBlock);
}

const cssPath = 'src/organizer.css';
let appCss = readFileSync(cssPath, 'utf8');
appCss = appCss.replace(/\s*\/\* self hosted fonts \*\/[\s\S]*$/, '');
appCss = appCss.trimEnd() + '\n\n/* self hosted fonts */\n' + parts.join('\n\n') + '\n';
writeFileSync(cssPath, appCss);

console.log('fonts: ' + faces.length + ' faces vendored into public/fonts + src/organizer.css');
