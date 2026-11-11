# Restaurant POS Authentication & Authorization Architecture

This document outlines the authentication and role-based access control (RBAC) model for the local WiFi tablet Restaurant POS system.

---

## 1. Authentication Concept

The POS operates in a closed local WiFi environment (one server tablet/PC running FastAPI + SQLite, connecting 3-4 waiter tablets).
- **No public signup or self-service password reset.**
- The restaurant owner/manager provisions user credentials.
- In the future FastAPI backend, users live in configuration/database with argon2/bcrypt password hashing.
- Tokens are returned upon `/auth/login` and sent via `Authorization: Bearer <token>` on all requests.
- The frontend remains completely credential-agnostic: passwords are submitted once, never cached or saved.

---

## 2. Mock Users (Development & Offline Simulation)

When running with `NEXT_PUBLIC_USE_MOCK=true`, the client simulates local server responses with 400-600ms latency.

| Username | Password | Full Name | Role | Permitted Floors |
| :--- | :--- | :--- | :--- | :--- |
| `admin` | `admin123` | Admin Manager | `admin` | All Floors (`floor-1`, `floor-2`) + Admin Management |
| `waiter1` | `1234` | Ali Khan | `waiter` | All Floors (`floor-1`, `floor-2`) |
| `waiter2` | `1234` | Zainab Ahmed | `waiter` | All Floors (`floor-1`, `floor-2`) |
| `waiter3` | `1234` | David Chen | `waiter` | Restricted to `floor-1` (Halal) only |

---

## 3. Session Storage & Cookie Mirroring

Because Next.js Edge Middleware cannot read client `localStorage`, the frontend mirrors the session state into lightweight cookies upon login:

- **`pos_token`**: The authentication bearer token (or mock token).
- **`pos_role`**: The user role (`admin` | `waiter`).
- **Flags**: `path=/; SameSite=Lax; expires=<12 hours>`.

When `logout()` is triggered, both `localStorage.removeItem("auth-storage")` and `clearSessionCookies()` are called, immediately invalidating the session for both client and edge middleware.

---

## 4. Middleware Route Protection Matrix (`src/middleware.ts`)

| Route | Unauthenticated | Waiter Role | Admin Role |
| :--- | :--- | :--- | :--- |
| `/` | Redirect to `/login` | Redirect to `/floor-1` (or allowed floor) | Redirect to `/admin/menu` |
| `/login` | Render Login Form | Redirect to waiter home | Redirect to `/admin/menu` |
| `/floor-1`, `/floor-2` | Redirect to `/login?redirect=...` | Allowed (subject to floor guard) | Allowed (full access) |
| `/admin/**` | Redirect to `/login?redirect=...` | **403 Forbidden** (redirects to `/403`) | Allowed |
| `/403`, `/404` | Allowed | Allowed | Allowed |
| `/dev/**` | Allowed in dev; 403 in prod | Allowed in dev; 403 in prod | Allowed in dev; 403 in prod |

---

## 5. Client-Side Double Protection (`RoleGuard` & `useRequireAuth`)

In addition to Next.js Middleware, client components use `<RoleGuard>` and `useRequireAuth()`:
1. **Hydration safety**: Renders `<LoadingScreen />` while Zustand rehydrates from storage to prevent unauthorized UI flashing.
2. **Floor-level permissions**: If a waiter has `allowedFloors: ['floor-1']`, opening `/floor-2` triggers client-side redirection to `/403`.
3. **Session expiry**: Checks `expiresAt`. If 12 hours have passed, silently logs out, clears cookies, and displays a toast notification requesting re-authentication.

---

## 6. Backend Integration Contract (FastAPI Replacement)

When the FastAPI backend is launched, the frontend requires zero rewrites. The backend must simply implement the same contracts:

### 1. `POST /api/auth/login`
**Request:**
```json
{
  "username": "waiter1",
  "password": "1234"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOi...",
  "user": {
    "id": "u2",
    "username": "waiter1",
    "name": "Ali Khan",
    "role": "waiter",
    "allowedFloors": ["floor-1", "floor-2"]
  },
  "expiresAt": "2026-11-04T22:00:00.000Z"
}
```

**Response (401 Unauthorized):**
```json
{
  "message": "Invalid username or password"
}
```

### 2. `GET /api/auth/me`
**Header:** `Authorization: Bearer <token>`
**Response (200 OK):**
```json
{
  "id": "u2",
  "username": "waiter1",
  "name": "Ali Khan",
  "role": "waiter",
  "allowedFloors": ["floor-1", "floor-2"]
}
```

### 3. `POST /api/auth/logout`
**Response (200 OK):**
```json
{
  "success": true
}
```

