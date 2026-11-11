"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users, DollarSign } from "lucide-react";
import type { Floor, Table, MenuItem, PayResult, PayRequest } from "@/types";
import {
  useMenuStore,
  useCartStore,
  useOrderStore,
  useAuthStore,
  useTablesStore,
} from "@/store";
import { ordersService } from "@/lib/api/services";
import { OrderLayout } from "@/components/layout/order-layout";
import { CategoryChips } from "@/components/menu/category-chips";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { ItemOptionsDialog } from "@/components/menu/item-options-dialog";
import { CartPanel, type BatchGroup } from "@/components/cart/cart-panel";
import type { CartLineItem } from "@/components/cart/cart-line";
import { BottomActionBar } from "@/components/cart/bottom-action-bar";
import { SendResultSheet } from "@/components/cart/send-result-sheet";
import { PaymentSheet } from "@/components/cart/payment-sheet";
import { PaymentResultSheet } from "@/components/cart/payment-result-sheet";
import { KitchenSlipModal, type SlipData } from "@/components/slips/kitchen-slip-modal";
import { BillSlipModal } from "@/components/slips/bill-slip-modal";
import { UnsentItemsDialog } from "@/components/orders/unsent-items-dialog";
import { VoidItemDialog } from "@/components/orders/void-item-dialog";
import { TableAlreadyPaidDialog } from "@/components/orders/table-already-paid-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatMoney } from "@/utils/money";
import type { SendResult } from "@/types";

interface OrderScreenClientProps {
  floor: Floor;
  table: Table;
}

