# PWA (Progressive Web App) Documentation

This document describes the offline architecture, asset caching strategy, home screen installation, and LAN HTTP vs HTTPS implications for the POS application.

---

## 1. PWA Manifest & App Identity
- **Manifest Location**: `src/app/manifest.ts` (served as `/manifest.webmanifest`).
- **Display Mode**: `standalone` (removes browser URL bar and back/forward chrome on tablets).
- **Orientation**: `any` (supports both 1024×768 landscape and 768×1024 portrait).
- **Theme Color**: `#4F46E5` (Primary Indigo).
- **Background Color**: `#F5F6FA` (Canvas background token).
- **App Icons**: Located in `public/icons/`:
  - `icon-192x192.png`: Standard home screen launcher.
  - `icon-512x512.png`: High-density tablet launcher & splash screen.
  - `icon-512x512-maskable.png`: Adaptive / circular icon container on modern Android tablets.
  - `apple-touch-icon.png`: 180×180 iOS Safari touch icon.

---

## 2. Service Worker Strategy (`public/sw.js`)

The service worker is registered via [`ServiceWorkerRegister`](file:///f:/29-oct-2026/Freelancher_01/src/components/layout/service-worker-register.tsx) with strict production and security guardrails:
- **Registration Rules**:
  - Activated ONLY in production builds (`process.env.NODE_ENV === "production"`).
  - Requires a secure context (`window.isSecureContext` or `localhost`/`127.0.0.1`).
  - Degrades silently on plain HTTP LAN connections without throwing errors.
- **Caching Policies**:
  1. **Precaching**: App shell static assets (`/`, `/offline`, icons, manifest).
  2. **Static Assets**: Next.js immutable bundles (`/_next/static/*`), fonts, and images are served via **stale-while-revalidate** caching.
  3. **Navigations**: Network-first with automatic fallback to `/offline` if the tablet disconnects from Wi-Fi.
  4. **Strict Exclusion**: All API endpoints (`/api/*`), mock network calls, auth tokens, reports, and mutation payloads are **never cached** by the service worker.
- **Update Flow**:
  - When a new deployment is ready, a non-intrusive toast notification prompts "New version available - Reload".
  - **Cart Safety Rule**: The reload prompt is strictly suppressed while the cart contains unsent draft items or a payment sheet is active to guarantee waiters never lose an in-progress ticket.

---

## 3. Local Area Network (LAN) & HTTPS Deployment Note

### 3.1 Plain HTTP vs Secure Context
- By web standards, **Service Workers**, **Web App Install Prompts (`beforeinstallprompt`)**, and the **Screen Wake Lock API** require either:
  1. `https://` with a valid TLS certificate, OR
  2. `http://localhost` / `http://127.0.0.1`.
- When tablets first connect to the host machine over plain HTTP on a local Wi-Fi router (e.g. `http://192.168.1.50:3000`):
  - The application functions **100% normally** as a high-speed web app.
  - PWA service worker and wake lock simply stay idle without errors or warnings.
  - Device settings sheet explains the requirement cleanly instead of failing.

### 3.2 Backend / Deployment Phase Recommendation
In the upcoming backend phase, enabling HTTPS for the local subnet can be achieved via:
- A reverse proxy (e.g. Caddy or Nginx) running on the restaurant server PC with a local CA certificate (such as `mkcert`) installed on the fleet tablets.
- Alternatively, running a lightweight tunnel (e.g. Cloudflare Tunnel) if external access is desired.

