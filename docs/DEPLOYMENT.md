# Restaurant POS Deployment & Backend Integration Architecture

This document outlines the operational environment, hosting alternatives, networking requirements, and open design decisions to be resolved during the upcoming backend integration phase.

---

## 1. Local Network Topology

```
                  ┌──────────────────────────────────────────────┐
                  │    Local Restaurant Wi-Fi Router (LAN)       │
                  └──────────────┬───────────────────────────────┘
                                 │
         ┌───────────────────────┼────────────────────────┐
         │                       │                        │
         ▼                       ▼                        ▼
┌─────────────────┐    ┌─────────────────┐      ┌──────────────────┐
│ Main Host Server│    │ Waiter Tablets  │      │ Thermal Printers │
│ (Manager PC)    │    │ (10" Touch POS) │      │ (Port 9100 RAW)  │
│ - Next.js POS   │    │ 192.168.1.101-  │      │ - F1 Kitchen     │
│ - FastAPI API   │    │ 192.168.1.104   │      │ - F2 Kitchen     │
│ - PostgreSQL DB │    │                 │      │ - Cashier Desk   │
│ 192.168.1.50    │    │                 │      │                  │
└─────────────────┘    └─────────────────┘      └──────────────────┘
```

---

## 2. Open Technical Decisions for the Backend Phase

### Decision 1: Host Process Management & Containerization
- **Option A (Docker Compose)**: Run PostgreSQL, FastAPI (Uvicorn), and the Next.js standalone server in a unified Docker Compose setup on the manager's Windows or Linux host machine.
  - *Pros*: Reproducible, isolated, auto-restarts on reboot.
  - *Cons*: Requires Docker Desktop on Windows.
- **Option B (Native Windows Services / PM2)**: Run PostgreSQL as a native Windows service, and run FastAPI and Next.js under PM2 or NSSM (Non-Sucking Service Manager).
  - *Pros*: Lower overhead on modest PC hardware.
  - *Cons*: Manual environment setup on host.

---

### Decision 2: Next.js Runtime: Server-Rendered vs Static Export
- **Option A (Dynamic Next.js Node Server - Current)**: Runs `next start` on Node.js.
  - *Pros*: Supports dynamic middleware auth guards, dynamic headers, server actions, and runtime SSR.
  - *Cons*: Requires Node.js process running on the host.
- **Option B (Static HTML Export `output: 'export'`)**: Compiles to pure static HTML/JS/CSS served directly by Nginx or FastAPI static files.
  - *Pros*: Zero Node.js runtime on server; served as static files by FastAPI or Caddy.
  - *Cons*: Next.js middleware cannot run at request time; route guards must run entirely client-side via React guards (already implemented with `RoleGuard`).

---

### Decision 3: Local Network HTTPS & TLS Strategy
PWA features (Service Workers, Screen Wake Lock, and Install Prompt) require a secure origin (`https://` or `localhost`). Over plain HTTP on LAN, the app functions normally as a web app, but PWA features stay disabled.
- **Option A (Internal Root CA with mkcert + Caddy)**:
  - Run Caddy as reverse proxy on `192.168.1.50:443`.
  - Generate a local CA with `mkcert` and install root certificate onto the waiter tablets once.
- **Option B (mDNS / Local Domain with Let's Encrypt DNS-01 Challenge)**:
  - Assign domain like `pos.restaurantname.com` resolving to LAN IP `192.168.1.50`.
  - Issue valid public Let's Encrypt certificate via DNS challenge (no ports exposed to the internet).
- **Option C (Cloudflare Tunnel)**:
  - Route traffic securely through a Cloudflare zero-trust tunnel.
  - Provides automatic HTTPS with zero certificate installation on tablets, but requires an active internet connection.

---

### Decision 4: IP Allocation & Hardware Resilience
- **DHCP IP Reservations**: Static IP bindings on the restaurant Wi-Fi router for:
  - Host POS Server (`192.168.1.50`)
  - Kitchen & Cashier thermal printers (e.g. `192.168.1.201`, `192.168.1.202`)
- **Database Backups & Durability (B7 Production Subsystem)**:
  - Online non-blocking SQLite backups via `sqlite3.Connection.backup()` (`scripts/backup.py`).
  - Automated nightly schedule (03:00) with startup catchup and graceful shutdown snapshot.
  - Multi-tier retention: 7 daily, 4 weekly (Sundays), 12 monthly, with 24-hour and 30-day pre-migration/pre-reset protection.
  - Sidecar SHA-256 verification and automatic extra-copy mirroring (`BACKUP_EXTRA_DIR`).
  - Single-worker exclusive server lock (`data/server.lock`).
  - Full operations manual available at `docs/backend/OPERATIONS.md`.

