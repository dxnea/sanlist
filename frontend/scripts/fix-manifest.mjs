import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const manifestPath = join(distDir, 'manifest.json');
const swPath = join(distDir, 'sw.js');

const base = '/sanlist/';

// Fix manifest.json
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
manifest.start_url = base;
manifest.icons = manifest.icons.map(icon => ({
  ...icon,
  src: icon.src.startsWith('/') ? base + icon.src.slice(1) : icon.src,
}));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest.json updated for GitHub Pages');

// Fix sw.js asset paths
let swContent = readFileSync(swPath, 'utf-8');
// Replace asset paths like '/assets/...' with '/sanlist/assets/...'
swContent = swContent.replace(/"\/(assets|favicon|icon|icons|index|manifest|_redirects)/g, `"${base}$1`);
writeFileSync(swPath, swContent, 'utf-8');
console.log('sw.js paths updated for GitHub Pages');
