import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "@/store/cartStore";
import type { MenuItem } from "@/types";

const mockMenu: MenuItem[] = [
  { id: "mi1", name: "Dish A", price: 300, categoryId: "c1", floorId: "f1", available: true, isActive: true, sortOrder: 1 },
  { id: "mi2", name: "Dish B", price: 500, categoryId: "c1", floorId: "f1", available: true, isActive: true, sortOrder: 2 },
];

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.setState({ drafts: {} });
  });

  it("adds an item to draft order with idempotency requestId", () => {
    useCartStore.getState().addItem("f1-t1", "mi1", 2);

    const draft = useCartStore.getState().getDraft("f1-t1");
    expect(draft).toBeDefined();
    expect(draft?.items).toHaveLength(1);
    expect(draft?.items[0]).toEqual({ menuItemId: "mi1", qty: 2 });
    expect(draft?.requestId).toBeTruthy();
  });

  it("calculates draft subtotal accurately based on menu prices", () => {
    useCartStore.getState().addItem("f1-t1", "mi1", 2); // 2 * 300 = 600
    useCartStore.getState().addItem("f1-t1", "mi2", 1); // 1 * 500 = 500

    const subtotal = useCartStore.getState().draftSubtotal("f1-t1", mockMenu);
    expect(subtotal).toBe(1100);
  });

  it("updates item quantity and removes item when set to 0", () => {
    useCartStore.getState().addItem("f1-t1", "mi1", 3);
    useCartStore.getState().setQty("f1-t1", "mi1", 5);
    expect(useCartStore.getState().draftItems("f1-t1")[0].qty).toBe(5);

    useCartStore.getState().setQty("f1-t1", "mi1", 0);
    expect(useCartStore.getState().draftItems("f1-t1")).toHaveLength(0);
  });

  it("clears a table draft cleanly", () => {
    useCartStore.getState().addItem("f1-t1", "mi1", 2);
    useCartStore.getState().clearDraft("f1-t1");
    expect(useCartStore.getState().hasDraft("f1-t1")).toBe(false);
  });
});

