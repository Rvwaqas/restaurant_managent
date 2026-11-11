"use client";

import * as React from "react";
import Link from "next/link";
import {
  Smartphone,
  Tablet,
  Monitor,
  Maximize2,
  Utensils,
  Plus,
  RefreshCw,
  Trash2,
  AlertCircle,
  TrendingUp,
  FileText,
  DollarSign,
  Coffee,
  CheckCircle2,
  Flame,
  Cake,
  Pizza,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { CategoryChips } from "@/components/menu/category-chips";
import { TableCard } from "@/components/tables/table-card";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { CartPanel } from "@/components/cart/cart-panel";
import { BottomActionBar } from "@/components/cart/bottom-action-bar";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  TableCardSkeleton,
  MenuItemSkeleton,
  ListSkeleton,
} from "@/components/ui/skeletons";
import { OrderLayout } from "@/components/layout/order-layout";
import { cn } from "@/lib/utils";

// Mock Categories
const MOCK_CATEGORIES = [
  { id: "sweet", name: "Sweet Desserts", count: 8 },
  { id: "spicy", name: "Spicy & Grills", count: 12 },
  { id: "drinks", name: "Beverages", count: 15 },
  { id: "sides", name: "Starters & Sides", count: 6 },
  { id: "mains", name: "Chef Specials", count: 9 },
];

// Mock Table Data for DataTable
interface ReportRow {
  id: string;
  orderNumber: string;
  table: string;
  floor: string;
  waiter: string;
  itemsCount: number;
  total: number;
  status: "paid" | "open" | "cancelled";
}

const MOCK_REPORT_DATA: ReportRow[] = [
  { id: "1", orderNumber: "#ORD-1001", table: "T-01", floor: "Floor 1 (Halal)", waiter: "Ali Khan", itemsCount: 4, total: 48.5, status: "paid" },
  { id: "2", orderNumber: "#ORD-1002", table: "T-04", floor: "Floor 1 (Halal)", waiter: "Zainab", itemsCount: 6, total: 84.0, status: "paid" },
  { id: "3", orderNumber: "#ORD-1003", table: "T-08", floor: "Floor 2 (Non-Halal)", waiter: "David", itemsCount: 3, total: 32.0, status: "open" },
  { id: "4", orderNumber: "#ORD-1004", table: "T-02", floor: "Floor 1 (Halal)", waiter: "Ali Khan", itemsCount: 2, total: 18.5, status: "paid" },
  { id: "5", orderNumber: "#ORD-1005", table: "T-11", floor: "Floor 2 (Non-Halal)", waiter: "David", itemsCount: 5, total: 67.2, status: "open" },
  { id: "6", orderNumber: "#ORD-1006", table: "T-07", floor: "Floor 1 (Halal)", waiter: "Zainab", itemsCount: 1, total: 12.0, status: "cancelled" },
  { id: "7", orderNumber: "#ORD-1007", table: "T-03", floor: "Floor 1 (Halal)", waiter: "Ali Khan", itemsCount: 7, total: 112.5, status: "paid" },
  { id: "8", orderNumber: "#ORD-1008", table: "T-09", floor: "Floor 2 (Non-Halal)", waiter: "David", itemsCount: 4, total: 54.0, status: "paid" },
  { id: "9", orderNumber: "#ORD-1009", table: "T-05", floor: "Floor 1 (Halal)", waiter: "Zainab", itemsCount: 2, total: 24.0, status: "paid" },
];

