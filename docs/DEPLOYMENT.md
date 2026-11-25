# Mosaika Deployment & Release Guide

Mosaika ships as **three coordinated surfaces** built from a single monorepo:
1. **Mosaika Web Studio** (`apps/mosaika-web`) — static SPA served at `/`
2. **Mosaika Office.js Add-in** (`hosts/office-js`) — static HTTPS add-in for PowerPoint Web, Mac & M365 served at `/office-js/`
3. **Mosaika Windows PowerPoint VSTO Installer** (`hosts/windows-vsto`) — per-user `MosaikaSetup-x.y.z.exe` (zero UAC required)

---

## 1. Fastest Free HTTPS Deploy (GitHub Pages + CI)

Push this repository to GitHub and enable Pages (**Settings → Pages → Source: GitHub Actions**):

```bash
git remote add origin https://github.com/<your-username>/mosaika.git
git push -u origin master
```

What happens automatically:
- **`.github/workflows/ci.yml`** runs all TypeScript builds, `49+` Vitest tests, Rule 1 purity checks, and `17` Windows `.NET Framework 4.8` xUnit tests on every push/PR.
- **`.github/workflows/deploy-pages.yml`** runs `pnpm build:site`, automatically rewrites `manifest.xml` to your live GitHub Pages HTTPS URL, and deploys:
  - **Web Studio:** `https://<your-username>.github.io/<repo>/`
  - **Office.js Add-in:** `https://<your-username>.github.io/<repo>/office-js/taskpane.html`
  - **Live Sideload Manifest:** `https://<your-username>.github.io/<repo>/office-js/manifest.xml`

---

## 2. Alternative Static Hosts (Cloudflare Pages, Netlify, Vercel)

Zero extra configuration is needed — all three use the unified `pnpm build:site` output (`dist-site/`):

| Provider | Build Command | Output Directory | Config File |
| :--- | :--- | :--- | :--- |
| **Cloudflare Pages** | `pnpm build:site` | `dist-site` | Auto-generated `dist-site/_headers` |
| **Netlify** | `pnpm build:site` | `dist-site` | `netlify.toml` |
| **Vercel** | `pnpm build:site` | `dist-site` | `vercel.json` |

> Set `MOSAIKA_PUBLIC_URL=https://your-custom-domain.com` in your host's environment variables if you attach a custom domain so `dist-site/office-js/manifest.xml` points directly to it.

---

## 3. Sideloading Mosaika into PowerPoint for Web / Mac / M365

1. Download `manifest.xml` from `https://<your-live-domain>/office-js/manifest.xml`.
2. In **PowerPoint for the Web** (office.com): open any presentation → **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in** → upload `manifest.xml`.
3. Click **Mosaika** on the Home ribbon tab.

---

## 4. Publishing a Windows Installer Release (`MosaikaSetup-x.y.z.exe`)

Tag any commit on `master` and push the tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

**`.github/workflows/release-vsto.yml`** automatically compiles the Release `.NET Framework 4.8` VSTO add-in, runs all xUnit tests, packages `MosaikaSetup-0.1.0.exe` via Inno Setup 6, and attaches both the `.exe` installer and production `manifest.xml` to a new GitHub Release.
