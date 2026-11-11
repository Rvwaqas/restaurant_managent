# Static Export Spike Findings & Architecture Decision (Next.js 15)

## 1. Executive Summary & Decision

- **Decision**: **NO-GO** for pure Next.js 15 `output: 'export'` without modifying frontend production source code.
- **Architectural Solution (Plan N - Contingency & Production Deployment)**:
  1. **Next.js Standalone Node Server**: Running `next start` (or `standalone` output) on Node.js on the server tablet or upstream host.
  2. **Single-Origin Reverse Proxy / Uvicorn Static Mount**: The backend retains `StaticFrontendHandler` (`backend/app/static_frontend.py`) with support for pre-rendered static builds or dynamic route rewrites via `frontend-routes.json`.
  3. **Zero Frontend Code Edits**: The production frontend code in `src/` remains 100% untouched, preserving all cookie guards, middleware logic, dynamic table routes, and API contracts.

---

## 2. Experimental Verification in Isolated Spike (`tmp_frontend_spike`)

An isolated temporary copy of the frontend project was analyzed with `output: 'export'` configured in `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true }
};
```

### Observed Build Results & Errors:

1. **Metadata Route Static Revalidation Requirement**:
   ```text
   Error: export const dynamic = "force-static"/export const revalidate not configured on route "/manifest.webmanifest" with "output: export".
   ```
   *Analysis*: In Next.js 15, dynamic route handlers such as `src/app/manifest.ts` must explicitly declare `export const dynamic = "force-static"`. Without altering frontend code, compilation aborts.

2. **Missing `generateStaticParams()` for Dynamic Routes**:
   ```text
   [Error: Page "/[floor]" is missing "generateStaticParams()" so it cannot be used with "output: export" config.]
   ```
   *Analysis*: The application features dynamic routing:
   - `src/app/(waiter)/[floor]/page.tsx`
   - `src/app/(waiter)/[floor]/table/[tableId]/page.tsx`
   
   Under static export, Next.js requires every parameter combination to be known at build time. However, `tableId` values represent active dining tables configured dynamically by the restaurant manager in SQLite at runtime. Generating static pages for uncreated tables is impossible at build time without architectural changes.

3. **Incompatibility with Server Middleware (`src/middleware.ts`)**:
   - `src/middleware.ts` enforces:
     - Authentication verification via `pos_token` and `pos_role` cookies.
     - Role-based access control (blocking waiters from `/admin/**` routes).
     - Root redirects (`/` -> `/admin/menu` or `/floor-1`).
     - Dev route access restrictions in production.
   - Next.js strictly disallows `middleware.ts` when `output: 'export'` is active (`Error: Middleware cannot be used with "output: 'export'"`). Dropping middleware would break route protection.

---

## 3. Plan N: Node.js Standalone Server Behind Single-Origin Architecture

To provide an unattended, robust deployment on the Android tablet without altering frontend code:

### Architecture Options on Android / Termux:
- **Option 1 (Node.js in Termux / PRoot)**:
  - Install `nodejs-lts` via `pkg install nodejs-lts` (or `apt install nodejs` in PRoot).
  - Build frontend via `npm run build`.
  - Run frontend using `node_modules/.bin/next start -p 3000`.
  - Python backend or a lightweight reverse proxy forwards frontend traffic or serves single-origin.
  
- **Option 2 (Single-Origin FastAPI Static Serving with Fallback)**:
  - If static HTML assets are placed in `FRONTEND_DIST_DIR`, `StaticFrontendHandler` serves them directly with gzip compression, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `HSTS`), and cache optimization (`_next/static/**` -> `immutable`, HTML -> `no-cache`).
  - Dynamic client-side routes can use `frontend-routes.json` rewrite mappings.

---

## 4. Conclusion & Status

- Frontend source code integrity: **Preserved (0 modifications to `src/`)**.
- Backend static serving capability: **Implemented and fully verified in `backend/app/static_frontend.py`**.
- Spike completed and scratch directories safely removed.

