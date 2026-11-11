# EMPIRE ERP — COMPLETE MASTER ARCHITECTURE & SPECIFICATION

> **System**: Empire ERP (Ghani Group of Companies / Empire Developments)  
> **Domain**: UAE Real Estate Developer Enterprise Resource Planning & Double-Entry Accounting  
> **Source Code Basis**: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4, Zustand 5, TanStack Table 8, Axios 1.11, Laravel Backend (Reverb WebSockets + Firebase Cloud Messaging)

---

## TABLE OF CONTENTS
1. [Executive Summary & Technology Stack](#1-executive-summary--technology-stack)
2. [Multi-Tenant Architecture & App Boot Lifecycle](#2-multi-tenant-architecture--app-boot-lifecycle)
3. [Codebase Directory Structure & Governance](#3-codebase-directory-structure--governance)
4. [Component Architecture & UI Catalog](#4-component-architecture--ui-catalog)
5. [Form Engineering Standard](#5-form-engineering-standard)
6. [API & Axios Network Architecture](#6-api--axios-network-architecture)
7. [Authentication, Session & Impersonation](#7-authentication-session--impersonation)
8. [Four-Tier Permission & Access Control System](#8-four-tier-permission--access-control-system)
9. [Sidebar Navigation & Keyboard Shortcuts](#9-sidebar-navigation--keyboard-shortcuts)
10. [TanStack Data Table System](#10-tanstack-data-table-system)
11. [URL-Synchronized Filter System](#11-url-synchronized-filter-system)
12. [Date Standardization & Fiscal Boundaries](#12-date-standardization--fiscal-boundaries)
13. [UI/UX Design System (Liquid Glass & Gold)](#13-uiux-design-system-liquid-glass--gold)
14. [Loading, Skeletons & Error Handling Standards](#14-loading-skeletons--error-handling-standards)
15. [Business Modules Functional Specification](#15-business-modules-functional-specification)
16. [Core Business Logic & Domain Workflows](#16-core-business-logic--domain-workflows)
17. [Calculations & Auto-Allocation Engine](#17-calculations--auto-allocation-engine)
18. [Comprehensive API Catalog & Route Directory](#18-comprehensive-api-catalog--route-directory)
19. [Developer Guide: Scaffolding New Modules & Features](#19-developer-guide-scaffolding-new-modules--features)
20. [Golden Coding Rules & AI Agent Playbook](#20-golden-coding-rules--ai-agent-playbook)

---

## 1. Executive Summary & Technology Stack

Empire ERP is an enterprise-grade ERP designed specifically for the United Arab Emirates (UAE) property development and asset management ecosystem. It manages the complete property lifecycle: lead prospecting, customer onboarding (KYC/AML), spatial inventory, sales booking, installment scheduling, payment collections, cheque clearance (PDC), inter-unit credit transfers, refund liabilities, legal conveyance (SPA, DLD Oqood, Title Deed), broker commissions, and a 5-level double-entry accounting engine.

### Technology Stack
* **Framework**: Next.js `15.5.7` (App Router)
* **Runtime / Core**: React `19.0.0`, TypeScript `^5.0`
* **Styling**: Tailwind CSS `v4.1.5` with CSS-first variable architecture and PostCSS
* **State Management**: Zustand `5.0.4`
* **Data Grids**: `@tanstack/react-table` `8.21.3`
* **HTTP Client**: Axios `1.11.0` (with custom request/response/error interceptors)
* **Feedback & Dialogs**: SweetAlert2 `11.23.0`
* **Push Notifications**: Firebase JS SDK `12.6.0` (FCM Service Worker)
* **Real-time WebSockets**: Laravel Echo `1.19.0` + Pusher JS `8.5.0` over Laravel Reverb
* **Dates & Localization**: Moment.js `2.30.1` + React-Datepicker `8.4.0`
* **Form Selects**: React-Select `5.10.2` (Async Creatable)
* **Exports**: SheetJS `xlsx` `0.18.5` + FileSaver `2.0.5`
* **Currency**: Custom UAE Dirham fonts and vector SVGs (`U+20C3`)

---

## 2. Multi-Tenant Architecture & App Boot Lifecycle

### Dynamic Slug Routing (`/[company_slug]/...`)
Multi-tenancy is enforced at the URL path level:
* Every tenant page is rooted under `src/app/[company_slug]/...`.
* Tab isolation is absolute: opening different companies in separate browser tabs does not conflict because tenant context is derived from the URL path, not a shared cookie.
* `src/middleware.ts` enforces edge-level authentication checking the `token` cookie.

### App Boot Synchronization (`src/lib/appBoot.ts`)
To prevent child pages from initiating API requests before tenant initialization and permissions are resolved:
1. `src/app/layout.tsx` invokes `beginAppBoot(appSlug)`.
2. All non-boot Axios API requests are suspended via `waitForAppBoot()`.
3. The layout sequentially resolves:
   * Company Tenant (`GET /companies/slug/{slug}`)
   * Global Config (`GET /config/init?per_page=9999`)
   * User Profile & Permissions (`GET /auth/me`)
   * Notifications (`GET /me/notifications`)
4. Layout calls `markAppBootReady()`, releasing all suspended API promises simultaneously.

---

## 3. Codebase Directory Structure & Governance

```
src/
├── app/
│   ├── [company_slug]/       # Multi-tenant module views (Sales, Finance, Inventory, etc.)
│   ├── components/           # 81 reusable UI components (Table, InputField, Modal, etc.)
│   ├── css/                  # globals.css (tokens, Dirham font, light/dark themes)
│   ├── login/                # Authentication screen
│   ├── logout/               # Session invalidation & cleanup
│   ├── layout.tsx            # Master App Shell & Boot Coordinator
│   └── page.tsx              # Multi-Tenant Welcome & Company Selector
├── constants/
│   └── permissionModules.ts  # Canonical registry of permission keys & modules
├── hooks/
│   ├── rendorError.tsx       # Field error visualizer (<RendorError />)
│   ├── useFilters.ts         # URL-synchronized filter state hook
│   ├── usePermissionDates.ts # Dynamic fiscal date boundary hook
│   └── useButtonFeedback.ts  # In-button micro-interaction feedback hook
├── lib/
│   ├── axios.ts              # Centralized enterprise Axios HTTP client
│   └── appBoot.ts            # Request latch & boot synchronization
├── middleware.ts             # Next.js edge route protection
├── stores/                   # Zustand stores (auth, company, theme, setting, etc.)
└── utils/                    # Pure domain math, formatters, and SweetAlert wrappers
```

---

## 4. Component Architecture & UI Catalog

The application maintains 81 production components in `src/app/components/`:
1. **`Table.tsx`**: Core virtualized grid table wrapping `@tanstack/react-table`. Supports auto column measurement, sticky left columns, server-side pagination, multi-sort, and URL query synchronization.
2. **`InputField.tsx`**: Universal composite control wrapping text, comma-formatted numbers/amounts, textareas, `SearchSelect`, `DatePicker`, `DateRangePicker`, `PhoneInput`, and `ToggleSwitch`. Automatically binds to `<RendorError />`.
3. **`SearchSelect.tsx`**: Asynchronous searchable select built on `react-select`. Fetches data remotely from endpoints (e.g. `/search/projects`, `/search/customers`) with debounce.
4. **`Modal.tsx`**: Glassmorphism dialog rendered into a React Portal with integrated header, body, footer, and submitting states.
5. **`SidePanel.tsx`**: Slide-over filter drawer that shifts page content dynamically via `useFilterDrawerStore`.
6. **`Button.tsx`**: Tokenized button supporting in-button micro-animations: spinning refresh, success checkmark (`#0C6332`), and error shake (`#DC2626`).
7. **`AutoAllocationPreview.tsx`**: Live simulation grid for payment schedules and receipt auto-allocation.
8. **`ExportButton.tsx`**: Streams server-side Excel files or triggers SheetJS client generation.

---

## 5. Form Engineering Standard

Empire ERP follows the **Hybrid Form Model**:
* Native inputs (text, numbers, files) remain uncontrolled/semi-controlled in DOM.
* Complex inputs (`SearchSelect`, `DatePicker`) are held in `formState`.
* Form submission captures native elements via `new FormData(e.currentTarget)` and explicitly appends complex values:

```tsx
const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, action?: string) => {
  e.preventDefault();
  if (submitting || isBusy) return;
  setErrors({});
  setSubmitting(true);

  const formDataToSend = new FormData(e.currentTarget);
  if (formState.project_id?.value) {
    formDataToSend.set("project_id", String(formState.project_id.value));
  }

  try {
    const endpoint = editId ? `/entities/update/${editId}` : "/entities/";
    await api.post(endpoint, formDataToSend);
    showSuccess();
    await waitForFeedback();
    resetForm();
    onSuccess(action === "create_and_add_new");
    onClose();
  } catch (err) {
    handleApiError({ err, setErrors });
  } finally {
    setSubmitting(false);
  }
};
```

### Automatic Validation Binding (`<RendorError />`)
* Laravel validation errors (HTTP 422) are normalized by `handleApiError` into `{ [field]: string[] }`.
* `<InputField name="field" errors={errors} />` renders `<RendorError />`.
* When the user modifies or focuses on the input, `<RendorError />` intercepts the DOM event and automatically dismisses the error message.

---

## 6. API & Axios Network Architecture

All HTTP communications route strictly through `src/lib/axios.ts`:
* **Base URL**: `process.env.NEXT_PUBLIC_API_BASE_URL` with `withCredentials: true`.
* **Request Interceptor**:
  * Strips duplicate slashes and redundant `/api/` prefixes.
  * Waits on `waitForAppBoot()` if tenant bootstrapping is incomplete.
  * Extracts Bearer token from document cookie `token`.
  * Injects `company_id` and `slug` into headers, query params (GET), and payload body (POST/PUT/DELETE).
* **Response Interceptor**:
  * Unwraps `response.data` directly to the caller.
  * If `config.loading` was set, automatically dismisses the SweetAlert loader and renders success toasts.
* **Error Interceptor**:
  * HTTP 401 $\rightarrow$ redirects to `/logout`.
  * HTTP 409 $\rightarrow$ redirects to `/[slug]/service-unavailable`.
  * HTTP 422 $\rightarrow$ normalizes validation errors.
  * Rejects `{ status, message, response }`.

---

## 7. Authentication, Session & Impersonation

* **Login**: `src/app/login/page.tsx` registers Firebase FCM device push token and dispatches POST `/auth/login`.
* **Storage**: Bearer token saved in HTTP cookie `token`; user profile and permissions saved in `localStorage.getItem("meData")`.
* **Company Selector**: Post-login user lands on `/` (`src/app/page.tsx`), fetches accessible companies via GET `/companies/my`, and navigates to `/[company_slug]`.
* **Admin Impersonation**: Built-in support in `useAuthStore.impersonate(userId)` stashes administrator token into cookie `originalToken` and loads target user permissions. Impersonation banner allows 1-click revert.

---

## 8. Four-Tier Permission & Access Control System

1. **Tier 1 (Route Guard)**: `isPathAllowed(pathname)` in `layout.tsx` checks user `allowed_urls`; redirects unauthorized attempts to `/[company_slug]/403`.
2. **Tier 2 (Menu Guard)**: `isMenuItemVisible(item)` in `Sidebar.tsx` recursively checks permission keys and hides inaccessible groups.
3. **Tier 3 (Action Guard)**: `hasPermission("booking_create")` and `useHasPermission("booking_create")` conditionally render create/edit/delete buttons.
4. **Tier 4 (Fiscal Date Guard)**: `usePermissionDates("cash_payment_voucher_create")` queries GET `/permissions/dates` to bound allowed calendar entry dates (`minDate`, `maxDate`).
* **Super Admin**: `isSuperAdmin === true` bypasses all restrictions.
* **Chart of Accounts Hierarchy**: Permissions follow `chart_of_account_level_${1..5}_${create|update|delete|view|read}`.

---

## 9. Sidebar Navigation & Keyboard Shortcuts

* **Geometry**: Fixed 2.75rem (`h-11`) icon rail; glyphs never jump on hover expansion (`padding-left: calc((5rem - 2.75rem) / 2)`).
* **Active State**: Inset gold border ring (`--sidebar-active-radius: 0.75rem`).
* **Global Hotkeys**:
  * `Alt+D`: Dashboard | `Alt+S`: Sales Hub | `Alt+N+B`: New Booking | `Alt+B+L`: Bookings List
  * `Alt+R+P`: Receipts List | `Alt+R+C`: Create Receipt | `Alt+R+T`: Receipt Transfer | `Alt+R+F`: Refunds
  * `F10` / `Alt+P+D+C`: PDC Cheques | `Alt+C`: Customers | `Alt+N+C`: New Customer | `Alt+C+C`: CRM Leads
  * `Alt+I`: Finance Hub | `Alt+C+P`: Cash Payment | `Alt+B+P`: Bank Payment | `Alt+J+V`: Journal Voucher
  * `F3`: Account Ledger | `F4`: Sales Detail Report | `F5`: Sales Report | `F6`: Trial Balance | `F7`: Chart of Accounts | `F8`: Day Book | `F9`: Collection Sheet

---

## 10. TanStack Data Table System

* Configured via `src/app/components/Table.tsx`.
* **Standard Metrics** (`erpTableTheme.ts`):
  * Header Height: `44px`
  * Row Height: `40px`
  * Skeleton Rows: Exactly `10` rows (matches loaded viewport, preventing layout shift).
  * Min Viewport Height: `calc(100dvh - 16rem)`.
* **Theme Styling**: Dark header background `rgb(45, 45, 48)`; light header background `#f4f6f9`. Tabular numbers enforced across all currency and numeric cells.

---

## 11. URL-Synchronized Filter System

* Managed via `src/hooks/useFilters.ts` and `src/app/components/SidePanel.tsx`.
* Every filter input serializes into URL query parameters:
  * Text search: `?q=...`
  * Single foreign ID: `?project_id=4`
  * Multi-select foreign IDs: `?project_ids=4,5,6`
  * Date range: `?date_from=2026-01-01&date_to=2026-01-31 23:59:59`
* Applying or clearing filters resets `page=1` automatically and synchronizes across browser history.

---

## 12. Date Standardization & Fiscal Boundaries

1. **API Storage & Payloads**: Strictly ISO `YYYY-MM-DD`.
2. **UI Display Format**: Strictly `MMM-DD-YYYY` via `formatDate(date)` (e.g. `Oct-27-2026`).
3. **Audit Timestamps**: Strictly `MMM-DD-YYYY, hh:mm A` via `formatDateTime(date)` (e.g. `Oct-27-2026, 10:45 AM`).
4. **Inclusive Ranges**: Date ranges automatically append ` 23:59:59` to `to` date strings.
5. **Fiscal Period Boundaries**: Backdating vouchers is restricted to `minDate`/`maxDate` returned by `/permissions/dates`.

---

## 13. UI/UX Design System (Liquid Glass & Gold)

* **Surface**: Acrylic liquid glass (`bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl`).
* **Brand Accent**: UAE Gold gradient: `bg-gradient-to-r from-[#FFE38D] to-[#BA8859]`.
* **Currency Symbol**: Native UAE Dirham glyph `U+20C3` rendered via custom static fonts and vector SVGs in `formatAmount()`.
* **Dual Theme Engine**: Dark default with full executive light mode (`html.light`) using CSS variables and View Transitions API.

---

## 14. Loading, Skeletons & Error Handling Standards

* **Page Transitions**: `<TopProgressBar />` (gold NProgress bar).
* **Tables**: 10 body row skeletons perfectly matching `40px` height.
* **Form Submissions**: In-button micro-animations (`<Button loading={submitting} />`).
* **Destructive Operations**: SweetAlert glass dialogs (`showLoading("Cancelling booking...")`).
* **Error Normalization**: `handleApiError({ err, setErrors })` handles field-keyed dictionaries and string lists, updates state, and renders top toasts.

---

## 15. Business Modules Functional Specification

1. **CRM & Leads** (`/crm-leads`, `/crm/crm-clients`): Lead scoring, source attribution, follow-up call logs, and customer quotation offers.
2. **Customers** (`/customers`, `/customers/new`): Central investor directory, KYC/AML document verification (passports, visas, Emirates IDs).
3. **Sales & Bookings** (`/sales/bookings`): Unit selection, base price, discount approval, installment plans, booking cancellation, and penalty waivers.
4. **Treasury & Receipts** (`/sales/receipts`, `/sales/pdc`): Cash/Bank/Cheque collections, multi-tier auto-allocation, bounced cheques, and credit transfers.
5. **Legal Conveyance** (`/sales/management`): SPA requests, SPA contract generation, Dubai Land Department (DLD) Oqood pre-registration, Title Deed issuance.
6. **Brokerage Commission** (`/sales/commission`): Deal eligibility thresholds (e.g. 20% collected), agency tax invoices, and commission disbursement vouchers.
7. **Double-Entry Accounting** (`/finance/vouchers`, `/finance/coa`, `/finance/ledger`): Cash/Bank Payment/Receipt vouchers, Journal entries, Contra vouchers, 5-Level Chart of Accounts, Day Book, Bank Reconciliation, Trial Balance.
8. **Spatial Inventory** (`/system/inventory`): Cost Centers $\rightarrow$ Projects $\rightarrow$ Buildings $\rightarrow$ Floors $\rightarrow$ Unit Types $\rightarrow$ Units.
9. **System & Administration** (`/system/user-management`, `/system/companies`, `/system/logs`): User accounts, permission matrices, tenant companies, and row-level audit trails.

---

## 16. Core Business Logic & Domain Workflows

### The Real Estate Sales Pipeline
```
Lead Intake -> KYC Verification -> Unit Selection (Must be 'Available')
  -> Booking Creation -> Installment Plan Generation (Must total 100%)
  -> Receipt Collection -> Auto-Allocation (Admin Fee -> DP -> DLD -> Penalties -> Installments)
  -> PDC Cheque Clearance (or Bounce Reversal + Penalty Levy)
  -> SPA Contract Signing -> DLD Oqood Pre-Registration -> Handover & Title Deed Transfer
  -> Broker Commission Payout (Upon crossing collection threshold)
```

### The Financial Accounting Pipeline
```
5-Level Chart of Accounts (Class Type -> Class -> Group -> Head -> Account)
  -> Voucher Entry (Debit = Credit check)
  -> Maker-Checker Authorization
  -> Account Ledger & Day Book Posting
  -> Bank Reconciliation Matching
  -> Balanced Trial Balance Generation
```

---

## 17. Calculations & Auto-Allocation Engine

### Net Contract Price Formula
$$\text{Net Contract Price} = (\text{Base Price} - \text{Discount}) + \text{Admin Fee} + \text{VAT on Admin Fee} + \text{DLD Fee}$$

### Receipt Auto-Allocation Algorithm (`autoAllocate.ts`)
When payment $R$ is received:
1. **Priority 1 (Admin Fee & VAT)**: Allocated proportionally between Admin Fee (`paymenttype_id: 18`) and 5% VAT (`paymenttype_id: 29`).
2. **Priority 2 (Down Payment)**: Satisfies booking down payment.
3. **Priority 3 (DLD Fee)**: Satisfies 4% Land Department charge.
4. **Priority 4 (Penalties)**: Clears accrued late payment penalties.
5. **Priority 5 (Secondary Pool)**: Clears Bounce Cheque Charges $\rightarrow$ Other Charges $\rightarrow$ Installments sorted by `due_date` ASC.
6. **Priority 6 (Overflow Fallback)**: Advances credited to Down Payment or last installment.

### Precision Math
All financial calculations use strict epsilon rounding:
$$\text{round2}(n) = \text{Math.round}((n + \text{Number.EPSILON}) \times 100) / 100$$

---

## 18. Comprehensive API Catalog & Route Directory

### Authentication & Tenant Endpoints
* `POST /auth/login`: Authenticate credentials & register FCM token.
* `POST /auth/logout`: Invalidate session.
* `GET /auth/me`: User profile, permissions array, allowed URLs.
* `GET /companies/my`: List authorized tenant companies.
* `GET /companies/slug/{slug}`: Tenant configuration and branding.
* `GET /config/init?per_page=9999`: Global application key-value settings.
* `POST /users/impersonate`: Begin account impersonation.
* `GET /permissions/dates`: Authorized voucher fiscal date range.

### Inventory & Sales Endpoints
* `GET /projects`, `POST /projects/`, `POST /projects/update/{id}`, `POST /projects/delete/{id}`
* `GET /units`, `POST /units/`, `POST /units/update/{id}`
* `GET /bookings`, `POST /bookings`, `POST /bookings/update/{id}`, `POST /bookings/cancel`
* `GET /receipts`, `POST /receipts`, `POST /receipts/approve/{id}`, `POST /receipts/bounced/{id}`, `POST /receipts/transfer`
* `GET /pdc`, `POST /refunds`, `GET /sale-commission/eligible`, `POST /sale-commission/invoice`

### Finance & Accounting Endpoints
* `GET /coa`: 5-level Chart of Accounts tree hierarchy.
* `GET /general-ledger`: Account transaction ledger.
* `GET /reports/trial-balance`: Balanced trial balance statement.
* `POST /vouchers/cash-payment`, `POST /vouchers/bank-payment`, `POST /vouchers/journal`, `POST /vouchers/contra`
* `POST /vouchers/.../authorize/{id}`: Approve draft voucher.
* `POST /bank-recon/store`: Save bank reconciliation statement.

---

## 19. Developer Guide: Scaffolding New Modules & Features

### Step 1: Create Module Route Directory
Create `src/app/[company_slug]/<module-name>/`:
* `page.tsx` (Master List)
* `layout.tsx` (Module layout pass-through)
* `<EntityModal>.tsx` (Create / Edit modal)

### Step 2: Register Sidebar Navigation & Hotkey
In `src/utils/sidebarMenu.ts`, append a new `MenuItem` specifying label, Remix icon, shortcut, and required permissions.

### Step 3: Register Permissions
In `src/constants/permissionModules.ts`, add the module and its action keys (`_read`, `_create`, `_update`, `_delete`, `_export_excel`).

### Step 4: Implement Master List (`page.tsx`)
Mount `<PageHeader />`, `<SidePanel />` wired to `useFilters()`, and `<Table endpoint="..." />` with fixed column widths and action buttons guarded by `hasPermission(...)`.

### Step 5: Implement Create/Edit Modal
Wrap form in `<Modal />`, use `<InputField />` for inputs, construct `new FormData()`, dispatch via `api.post(...)`, and handle errors with `handleApiError({ err, setErrors })`.

---

## 20. Golden Coding Rules & AI Agent Playbook

1. **Client Directives**: Include `"use client";` at line 1 of interactive files.
2. **Centralized Axios**: Always use `import api from "@/lib/axios"`.
3. **Multi-Tenant URLs**: Always prefix routes with `/${companySlug}/...`.
4. **Hybrid Forms**: Use `new FormData(e.currentTarget)` and merge controlled values before submit.
5. **Server Errors**: Always handle failures with `handleApiError({ err, setErrors })` and bind `<RendorError />`.
6. **Currency Display**: Always format AED with `formatAmount(value)` to render glyph `U+20C3`.
7. **Date Uniformity**: Always display dates with `formatDate(date)` (`MMM-DD-YYYY`) and send ISO `YYYY-MM-DD`.
8. **Permission Wrappers**: Always gate mutating actions with `hasPermission("...")`.
9. **Liquid Glass Design**: Use `bg-white/5 backdrop-blur-xl border border-white/10` and UAE Gold gradients.
10. **Zero Re-invention**: Inspect `src/app/components/` and `src/utils/` before authoring new code.