export default function UiShowcasePage() {
  // Viewport Switcher state
  const [viewportMode, setViewportMode] = React.useState<"full" | "1280" | "1024" | "768">("full");

  // Interactive UI component states
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");
  const [stepperVal, setStepperVal] = React.useState(2);
  const [switchVal, setSwitchVal] = React.useState(true);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dialogVariant, setDialogVariant] = React.useState<"primary" | "danger">("primary");

  // Interactive Mock Cart State for demo
  const [mockCart, setMockCart] = React.useState([
    { id: "c1", name: "Gulab Jamun (2 pcs)", price: 6.5, qty: 2, note: "warm please" },
    { id: "c2", name: "Chicken Tikka Boti", price: 14.0, qty: 1, note: "extra spicy" },
    { id: "c3", name: "Garlic Naan Bread", price: 3.5, qty: 3 },
    { id: "c4", name: "Mango Lassi Pitcher", price: 9.0, qty: 1 },
  ]);

  const cartSubtotal = mockCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const cartTax = cartSubtotal * 0.05;
  const cartTotal = cartSubtotal + cartTax;

  const handleUpdateQty = (id: string, qty: number) => {
    setMockCart((prev) => prev.map((item) => (item.id === id ? { ...item, qty } : item)));
  };

  const handleRemoveCartItem = (id: string) => {
    setMockCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddNote = (id: string, note: string) => {
    setMockCart((prev) => prev.map((item) => (item.id === id ? { ...item, note } : item)));
  };

  // DataTable columns
  const tableColumns: ColumnDef<ReportRow>[] = [
    {
      header: "Order",
      accessorKey: "orderNumber",
      cell: (row) => <span className="font-mono font-bold text-gray-900">{row.orderNumber}</span>,
    },
    {
      header: "Table & Floor",
      cell: (row) => (
        <div>
          <span className="font-bold text-gray-900">{row.table}</span>
          <span className="text-xs text-muted-foreground block">{row.floor}</span>
        </div>
      ),
    },
    { header: "Waiter", accessorKey: "waiter" },
    {
      header: "Items",
      accessorKey: "itemsCount",
      cell: (row) => <span className="tabular-nums font-semibold">{row.itemsCount}</span>,
    },
    {
      header: "Total",
      accessorKey: "total",
      cell: (row) => (
        <span className="font-extrabold text-primary tabular-nums">
          ${row.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA] flex flex-col select-none">
      {/* Top Showcase Toolbar */}
      <div className="bg-white border-b border-border sticky top-0 z-50 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black">
            UI
          </div>
          <div>
            <h1 className="font-extrabold text-lg text-gray-900 leading-tight">
              Design System & Component Showcase
            </h1>
            <p className="text-xs text-muted-foreground">
              Tablet-optimized POS Components &bull; Task F2 Verification
            </p>
          </div>
        </div>

        {/* Viewport Frame Switcher */}
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-xl border border-border">
          <span className="text-xs font-bold text-muted-foreground px-2 hidden sm:inline">
            Device Preview:
          </span>
          <button
            type="button"
            onClick={() => setViewportMode("full")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewportMode === "full" ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>Full (Fluid)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewportMode("1280")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewportMode === "1280" ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>1280px Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setViewportMode("1024")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewportMode === "1024" ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Tablet className="h-3.5 w-3.5" />
            <span>1024px Landscape</span>
          </button>
          <button
            type="button"
            onClick={() => setViewportMode("768")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              viewportMode === "768" ? "bg-white text-primary shadow-xs" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>768px Portrait</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/floor-1">
            <Button variant="outline" size="sm" className="h-9 text-xs font-bold">
              Floor 1 App
            </Button>
          </Link>
          <Link href="/admin/menu">
            <Button variant="secondary" size="sm" className="h-9 text-xs font-bold">
              Admin Panel
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Showcase Container (Responsive Wrapper) */}
      <div
        className={cn(
          "mx-auto w-full transition-all duration-300 p-4 sm:p-6 lg:p-8 space-y-12",
          viewportMode === "1280" && "max-w-[1280px] border-x border-border shadow-2xl bg-white",
          viewportMode === "1024" && "max-w-[1024px] border-x border-border shadow-2xl bg-white",
          viewportMode === "768" && "max-w-[768px] border-x border-border shadow-2xl bg-white",
          viewportMode === "full" && "max-w-7xl"
        )}
      >
        {/* Section 1: Color Palette & Tokens */}
        <section className="space-y-4">
          <PageHeader
            title="1. Color Tokens & Semantic Status Rules"
            subtitle="Strict semantic colors: Green & Red are RESERVED for table occupancy only."
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-[#4F46E5] text-white">
              <span className="text-xs font-bold uppercase opacity-80">Primary</span>
              <div className="text-lg font-black mt-1">#4F46E5</div>
              <span className="text-xs opacity-75">Brand & Actions</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#DCFCE7] border-2 border-[#16A34A] text-green-950">
              <span className="text-xs font-bold uppercase text-green-800">Status Free</span>
              <div className="text-lg font-black mt-1">#16A34A</div>
              <span className="text-xs text-green-700">Reserved Free Table</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#FEE2E2] border-2 border-[#DC2626] text-red-950">
              <span className="text-xs font-bold uppercase text-red-800">Status Occupied</span>
              <div className="text-lg font-black mt-1">#DC2626</div>
              <span className="text-xs text-red-700">Reserved Occupied Table</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#FEF3C7] border-2 border-[#D97706] text-amber-950">
              <span className="text-xs font-bold uppercase text-amber-800">Status Open</span>
              <div className="text-lg font-black mt-1">#D97706</div>
              <span className="text-xs text-amber-700">Warning / Pending</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#DBEAFE] border-2 border-[#2563EB] text-blue-950">
              <span className="text-xs font-bold uppercase text-blue-800">Status Paid</span>
              <div className="text-lg font-black mt-1">#2563EB</div>
              <span className="text-xs text-blue-700">Information / Billed</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border-2 border-border text-gray-900">
              <span className="text-xs font-bold uppercase text-gray-500">Surface</span>
              <div className="text-lg font-black mt-1">#FFFFFF</div>
              <span className="text-xs text-gray-500">Cards & Modals</span>
            </div>
          </div>
        </section>

        {/* Section 2: Touch Targets & Buttons */}
        <section className="space-y-4">
          <PageHeader
            title="2. Buttons & Touch Ergonomics"
            subtitle="All interactive elements have minimum 48px touch targets, active tap scale feedback, and accessible roles."
          />

          <div className="p-6 bg-white rounded-2xl border-2 border-border shadow-xs space-y-6">
            {/* Variants */}
            <div>
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                Variants (48px standard height)
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary (Brand)</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="primary" loading>
                  Processing...
                </Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                Touch Target Sizes
              </h3>
              <div className="flex flex-wrap items-end gap-3">
                <Button size="md" variant="primary">
                  Medium (48px)
                </Button>
                <Button size="lg" variant="primary">
                  Large (56px)
                </Button>
                <Button size="xl" variant="primary">
                  Extra Large (64px)
                </Button>
              </div>
            </div>

            {/* IconButtons */}
            <div>
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                Icon Buttons (48px min bounding box)
              </h3>
              <div className="flex items-center gap-3">
                <IconButton aria-label="Refresh data" variant="primary">
                  <RefreshCw className="h-5 w-5" />
                </IconButton>
                <IconButton aria-label="Add item" variant="outline">
                  <Plus className="h-5 w-5" />
                </IconButton>
                <IconButton aria-label="Remove item" variant="danger">
                  <Trash2 className="h-5 w-5" />
                </IconButton>
                <IconButton aria-label="More options" variant="ghost">
                  <Utensils className="h-5 w-5" />
                </IconButton>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Form Controls & Inputs */}
        <section className="space-y-4">
          <PageHeader
            title="3. Inputs, Selects & Quantity Steppers"
            subtitle="High-contrast 48px controls with search clear buttons and large stepper taps."
          />

          <div className="p-6 bg-white rounded-2xl border-2 border-border shadow-xs grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Search Dish or Table</label>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search food, drinks..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Standard Text Input</label>
              <Input placeholder="e.g. Special Kitchen Instructions" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Select Floor / Category</label>
              <Select defaultValue="sweet">
                <SelectTrigger>
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sweet">Sweet Desserts (Printer #1)</SelectItem>
                  <SelectItem value="spicy">Spicy & Grills (Printer #2)</SelectItem>
                  <SelectItem value="drinks">Bar & Drinks (Printer #3)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Quantity Stepper (48px Touch)</label>
              <div>
                <QuantityStepper
                  value={stepperVal}
                  onChange={setStepperVal}
                  min={1}
                  max={20}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-800">Item Availability Switch</label>
              <div className="flex items-center gap-3 pt-1">
                <Switch checked={switchVal} onCheckedChange={setSwitchVal} />
                <span className="text-sm font-bold text-gray-700">
                  {switchVal ? "Item In Stock" : "Sold Out (Disabled)"}
                </span>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <label className="text-sm font-bold text-gray-800">Chef & Waiter Notes</label>
              <Textarea placeholder="Enter any allergies or custom preparation notes..." />
            </div>
          </div>
        </section>

        {/* Section 4: Badges & Category Chips */}
        <section className="space-y-4">
          <PageHeader
            title="4. Status Badges & Horizontal Category Chips"
            subtitle="Semantic status indicators and horizontally scrollable category chips."
          />

          <div className="p-6 bg-white rounded-2xl border-2 border-border shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                Status Badges
              </h3>
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge status="free" />
                <StatusBadge status="occupied" pulse />
                <StatusBadge status="paid" />
                <StatusBadge status="open" />
                <StatusBadge status="available" />
                <StatusBadge status="unavailable" />
                <StatusBadge status="cancelled" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider mb-3">
                Category Chips Row (Swipeable on touch screens)
              </h3>
              <CategoryChips
                categories={MOCK_CATEGORIES}
                selectedId={selectedCategory}
                onSelect={setSelectedCategory}
                allCount={46}
              />
            </div>
          </div>
        </section>

        {/* Section 5: Table Cards */}
        <section className="space-y-4">
          <PageHeader
            title="5. Table Cards (Free vs Occupied)"
            subtitle="Strictly Green = Free, Red = Occupied. Large table number and occupancy timer."
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <TableCard
              number="01"
              capacity={2}
              status="free"
              onClick={() => alert("Tapped Free Table 01")}
            />
            <TableCard
              number="02"
              capacity={4}
              status="free"
              onClick={() => alert("Tapped Free Table 02")}
            />
            <TableCard
              number="03"
              capacity={4}
              status="occupied"
              amount={48.5}
              elapsedLabel="32m"
              onClick={() => alert("Tapped Occupied Table 03")}
            />
            <TableCard
              number="04"
              capacity={6}
              status="occupied"
              amount={124.0}
              elapsedLabel="1h 14m"
              onClick={() => alert("Tapped Occupied Table 04")}
            />
            <TableCard
              number="05"
              capacity={8}
              status="free"
              onClick={() => alert("Tapped Free Table 05")}
            />
            <TableCard
              number="06"
              capacity={2}
              status="occupied"
              amount={18.0}
              elapsedLabel="12m"
              onClick={() => alert("Tapped Occupied Table 06")}
            />
          </div>
        </section>

        {/* Section 6: Menu Item Cards */}
        <section className="space-y-4">
          <PageHeader
            title="6. Menu Dish Cards"
            subtitle="Full card tap target with image fallback, in-cart quantity badges, and disabled sold-out state."
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <MenuItemCard
              id="m1"
              name="Gulab Jamun (Warm)"
              price={6.5}
              cartQuantity={2}
              onClick={() => alert("Clicked Gulab Jamun")}
            />
            <MenuItemCard
              id="m2"
              name="Chicken Tikka Boti Platter"
              price={14.0}
              cartQuantity={1}
              onClick={() => alert("Clicked Chicken Tikka")}
            />
            <MenuItemCard
              id="m3"
              name="Butter Naan Basket"
              price={3.0}
              onClick={() => alert("Clicked Butter Naan")}
            />
            <MenuItemCard
              id="m4"
              name="Special Mutton Karahi"
              price={24.5}
              available={false}
              onClick={() => alert("Clicked unavailable item")}
            />
            <MenuItemCard
              id="m5"
              name="Mango Lassi Fresh"
              price={5.5}
              onClick={() => alert("Clicked Mango Lassi")}
            />
          </div>
        </section>

        {/* Section 7: Responsive Order Layout & Cart Panel */}
        <section className="space-y-4">
          <PageHeader
            title="7. OrderLayout (Split Screen on Landscape, Drawer on Portrait)"
            subtitle="Preview how waiters interact with dishes and side cart simultaneously on tablets."
          />

          <div className="h-[620px] rounded-2xl border-2 border-border overflow-hidden bg-white shadow-md">
            <OrderLayout
              tableLabel="Table 03"
              cartItemCount={mockCart.reduce((s, i) => s + i.qty, 0)}
              cartTotal={cartTotal}
              menuContent={
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-extrabold text-gray-900">Floor 1 Menu (HALAL)</h2>
                      <p className="text-xs text-muted-foreground">Tap any dish to add to order</p>
                    </div>
                    <div className="w-64 hidden sm:block">
                      <SearchInput value={searchQuery} onChange={setSearchQuery} />
                    </div>
                  </div>

                  <CategoryChips
                    categories={MOCK_CATEGORIES}
                    selectedId={selectedCategory}
                    onSelect={setSelectedCategory}
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    <MenuItemCard
                      id="m1"
                      name="Gulab Jamun"
                      price={6.5}
                      cartQuantity={2}
                      onClick={() => alert("Added Gulab Jamun")}
                    />
                    <MenuItemCard
                      id="m2"
                      name="Chicken Tikka"
                      price={14.0}
                      cartQuantity={1}
                      onClick={() => alert("Added Chicken Tikka")}
                    />
                    <MenuItemCard
                      id="m3"
                      name="Garlic Naan"
                      price={3.5}
                      cartQuantity={3}
                      onClick={() => alert("Added Garlic Naan")}
                    />
                    <MenuItemCard
                      id="m4"
                      name="Mango Lassi"
                      price={9.0}
                      cartQuantity={1}
                      onClick={() => alert("Added Mango Lassi")}
                    />
                    <MenuItemCard
                      id="m5"
                      name="Reshmi Kabab"
                      price={16.0}
                      onClick={() => alert("Added Reshmi Kabab")}
                    />
                    <MenuItemCard
                      id="m6"
                      name="Kheer Supreme"
                      price={7.5}
                      onClick={() => alert("Added Kheer")}
                    />
                  </div>
                </div>
              }
              cartContent={
                <CartPanel
                  tableNumber="03"
                  floorName="Floor 1"
                  draftItems={mockCart}
                  subtotal={cartSubtotal}
                  tax={cartTax}
                  total={cartTotal}
                  onUpdateQty={handleUpdateQty}
                  onRemove={handleRemoveCartItem}
                  onAddNote={handleAddNote}
                  onClearDraft={() => setMockCart([])}
                  footerActions={
                    <BottomActionBar
                      onSend={() => alert("Send to Kitchen clicked (will route Sweet / Spicy slips to separate printers)")}
                      onPay={() => alert("Pay / Bill clicked (will print bill slip)")}
                    />
                  }
                />
              }
            />
          </div>
        </section>

        {/* Section 8: Dialogs, Skeletons & Data Table */}
        <section className="space-y-4">
          <PageHeader
            title="8. Modals, Skeletons & Admin Data Table"
            subtitle="Pre-built components for admin lists, deletion confirmations, and network loading."
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stat Cards */}
            <StatCard
              label="Today's Total Sales"
              value="$1,428.50"
              subtext="vs yesterday"
              trend={{ value: 14.2, isPositive: true }}
              icon={DollarSign}
            />
            <StatCard
              label="Active Tables"
              value="8 / 14"
              subtext="57% occupancy rate"
              icon={Utensils}
            />
            <StatCard
              label="Kitchen Slips Sent"
              value="42"
              subtext="Avg prep time 14 mins"
              icon={Flame}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Skeletons Preview */}
            <div className="p-6 bg-white rounded-2xl border-2 border-border space-y-4">
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider">
                Skeletons (Loading Placeholders)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <TableCardSkeleton />
                <MenuItemSkeleton />
              </div>
            </div>

            {/* Dialog Trigger & Error State Preview */}
            <div className="p-6 bg-white rounded-2xl border-2 border-border space-y-4">
              <h3 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider">
                Confirmation Modals & Alerts
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="danger"
                  onClick={() => {
                    setDialogVariant("danger");
                    setConfirmOpen(true);
                  }}
                >
                  Trigger Danger Dialog
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setDialogVariant("primary");
                    setConfirmOpen(true);
                  }}
                >
                  Trigger Primary Dialog
                </Button>
              </div>

              <div className="pt-2">
                <EmptyState
                  title="No items found"
                  description="Try adjusting your category filter or search keywords."
                />
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="space-y-3 pt-4">
            <h3 className="text-base font-extrabold text-gray-900">
              Admin & Reports DataTable Example
            </h3>
            <DataTable
              columns={tableColumns}
              data={MOCK_REPORT_DATA}
              keyExtractor={(item) => item.id}
              pageSize={5}
              onRowClick={(row) => alert(`Clicked order ${row.orderNumber}`)}
            />
          </div>
        </section>

        {/* Interactive Confirm Dialog */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={dialogVariant === "danger" ? "Void Table Order?" : "Send Order to Kitchen?"}
          description={
            dialogVariant === "danger"
              ? "Are you sure you want to cancel this order? This action will mark items as voided and notify the manager."
              : "This will immediately route slips to the sweet and spicy kitchen printers over the local WiFi."
          }
          variant={dialogVariant}
          confirmLabel={dialogVariant === "danger" ? "Yes, Void Order" : "Send to Kitchen"}
          onConfirm={() => {
            alert("Action confirmed!");
            setConfirmOpen(false);
          }}
        />
      </div>
    </div>
  );
}

