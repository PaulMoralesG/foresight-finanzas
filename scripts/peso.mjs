// ================================================================
// peso.mjs — cuánto pesa lo que llega al navegador
//   node scripts/peso.mjs        (después de `npx vite build`)
//
// Distingue dos cosas que `vite build` mezcla en su tabla final:
//   - la CARGA INICIAL: index.html y todo lo que importa de forma
//     estática, que es lo que el usuario espera antes de ver nada;
//   - los chunks bajo demanda, que solo se descargan al entrar en
//     la pantalla que los usa.
// El número que importa es el gzip, porque es lo que viaja por la red.
// ================================================================
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';

const DIST = 'dist';
if (!existsSync(DIST)) {
  console.error('No hay dist/. Corre primero: npx vite build');
  process.exit(1);
}

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
const gz = (p) => gzipSync(readFileSync(p)).length;

// ── Carga inicial: seguir los imports estáticos desde index.html ──
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const inicial = new Set();
const pendientes = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map((m) => m[1]);

while (pendientes.length) {
  const rel = pendientes.pop();
  if (inicial.has(rel)) continue;
  const p = join(DIST, rel);
  if (!existsSync(p) || statSync(p).isDirectory()) continue;
  inicial.add(rel);
  if (!rel.endsWith('.js')) continue;
  // `import "./x.js"` y `from "./x.js"` son estáticos; `import("./x.js")` no.
  const src = readFileSync(p, 'utf8');
  for (const m of src.matchAll(/(?:from|import)\s*"(\.\/[^"]+)"/g)) {
    pendientes.push('assets/' + basename(m[1]));
  }
}

let rawTotal = 0;
let gzTotal = 0;
console.log('\nCARGA INICIAL');
for (const rel of [...inicial].sort()) {
  const p = join(DIST, rel);
  const raw = statSync(p).size;
  const g = gz(p);
  rawTotal += raw;
  gzTotal += g;
  console.log(`  ${rel.padEnd(48)} ${kb(raw)}  gzip ${kb(g)}`);
}
console.log(`  ${'TOTAL'.padEnd(48)} ${kb(rawTotal)}  gzip ${kb(gzTotal)}`);

// ── Bajo demanda: el resto de los .js de assets/ ──
console.log('\nBAJO DEMANDA (solo al entrar en esa pantalla)');
let gzLazy = 0;
for (const f of readdirSync(join(DIST, 'assets')).sort()) {
  const rel = 'assets/' + f;
  if (inicial.has(rel) || !f.endsWith('.js')) continue;
  const p = join(DIST, rel);
  const g = gz(p);
  gzLazy += g;
  console.log(`  ${rel.padEnd(48)} ${kb(statSync(p).size)}  gzip ${kb(g)}`);
}

console.log(`\nResumen:  inicial ${kb(gzTotal)} gzip  |  diferido ${kb(gzLazy)} gzip`);
console.log(`Objetivo: inicial por debajo de 60 KB, sesión completa bajo 100 KB.\n`);
