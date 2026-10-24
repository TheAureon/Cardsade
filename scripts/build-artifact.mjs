// Inlines the Vite build into one self-contained HTML fragment (dist/cardsade.html)
// that can be published as a single-file page. Run after `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`Missing asset for ${re}`);
  return readFileSync(join(dist, m[1]), 'utf8');
};
const js = asset(/<script[^>]*src="\.?\/?([^"]+\.js)"/).replace(/<\/script/gi, '<\\/script');
const css = asset(/<link[^>]*href="\.?\/?([^"]+\.css)"/);

const out = `<title>Cardsade</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
writeFileSync(join(dist, 'cardsade.html'), out);
console.log(`Wrote dist/cardsade.html (${(out.length / 1024).toFixed(0)} KB)`);
