/**
 * One-shot migration script (kept for the record, safe to re-run only on the
 * original layout): pulls the inline Babel app out of index.html into
 * src/organizer.jsx, moves the custom stylesheet into src/organizer.css behind
 * the real Tailwind directives, and rewrites the head so the page loads a
 * bundled module instead of CDN scripts (no Babel, no import map, no Tailwind
 * Play CDN).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');

const OPEN = '<script type="text/babel" data-type="module" data-presets="react">';
const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';
const STYLE_OPEN = '<style>';
const STYLE_CLOSE = '</style>';

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function assert(cond, message) {
  if (!cond) {
    console.error('extract: ' + message);
    process.exit(1);
  }
}

assert(count(html, OPEN) === 1, 'expected exactly one inline app script, found ' + count(html, OPEN));
assert(count(html, TAILWIND_CDN) === 1, 'expected exactly one Tailwind CDN tag');
assert(count(html, STYLE_OPEN) === 1, 'expected exactly one style block');

const cdnIdx = html.indexOf(TAILWIND_CDN);
const styleStart = html.indexOf(STYLE_OPEN, cdnIdx);
const styleEnd = html.indexOf(STYLE_CLOSE, styleStart) + STYLE_CLOSE.length;
assert(styleStart > 0 && styleEnd > styleStart, 'style block not found after the CDN tag');
const styleBlock = html.slice(styleStart, styleEnd);

const openIdx = html.indexOf(OPEN);
const bodyEnd = html.indexOf('</body>');
const closeIdx = html.lastIndexOf('</script>', bodyEnd);
assert(openIdx > 0 && closeIdx > openIdx, 'app script boundaries not found');

const appCode = html.slice(openIdx + OPEN.length, closeIdx);
assert(!appCode.includes('</script'), 'app source unexpectedly contains a script close tag');
assert(appCode.includes('createRoot'), 'app source does not look like the app');

/* Everything before the CDN tag: doctype, meta, favicon, Google Fonts link. */
const head = html.slice(0, cdnIdx);

const newHtml =
  head +
  '<link rel="stylesheet" href="/src/organizer.css" />\n' +
  '</head>\n\n' +
  '<body>\n' +
  '  <div id="root"></div>\n\n' +
  '  <script type="module" src="/src/organizer.jsx"></script>\n' +
  '</body>\n' +
  '</html>\n';

const styleRules = styleBlock.slice(STYLE_OPEN.length, -STYLE_CLOSE.length).replace(/^\r?\n/, '');
const css = [
  '@tailwind base;',
  '@tailwind components;',
  '@tailwind utilities;',
  '',
  styleRules.trimEnd(),
  '',
].join('\n');

function crlf(text) {
  return text.replace(/\r?\n/g, '\r\n');
}

writeFileSync('src/organizer.jsx', crlf(appCode.replace(/^\r?\n/, '')));
writeFileSync('src/organizer.css', crlf(css));
writeFileSync('index.html', crlf(newHtml));

console.log('extract: organizer.jsx', appCode.split('\n').length, 'lines');
console.log('extract: organizer.css', css.split('\n').length, 'lines');
console.log('extract: index.html', newHtml.split('\n').length, 'lines');
