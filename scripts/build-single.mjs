// Inlines the Vite build into single-file versions of the game. Run after `vite build`.
//   index.html          full page at the repo root: open it directly or serve it anywhere
//   dist/cardsade.html  bare fragment for publishing as a hosted page
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const html = readFileSync(join(dist, 'dev.html'), 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`Missing asset for ${re}`);
  return readFileSync(join(dist, m[1]), 'utf8');
};
const js = asset(/<script[^>]*src="\.?\/?([^"]+\.js)"/).replace(/<\/script/gi, '<\\/script');
const css = asset(/<link[^>]*href="\.?\/?([^"]+\.css)"/);
// Carry over the Google Fonts tags from dev.html as they are.
const fontLinks = (html.match(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g) ?? []).join('\n');

const body = `<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;

const page = `<!doctype html>
<!-- Built file: edit src/ and dev.html, then run \`npm run build\` to regenerate. -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Cardsade</title>
${fontLinks}
</head>
<body>
${body}</body>
</html>
`;
writeFileSync(join(root, 'index.html'), page);

const fragment = `<title>Cardsade</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fontLinks}
${body}`;
writeFileSync(join(dist, 'cardsade.html'), fragment);

const kb = (s) => `${(s.length / 1024).toFixed(0)} KB`;
console.log(`Wrote index.html (${kb(page)}) and dist/cardsade.html (${kb(fragment)})`);
