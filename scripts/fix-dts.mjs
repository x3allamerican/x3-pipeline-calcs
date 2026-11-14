// tsc keeps "./x.ts" in .d.ts imports; point them at the built .js files.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
for (const f of readdirSync('dist')) {
  if (!f.endsWith('.d.ts')) continue;
  const p = `dist/${f}`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}
