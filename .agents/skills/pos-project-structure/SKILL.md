---
name: pos-project-structure
description: Architecture, routing conventions, folder structure, and state management guidelines for the Restaurant POS Next.js App Router application.
---

# Restaurant POS Next.js App Router Architecture

This skill defines the official architectural structure and conventions for the Restaurant POS project. Always adhere to these patterns when creating or modifying features.

## 1. Directory Structure

```
restaurant-pos-main/
├── .agents/
│   └── skills/
│       └── pos-project-structure/
│           └── SKILL.md                 # This architecture guide
├── app/                                 # Next.js App Router
│   ├── layout.tsx                       # Root layout with RestaurantProvider, SidebarNav, Header, Footer
│   ├── globals.css                      # Global Tailwind and base styles
│   ├── page.tsx                         # POS Home (Menu items grid, category filter, active cart)
│   ├── menu-items/
│   │   └── page.tsx                     # Menu Management (Add, edit, stock toggle, discounts)
│   ├── tables/
│   │   └── page.tsx                     # Table Services (Table status, active orders, billing)
│   ├── reservations/
│   │   └── page.tsx                     # Reservation System (Add reservations, view upcoming)
│   ├── delivery/
│   │   └── page.tsx                     # Delivery Management (Address, contact, driver dispatch)
│   ├── accounting/
│   │   └── page.tsx                     # Financial & Accounting Dashboard (Sales, tax, reports, reset)
│   └── settings/
│       └── page.tsx                     # System Settings (Store info, taxes, tables, preferences)
├── components/                          # Reusable UI & Feature components
│   ├── ui/                              # Shadcn UI primitives (Button, Card, Input, Select, etc.)
│   ├── sidebar-nav.tsx                  # Sidebar navigation with Next.js Link & usePathname
│   ├── header.tsx                       # Top navigation bar with search & quick order summary
│   ├── footer.tsx                       # Kitchen orders ticker bar & status viewer
│   ├── cart.tsx                         # POS order cart & checkout panel
│   ├── food-grid.tsx                    # Menu items card grid
│   ├── food-card.tsx                    # Individual dish card with add-to-cart & options
│   ├── category-filter.tsx              # Quick category selector pills
│   ├── thermal-receipt-modal.tsx        # 80mm/58mm thermal print receipt & KOT slip generator
│   └── order-details-modal.tsx          # Order inspection & status update modal
├── hooks/
│   └── use-restaurant-data.tsx          # Global React Context & Reducer state with LocalStorage sync
├── types/
│   └── restaurant.ts                    # TypeScript types (MenuItem, Order, Table, CartItem, etc.)
└── public/                              # Static public assets
```

---

## 2. Routing Rules (Next.js App Router)

- **All routes live in `app/`**: Never create a separate `components/pages/` folder. Every route must have its own directory containing `page.tsx`.
- **Navigation via `next/link`**: Always use `Link` from `next/link` inside `SidebarNav` and navigation links.
- **Active Route Highlighting**: Use `usePathname()` from `next/navigation` to detect active route paths (e.g., `/`, `/tables`, `/menu-items`).
- **Layout Persistence**: The `app/layout.tsx` persists the global layout shell:
  - `<RestaurantProvider>` wraps the entire application.
  - `<SidebarNav />` is on the left.
  - `<Header />` is at the top.
  - `{children}` renders the current route's page.
  - `<Footer />` shows the live kitchen order ticker at the bottom.
  - Because `layout.tsx` is preserved across route changes, React state and cart items do not reset when switching pages!

---

## 3. State Management (`hooks/use-restaurant-data.tsx`)

- **Centralized Provider**: All application state (`menuItems`, `orders`, `tables`, `currentCart`, `currentOrder`, `searchQuery`, `taxRate`) is managed in `RestaurantProvider`.
- **LocalStorage Sync**: Data changes (orders, tables, menuItems, cart) are persisted to `localStorage` under `restaurant-pos-data`.
- **Action Dispatching**: Use `useRestaurant()` hook:
  ```tsx
  const { state, dispatch } = useRestaurant()
  ```
- **Order Types**: The system supports 3 primary order types:
  1. `Dine In` (associated with a specific table `tableNumber`)
  2. `Take Away`
  3. `Delivery` (associated with customer phone, address, notes)

---

## 4. UI & Styling Guidelines

- **Tailwind CSS**: Use Tailwind classes for all styling.
- **Gradient Accents**: Brand identity uses green-to-emerald gradients (`bg-gradient-to-r from-green-400 to-green-600`) for primary actions and active navigation items.
- **Responsive Flex Containers**:
  - The main dashboard uses `h-screen overflow-hidden` with scrollable child containers (`overflow-y-auto`).
  - Home POS page renders `<main className="flex-1 overflow-auto p-4">` beside `<Cart />`.
  - Non-POS pages span full width inside `<main className="flex-1 overflow-auto p-4">`.
- **Component Primitives**: Always reuse existing primitives in `components/ui/` (`Button`, `Card`, `Input`, `Select`, `Badge`, `Switch`, `Textarea`).
