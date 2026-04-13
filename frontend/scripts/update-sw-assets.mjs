/**
 * После сборки Vite находит все файлы в dist/ и обновляет sw.js,
 * чтобы service worker кэшировал их при установке.
 * Это позволяет приложению работать полностью офлайн после первого визита.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const swPath = join(distDir, 'sw.js');

// Рекурсивно собираем все файлы из dist/
function collectFiles(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      // Пропускаем sw.js — он сам себя не кэширует
      if (entry.name === 'sw.js') continue;
      const rel = relative(base, fullPath).replace(/\\/g, '/');
      files.push('/' + rel);
    }
  }
  return files;
}

const assets = collectFiles(distDir);
console.log('Assets to cache:', assets);

// Заменяем placeholder в sw.js
let swContent = readFileSync(swPath, 'utf-8');

// Нормализуем \r\n -> \n для надёжного поиска
const normalized = swContent.replace(/\r\n/g, '\n');
const multilinePlaceholder = `self.__ASSETS_TO_CACHE__ || [
  '/',
  '/index.html',
  '/favicon.svg',
]`;
const replacement = JSON.stringify(assets);

if (normalized.includes(multilinePlaceholder)) {
  const updated = normalized.replace(multilinePlaceholder, replacement);
  writeFileSync(swPath, updated, 'utf-8');
  console.log('sw.js updated with', assets.length, 'assets');
} else {
  console.warn('Warning: placeholder not found in sw.js, skipping auto-update');
  console.warn('Expected to find the multiline placeholder block');
}