export function OrderScreenClient({ floor, table }: OrderScreenClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { upsertTable } = useTablesStore();
  const isAdmin = user?.role === "admin";

  // Stores
  const { fetchFloorMenu, getCategories, getItems } = useMenuStore();

  const {
    drafts,
    addItem,
    setQty,
    removeItem,
    restoreItem,
    setNote,
    clearDraft,
    hasDraft,
    draftSubtotal,
  } = useCartStore();

  const {
    order: openOrder,
    load: loadOrder,
    silentRefresh,
    applySendResult,
    pay: processPayment,
    voidItem: processVoidItem,
    clear: clearOrderStore,
    isPaidElsewhere,
  } = useOrderStore();

  // Local UI State
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);

  // Dialog & Sheet States
  const [customizingItem, setCustomizingItem] = React.useState<MenuItem | null>(null);
  const [sendResult, setSendResult] = React.useState<SendResult | null>(null);
  const [sendResultSheetOpen, setSendResultSheetOpen] = React.useState(false);
  const [kitchenSlipModalOpen, setKitchenSlipModalOpen] = React.useState(false);
  const [unsentDialogOpen, setUnsentDialogOpen] = React.useState(false);
  const [discardDraftConfirmOpen, setDiscardDraftConfirmOpen] = React.useState(false);

  // Payment states (Task F6)
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);
  const [payResult, setPayResult] = React.useState<PayResult | null>(null);
  const [paymentResultSheetOpen, setPaymentResultSheetOpen] = React.useState(false);
  const [billSlipModalOpen, setBillSlipModalOpen] = React.useState(false);

  // Void item state (Admin only)
  const [voidDialogOpen, setVoidDialogOpen] = React.useState(false);
  const [voidTargetItem, setVoidTargetItem] = React.useState<{ id: string; name: string } | null>(null);

  // External payment safety state
  const [tablePaidExternally, setTablePaidExternally] = React.useState(false);
  const hadOpenOrderRef = React.useRef(false);
  const payResultRef = React.useRef(false);

  // 1. Fetch menu and initial open order on mount
  React.useEffect(() => {
    fetchFloorMenu(floor.id);
    loadOrder(table.id).then((ord) => {
      if (ord && ord.status === "open") {
        hadOpenOrderRef.current = true;
      }
    });

    // Silent background poll every 10 seconds
    const interval = setInterval(async () => {
      // Don't trigger "table paid externally" if the order was just paid on this client
      if (payResultRef.current) return;
      const refreshed = await ordersService.getOpenByTable(table.id);
      if (hadOpenOrderRef.current && (!refreshed || refreshed.status === "paid")) {
        setTablePaidExternally(true);
      } else {
        silentRefresh(table.id);
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      clearOrderStore();
    };
  }, [floor.id, table.id, fetchFloorMenu, loadOrder, silentRefresh, clearOrderStore]);

  React.useEffect(() => {
    if (openOrder && openOrder.status === "open") {
      hadOpenOrderRef.current = true;
    }
  }, [openOrder]);

  // Derived menu lists
  const categories = getCategories(floor.id);
  const allMenuItems = getItems(floor.id);

  // Lookup map of menu items by ID for fast lookup
  const menuItemMap = React.useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of allMenuItems) {
      map.set(item.id, item);
    }
    return map;
  }, [allMenuItems]);

  // Filtered menu items
  const filteredMenuItems = React.useMemo(() => {
    return allMenuItems.filter((item) => {
      if (selectedCategoryId !== "all" && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) {
          return false;
        }
      }
      return true;
    });
  }, [allMenuItems, selectedCategoryId, searchQuery]);

  // Draft items for this table
  const tableDraft = drafts[table.id];
  const currentDraftItems = React.useMemo(
    () => tableDraft?.items || [],
    [tableDraft?.items]
  );

  // Map draft items to CartLineItems
  const cartDraftLines: CartLineItem[] = React.useMemo(() => {
    return currentDraftItems.map((draft) => {
      const menuItem = menuItemMap.get(draft.menuItemId);
      return {
        id: draft.menuItemId,
        name: menuItem?.name || "Dish",
        price: menuItem?.price || 0,
        qty: draft.qty,
        note: draft.note,
        categoryName: categories.find((c) => c.id === menuItem?.categoryId)?.name,
      };
    });
  }, [currentDraftItems, menuItemMap, categories]);

  // Group already sent order items by batch
  const sentBatches: BatchGroup[] = React.useMemo(() => {
    if (!openOrder || !openOrder.items || openOrder.items.length === 0) {
      return [];
    }

    const batchesMap = new Map<number, { sentAt?: string; items: CartLineItem[] }>();

    for (const item of openOrder.items) {
      const batchNo = item.batchNo || 1;
      if (!batchesMap.has(batchNo)) {
        batchesMap.set(batchNo, {
          sentAt: item.sentAt,
          items: [],
        });
      }

      batchesMap.get(batchNo)!.items.push({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        note: item.note,
        batchNo: item.batchNo,
        sentAt: item.sentAt,
        voided: item.voided,
        voidReason: item.voidReason,
        readOnly: true,
      });
    }

    return Array.from(batchesMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([batchNo, data]) => ({
        batchNo,
        sentAt: data.sentAt,
        items: data.items,
      }));
  }, [openOrder]);

  // Calculate totals
  const draftTotalAmount = draftSubtotal(table.id, allMenuItems);
  const openOrderSubtotal = openOrder?.subtotal || 0;
  const openOrderTax = openOrder?.tax || 0;
  const openOrderServiceCharge = openOrder?.serviceCharge || 0;
  const openOrderDiscount = openOrder?.discount || 0;

  const combinedSubtotal = openOrderSubtotal + draftTotalAmount;
  const combinedTotal = (openOrder?.total || 0) + draftTotalAmount;
  const totalItemCount =
    cartDraftLines.reduce((s, it) => s + it.qty, 0) +
    sentBatches.reduce((s, b) => s + b.items.reduce((si, i) => si + i.qty, 0), 0);

  // Can Pay derived rule: order is open, at least 1 non-voided item, and 0 draft items
  const activeSentItemsCount = (openOrder?.items || []).filter((i) => !i.voided).length;
  const canPay = Boolean(
    openOrder &&
    openOrder.status === "open" &&
    activeSentItemsCount > 0 &&
    cartDraftLines.length === 0
  );

  // Handlers
  const handleDirectAdd = (item: MenuItem) => {
    addItem(table.id, item.id, 1);
  };

  const handleOpenCustomize = (item: MenuItem) => {
    setCustomizingItem(item);
  };

  const handleConfirmCustomize = (qty: number, note: string) => {
    if (!customizingItem) return;
    const existing = currentDraftItems.find((i) => i.menuItemId === customizingItem.id);
    if (existing) {
      setQty(table.id, customizingItem.id, qty);
      setNote(table.id, customizingItem.id, note);
    } else {
      addItem(table.id, customizingItem.id, qty, note);
    }
  };

  const handleUpdateQty = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      const removed = removeItem(table.id, itemId);
      if (removed) {
        const itemInfo = menuItemMap.get(itemId);
        toast({
          title: `${itemInfo?.name || "Item"} removed`,
          description: "Removed from draft cart.",
          action: (
            <button
              onClick={() => restoreItem(table.id, removed)}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
            >
              Undo
            </button>
          ),
        });
      }
    } else {
      setQty(table.id, itemId, newQty);
    }
  };

  const handleRemoveDraftItem = (itemId: string) => {
    const removed = removeItem(table.id, itemId);
    if (removed) {
      const itemInfo = menuItemMap.get(itemId);
      toast({
        title: `${itemInfo?.name || "Item"} removed`,
        description: "Removed from draft cart.",
        action: (
          <button
            onClick={() => restoreItem(table.id, removed)}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
          >
            Undo
          </button>
        ),
      });
    }
  };

  const handleAddNote = (itemId: string, noteText: string) => {
    setNote(table.id, itemId, noteText);
  };

  const handleClearDraft = () => {
    clearDraft(table.id);
    toast({
      title: "Draft cleared",
      description: "Unsent items were removed from this table's cart.",
    });
  };

  const handleBack = () => {
    if (hasDraft(table.id)) {
      setUnsentDialogOpen(true);
    } else {
      router.push(`/${floor.slug}`);
    }
  };

  const handleKeepDraftAndLeave = () => {
    setUnsentDialogOpen(false);
    router.push(`/${floor.slug}`);
  };

  const handleDiscardDraftAndLeave = () => {
    clearDraft(table.id);
    setUnsentDialogOpen(false);
    router.push(`/${floor.slug}`);
  };

  // Send action to Kitchen
  const handleSendToKitchen = async () => {
    if (cartDraftLines.length === 0 || isSending) return;

    setIsSending(true);
    try {
      const payload = {
        tableId: table.id,
        requestId: tableDraft.requestId,
        items: currentDraftItems.map((d) => ({
          menuItemId: d.menuItemId,
          qty: d.qty,
          note: d.note,
        })),
      };

      const result = await ordersService.sendItems(payload);

      applySendResult(result);
      clearDraft(table.id);

      upsertTable({
        ...table,
        status: "occupied",
        currentOrderId: result.order.id,
        runningTotal: result.order.total,
        openedAt: result.order.createdAt,
      });

      setSendResult(result);
      setSendResultSheetOpen(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send order to kitchen.";
      toast({
        variant: "destructive",
        title: "Send Error",
        description: message,
      });
    } finally {
      setIsSending(false);
    }
  };

  // Payment triggers (Task F6)
  const handleOpenPaySheet = () => {
    if (!openOrder) return;
    setPaymentSheetOpen(true);
  };

  const handleConfirmPay = async (payload: PayRequest) => {
    payResultRef.current = true;
    const result = await processPayment(payload);

    // Free table locally
    upsertTable({
      ...table,
      status: "free",
      currentOrderId: undefined,
      runningTotal: 0,
      openedAt: undefined,
    });

    // Clear draft if any leftover
    clearDraft(table.id);

    setPayResult(result);
    setPaymentSheetOpen(false);
    setPaymentResultSheetOpen(true);
  };

  // Admin Void Item triggers (Task F6)
  const handleInitiateVoidItem = (itemId: string) => {
    const item = openOrder?.items?.find((i) => i.id === itemId);
    if (!item) return;
    setVoidTargetItem({ id: item.id, name: item.name });
    setVoidDialogOpen(true);
  };

  const handleConfirmVoidItem = async (reason: string) => {
    if (!openOrder || !voidTargetItem) return;

    try {
      const result = await processVoidItem({
        orderId: openOrder.id,
        orderItemId: voidTargetItem.id,
        reason,
        requestId: `void-${Date.now()}`,
      });

      upsertTable({
        ...table,
        runningTotal: result.order.total,
      });

      toast({
        title: "Item Cancelled",
        description: `Cancelled ${voidTargetItem.name}. Kitchen station alerted.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to void item";
      toast({
        variant: "destructive",
        title: "Void Error",
        description: msg,
      });
    }
  };

  // Kitchen slip data
  const slipsData: SlipData[] = React.useMemo(() => {
    if (!sendResult) return [];

    const categorySlipsMap = new Map<string, SlipData>();
    const batchItems = sendResult.order.items.filter(
      (it) => it.batchNo === sendResult.batchNo
    );

    for (const item of batchItems) {
      const catId = item.categoryId || "general";
      const catName = categories.find((c) => c.id === catId)?.name || "Kitchen";
      const job = sendResult.printJobs.find((pj) => pj.categoryId === catId);

      if (!categorySlipsMap.has(catId)) {
        categorySlipsMap.set(catId, {
          categoryId: catId,
          categoryName: catName,
          printerName: job?.printerName || "Network Printer",
          items: [],
        });
      }

      categorySlipsMap.get(catId)!.items.push({
        name: item.name,
        qty: item.qty,
        note: item.note,
      });
    }

    return Array.from(categorySlipsMap.values());
  }, [sendResult, categories]);

  // Bill slip data (for paid order or preview)
  const currentBillOrder = payResult?.order || openOrder;
  const billSlipItems = React.useMemo(() => {
    if (!currentBillOrder) return [];
    const active = (currentBillOrder.items || []).filter((i) => !i.voided);
    const map = new Map<string, { name: string; qty: number; price: number }>();

    for (const item of active) {
      const existing = map.get(item.name);
      if (existing) {
        existing.qty += item.qty;
      } else {
        map.set(item.name, {
          name: item.name,
          qty: item.qty,
          price: item.price,
        });
      }
    }
    return Array.from(map.values());
  }, [currentBillOrder]);

  const isTableOccupied = table.status === "occupied" || Boolean(openOrder && openOrder.status === "open");

  // ── Left Column: Menu Catalog ──
  const menuContent = (
    <div className="space-y-4">
      {/* Top Bar with Back button and Table info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="md"
            onClick={handleBack}
            className="font-bold border-2"
          >
            <ArrowLeft className="w-5 h-5 mr-1.5" />
            <span>Tables</span>
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight font-mono">
                Table {table.number}
              </h2>
              <StatusBadge status={isTableOccupied ? "occupied" : "free"} />
            </div>
            <p className="text-xs text-muted-foreground">
              {floor.name} &bull; {floor.menuType.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs">
            <Users className="w-4 h-4 text-gray-500" />
            <span>Seats {table.capacity}</span>
          </div>

          {isTableOccupied && openOrder && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-950 border border-red-200 font-bold text-xs">
              <DollarSign className="w-4 h-4 text-red-600" />
              <span>Bill: {formatMoney(openOrder.total)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search Input */}
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search dishes by name or ingredients..."
        className="max-w-xl"
      />

      {/* Category Chips */}
      <CategoryChips
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={setSelectedCategoryId}
      />

      {/* Dishes Grid */}
      {filteredMenuItems.length === 0 ? (
        <EmptyState
          title="No dishes found"
          description={
            searchQuery
              ? `No dishes matching "${searchQuery}" in this category.`
              : "No dishes available in this category."
          }
          action={
            (selectedCategoryId !== "all" || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedCategoryId("all");
                  setSearchQuery("");
                }}
                className="font-bold"
              >
                Reset Filters
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredMenuItems.map((item) => {
            const draftEntry = currentDraftItems.find((d) => d.menuItemId === item.id);
            const cartQty = draftEntry?.qty || 0;

            return (
              <MenuItemCard
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                image={item.image}
                subcategory={item.subcategory}
                available={item.available}
                cartQuantity={cartQty}
                onClick={() => handleDirectAdd(item)}
                onOptionsClick={() => handleOpenCustomize(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Right Column / Drawer: Cart Panel ──
  const cartContent = (
    <CartPanel
      tableNumber={table.number}
      floorName={floor.name}
      draftItems={cartDraftLines}
      sentBatches={sentBatches}
      subtotal={combinedSubtotal}
      tax={openOrderTax}
      serviceCharge={openOrderServiceCharge}
      discount={openOrderDiscount}
      total={combinedTotal}
      draftSubtotal={draftTotalAmount}
      isAdmin={isAdmin}
      onVoidItem={handleInitiateVoidItem}
      onUpdateQty={handleUpdateQty}
      onRemove={handleRemoveDraftItem}
      onAddNote={handleAddNote}
      onClearDraft={handleClearDraft}
      hintAboveActions={
        openOrder &&
        openOrder.status === "open" &&
        cartDraftLines.length > 0 ? (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs">
            <span>Send or discard new items before paying</span>
            <button
              type="button"
              onClick={() => setDiscardDraftConfirmOpen(true)}
              className="text-amber-800 underline font-black hover:text-amber-950 shrink-0"
            >
              Discard items
            </button>
          </div>
        ) : null
      }
      footerActions={
        <BottomActionBar
          onSend={handleSendToKitchen}
          onPay={handleOpenPaySheet}
          sendDisabled={cartDraftLines.length === 0 || isSending}
          payDisabled={!canPay}
          sendLoading={isSending}
          sendLabel={`Send to Kitchen (${cartDraftLines.reduce((s, it) => s + it.qty, 0)})`}
          payLabel="Pay / Bill"
        />
      }
    />
  );

  return (
    <>
      <OrderLayout
        menuContent={menuContent}
        cartContent={cartContent}
        cartItemCount={totalItemCount}
        cartTotal={combinedTotal}
        tableLabel={`Table ${table.number}`}
      />

      {/* Item Options / Customization Dialog */}
      <ItemOptionsDialog
        open={Boolean(customizingItem)}
        item={customizingItem}
        initialQty={
          customizingItem
            ? currentDraftItems.find((d) => d.menuItemId === customizingItem.id)?.qty || 1
            : 1
        }
        initialNote={
          customizingItem
            ? currentDraftItems.find((d) => d.menuItemId === customizingItem.id)?.note || ""
            : ""
        }
        onClose={() => setCustomizingItem(null)}
        onConfirm={handleConfirmCustomize}
      />

      {/* Send Result Sheet */}
      <SendResultSheet
        open={sendResultSheetOpen}
        result={sendResult}
        tableNumber={table.number}
        floorSlug={floor.slug}
        floorName={floor.name}
        onClose={() => setSendResultSheetOpen(false)}
        onBackToTables={() => {
          setSendResultSheetOpen(false);
          router.push(`/${floor.slug}`);
        }}
        onPreviewSlip={() => setKitchenSlipModalOpen(true)}
      />

      {/* Kitchen Slip Preview Modal */}
      <KitchenSlipModal
        open={kitchenSlipModalOpen}
        onClose={() => setKitchenSlipModalOpen(false)}
        tableNumber={table.number}
        floorName={floor.name}
        waiterName={user?.name || "Staff Waiter"}
        batchNo={sendResult?.batchNo || 1}
        timestamp={sendResult?.order.createdAt}
        slips={slipsData}
      />

      {/* Unsaved Items Exit Dialog */}
      <UnsentItemsDialog
        open={unsentDialogOpen}
        onOpenChange={setUnsentDialogOpen}
        tableNumber={table.number}
        itemCount={cartDraftLines.reduce((s, it) => s + it.qty, 0)}
        onKeepDraft={handleKeepDraftAndLeave}
        onDiscardDraft={handleDiscardDraftAndLeave}
        onStay={() => setUnsentDialogOpen(false)}
      />

      {/* Discard Draft Confirmation Dialog */}
      <ConfirmDialog
        open={discardDraftConfirmOpen}
        onOpenChange={setDiscardDraftConfirmOpen}
        title="Discard New Unsent Items?"
        description="All new items added to the draft cart will be cleared so you can settle the bill for already sent items."
        confirmLabel="Discard Items"
        cancelLabel="Keep Items"
        variant="danger"
        onConfirm={() => {
          clearDraft(table.id);
          setDiscardDraftConfirmOpen(false);
          toast({
            title: "Draft discarded",
            description: "You can now proceed to settle the bill.",
          });
        }}
      />

      {/* Payment Sheet (Task F6) */}
      {openOrder && (
        <PaymentSheet
          open={paymentSheetOpen}
          order={openOrder}
          tableNumber={table.number}
          floorName={floor.name}
          isAdmin={isAdmin}
          onClose={() => setPaymentSheetOpen(false)}
          onConfirmPay={handleConfirmPay}
        />
      )}

      {/* Payment Result Sheet (Task F6) */}
      <PaymentResultSheet
        open={paymentResultSheetOpen}
        result={payResult}
        tableNumber={table.number}
        floorSlug={floor.slug}
        floorName={floor.name}
        onClose={() => setPaymentResultSheetOpen(false)}
        onBackToTables={() => {
          setPaymentResultSheetOpen(false);
          router.push(`/${floor.slug}`);
        }}
        onPreviewBill={() => setBillSlipModalOpen(true)}
      />

      {/* Bill Slip Modal Preview (Task F6) */}
      {currentBillOrder && (
        <BillSlipModal
          open={billSlipModalOpen}
          onClose={() => setBillSlipModalOpen(false)}
          tableNumber={table.number}
          floorName={floor.name}
          billNo={currentBillOrder.billNo || "B-0001"}
          waiterName={user?.name || "Staff"}
          timestamp={currentBillOrder.paidAt || currentBillOrder.createdAt}
          items={billSlipItems}
          subtotal={currentBillOrder.subtotal}
          serviceCharge={currentBillOrder.serviceCharge}
          tax={currentBillOrder.tax}
          discount={currentBillOrder.discount}
          total={currentBillOrder.total}
          paymentMethod={currentBillOrder.paymentMethod}
          amountReceived={currentBillOrder.amountReceived}
          changeDue={currentBillOrder.changeDue}
        />
      )}

      {/* Admin Void Item Dialog (Task F6) */}
      <VoidItemDialog
        open={voidDialogOpen}
        itemName={voidTargetItem?.name}
        onClose={() => {
          setVoidDialogOpen(false);
          setVoidTargetItem(null);
        }}
        onConfirmVoid={handleConfirmVoidItem}
      />

      {/* External Device Payment Alert (Task F6 Safety) */}
      <TableAlreadyPaidDialog
        open={tablePaidExternally || isPaidElsewhere}
        tableNumber={table.number}
        floorSlug={floor.slug}
        onBackToTables={() => router.push(`/${floor.slug}`)}
      />
    </>
  );
}
