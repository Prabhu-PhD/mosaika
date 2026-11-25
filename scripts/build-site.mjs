#!/usr/bin/env node
/**
 * Assembles the unified static HTTPS deployment directory (`dist-site/`):
 *   - `/`           -> Mosaika Web Studio (`apps/mosaika-web`)
 *   - `/office-js/` -> Cross-Platform Office.js PowerPoint Add-in (`hosts/office-js`)
 *   - `/office-js/manifest.xml` -> Production manifest rewritten to the live HTTPS URL
 *
 * Set `MOSAIKA_PUBLIC_URL` (e.g. "https://mosaika.pages.dev" or "https://user.github.io/project-bento")
 * to automatically bake the production HTTPS URL into `dist-site/office-js/manifest.xml`.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-site');

function resolvePublicBaseUrl() {
  const explicit = process.env.MOSAIKA_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (process.env.CF_PAGES_URL) return process.env.CF_PAGES_URL.replace(/\/+$/, '');
  if (process.env.DEPLOY_PRIME_URL) return process.env.DEPLOY_PRIME_URL.replace(/\/+$/, '');
  if (process.env.URL && process.env.URL.startsWith('http')) {
    return process.env.URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }
  return 'https://mosaika.app';
}

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Build shared libraries + Web Studio + Office.js add-in
run('pnpm --filter @bento/contract build');
run('pnpm --filter @bento/core build');
run('pnpm --filter @bento/ui build');
run('pnpm --filter @mosaika/web build');
run('pnpm --filter @bento/office-js build');

// 2. Assemble clean dist-site/
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const webDist = path.join(rootDir, 'apps', 'mosaika-web', 'dist');
const officeDist = path.join(rootDir, 'hosts', 'office-js', 'dist');
const officeOut = path.join(outDir, 'office-js');

copyDirRecursive(webDist, outDir);
copyDirRecursive(officeDist, officeOut);

// 3. Rewrite Office.js manifest.xml with live HTTPS origin
const publicBaseUrl = resolvePublicBaseUrl();
const officeBaseUrl = `${publicBaseUrl}/office-js`;
const manifestSrc = path.join(rootDir, 'hosts', 'office-js', 'manifest.xml');
const rawManifest = fs.readFileSync(manifestSrc, 'utf8');
const prodManifest = rawManifest.replaceAll('https://localhost:3100', officeBaseUrl);

if (prodManifest.includes('localhost:3100')) {
  throw new Error('Failed to rewrite all localhost:3100 URLs in manifest.xml');
}
fs.writeFileSync(path.join(officeOut, 'manifest.xml'), prodManifest, 'utf8');

// 4. Write Cloudflare Pages / Netlify `_headers` and GitHub Pages `.nojekyll`
const headersContent = `# Immutable Vite hashed assets
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/office-js/assets/*
  Cache-Control: public, max-age=31536000, immutable

# Office.js Add-in requires embedding inside Microsoft PowerPoint (Web, Mac, M365)
/office-js/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Access-Control-Allow-Origin: *
`;
fs.writeFileSync(path.join(outDir, '_headers'), headersContent, 'utf8');
fs.writeFileSync(path.join(outDir, '.nojekyll'), '', 'utf8');

console.log(`\nBuilt unified Mosaika site successfully -> ${outDir}`);
console.log(`  Web Studio:       ${publicBaseUrl}/`);
console.log(`  Office.js Add-in: ${officeBaseUrl}/taskpane.html`);
console.log(`  Office Manifest:  ${officeBaseUrl}/manifest.xml`);
