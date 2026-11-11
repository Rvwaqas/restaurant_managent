"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  Copy,
  UtensilsCrossed,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  Tag,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdminPageHeader } from "../admin-page-header";
import { FloorSwitcher } from "../floor-switcher";
import { InlineSwitch } from "../inline-switch";
import { SortableCategoryRow } from "./sortable-category-row";
import { CategoryFormDialog } from "../category-form-dialog";
import { ItemFormDialog } from "../item-form-dialog";
import { DuplicateItemDialog } from "../duplicate-item-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import { useMenuStore, usePrintersStore } from "@/store";
import { formatMoney } from "@/utils/money";
import type { Category, MenuItem } from "@/types";
import { toast } from "sonner";

export function MenuManagement() {
  const [floorId, setFloorId] = useState<string>("f1");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [itemToDuplicate, setItemToDuplicate] = useState<MenuItem | null>(null);

  // Delete dialog states
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: "category" | "item" | "bulk_items";
    title: string;
    description: string;
    id?: string;
    name?: string;
  }>({
    open: false,
    type: "category",
    title: "",
    description: "",
  });

  // Stores
  const {
    fetchFloorMenu,
    getCategories,
    getItems,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createItem,
    updateItem,
    deleteItem,
    setAvailability,
    duplicateItem,
  } = useMenuStore();

  const { items: printers, fetchPrinters } = usePrintersStore();

  // Load menu & printers
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async (fId: string) => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchFloorMenu(fId, true),
        fetchPrinters(),
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load menu data");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFloorMenu, fetchPrinters]);

  useEffect(() => {
    loadData(floorId);
    setSelectedItemIds(new Set());
  }, [floorId, loadData]);

  const categories = getCategories(floorId);
  const allItems = getItems(floorId);

  // Auto-select first category if none selected
  useEffect(() => {
    if (categories.length > 0 && (!selectedCategoryId || !categories.some(c => c.id === selectedCategoryId))) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  // Printer map for lookup
  const printerMap = useMemo(() => {
    return new Map(printers.map((p) => [p.id, p]));
  }, [printers]);

  // Item count per category
  const itemCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      if (item.isActive !== false) {
        map.set(item.categoryId, (map.get(item.categoryId) || 0) + 1);
      }
    }
    return map;
  }, [allItems]);

  // Active category & items
  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId) || categories[0];
  }, [categories, selectedCategoryId]);

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (selectedCategoryId) {
      list = list.filter((item) => item.categoryId === selectedCategoryId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allItems, selectedCategoryId, searchQuery]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEndCategories = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(categories, oldIndex, newIndex);
      const orderedIds = reordered.map((c) => c.id);
      try {
        await reorderCategories(floorId, orderedIds);
        toast.success("Category order saved");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to reorder categories");
      }
    }
  };

  // Category Actions
  const handleSaveCategory = async (values: { name: string; printerId: string; isActive: boolean }) => {
    if (editingCategory) {
      await updateCategory(editingCategory.id, {
        name: values.name,
        printerId: values.printerId,
        isActive: values.isActive,
      });
      toast.success(`Category "${values.name}" updated`);
    } else {
      const created = await createCategory({
        floorId,
        name: values.name,
        printerId: values.printerId,
        isActive: values.isActive,
        sortOrder: categories.length + 1,
      });
      setSelectedCategoryId(created.id);
      toast.success(`Category "${values.name}" created`);
    }
  };

  const handleToggleCategoryActive = async (cat: Category, nextActive: boolean) => {
    await updateCategory(cat.id, { isActive: nextActive });
    toast.success(`Category "${cat.name}" is now ${nextActive ? "Active" : "Hidden"}`);
  };

  // Item Actions
  const handleSaveItem = async (values: {
    name: string;
    price: number;
    categoryId: string;
    description?: string | null;
    image?: string | null;
    available: boolean;
    isActive: boolean;
  }) => {
    if (editingItem) {
      await updateItem(editingItem.id, values);
      toast.success(`Dish "${values.name}" updated`);
    } else {
      await createItem({
        floorId,
        categoryId: values.categoryId,
        name: values.name,
        price: values.price,
        description: values.description,
        image: values.image,
        available: values.available,
        isActive: values.isActive,
        sortOrder: filteredItems.length + 1,
      });
      toast.success(`Dish "${values.name}" added`);
    }
  };

  const handleToggleItemAvailability = async (item: MenuItem, available: boolean) => {
    await setAvailability(item.id, floorId, available);
    toast.success(`"${item.name}" marked ${available ? "Available" : "Sold out"}`);
  };

  const handleToggleItemActive = async (item: MenuItem, isActive: boolean) => {
    await updateItem(item.id, { isActive });
    toast.success(`"${item.name}" is now ${isActive ? "Active" : "Hidden"}`);
  };

  // Duplicate Item
  const handleDuplicateConfirm = async (targetFloorId: string, targetCategoryId: string) => {
    if (!itemToDuplicate) return;
    await duplicateItem(itemToDuplicate.id, targetFloorId, targetCategoryId);
    toast.success(`"${itemToDuplicate.name}" duplicated to ${targetFloorId === "f1" ? "Floor 1" : "Floor 2"}`);
  };

  // Bulk selections
  const handleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleToggleItemSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAvailability = async (available: boolean) => {
    const ids = Array.from(selectedItemIds);
    try {
      await Promise.all(ids.map((id) => setAvailability(id, floorId, available)));
      toast.success(`${ids.length} dishes marked ${available ? "Available" : "Sold out"}`);
      setSelectedItemIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    }
  };

  // Delete Handlers
  const handleConfirmDelete = async () => {
    if (deleteDialog.type === "category" && deleteDialog.id) {
      const res = await deleteCategory(deleteDialog.id, floorId);
      if (res.softDeleted) {
        toast.info("Category has historical orders; marked inactive instead of deleted.");
      } else {
        toast.success("Category deleted");
      }
      if (selectedCategoryId === deleteDialog.id) {
        const remaining = categories.filter((c) => c.id !== deleteDialog.id);
        setSelectedCategoryId(remaining[0]?.id || null);
      }
    } else if (deleteDialog.type === "item" && deleteDialog.id) {
      const res = await deleteItem(deleteDialog.id, floorId);
      if (res.softDeleted) {
        toast.info("Dish is referenced in orders; marked inactive.");
      } else {
        toast.success("Dish deleted");
      }
    } else if (deleteDialog.type === "bulk_items") {
      const ids = Array.from(selectedItemIds);
      let softCount = 0;
      let hardCount = 0;
      for (const id of ids) {
        const res = await deleteItem(id, floorId);
        if (res.softDeleted) softCount++;
        else hardCount++;
      }
      toast.success(`Deleted ${hardCount} dish(es)${softCount > 0 ? `, ${softCount} deactivated due to order history` : ""}`);
      setSelectedItemIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        title="Menu Management"
        description="Organize categories and dishes per floor, assign kitchen thermal printers, and manage stock."
        actions={
          <div className="flex items-center gap-3">
            <FloorSwitcher
              currentFloorId={floorId}
              onFloorChange={(id) => setFloorId(id)}
            />
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCategoryDialogOpen(true);
              }}
              variant="outline"
              className="h-11 px-4 rounded-xl border-border bg-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Category
            </Button>
            <Button
              onClick={() => {
                setEditingItem(null);
                setItemDialogOpen(true);
              }}
              disabled={categories.length === 0}
              className="h-11 px-4 rounded-xl font-semibold bg-primary hover:bg-primary-hover text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Dish
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <span className="text-sm font-semibold">Loading floor menu data...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Categories List (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-border p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-gray-900">Food Categories</h2>
                <p className="text-xs text-muted-foreground">
                  Drag handles to reorder kitchen slip printing
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryDialogOpen(true);
                }}
                className="h-8 px-2.5 rounded-lg text-primary hover:bg-primary/10 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>

            {categories.length === 0 ? (
              <div className="text-center py-10 px-4 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <UtensilsCrossed className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-semibold text-gray-700">No categories yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Create a category (e.g. Sweet, Spicy, Drinks) to start adding dishes.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingCategory(null);
                    setCategoryDialogOpen(true);
                  }}
                  className="rounded-xl h-9 px-3 text-xs"
                >
                  Create First Category
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndCategories}
              >
                <SortableContext
                  items={categories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <SortableCategoryRow
                        key={category.id}
                        category={category}
                        isSelected={selectedCategoryId === category.id}
                        itemCount={itemCountMap.get(category.id) || 0}
                        printer={printerMap.get(category.printerId)}
                        onSelect={() => setSelectedCategoryId(category.id)}
                        onEdit={() => {
                          setEditingCategory(category);
                          setCategoryDialogOpen(true);
                        }}
                        onDelete={() => {
                          setDeleteDialog({
                            open: true,
                            type: "category",
                            id: category.id,
                            name: category.name,
                            title: `Delete Category "${category.name}"?`,
                            description:
                              "Deleting a category is only permitted if it contains no active menu items. If historical orders exist, it will be deactivated.",
                          });
                        }}
                        onToggleActive={(nextActive) =>
                          handleToggleCategoryActive(category, nextActive)
                        }
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Right Column: Menu Items Grid / Table (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-border p-5 shadow-sm space-y-4">
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">
                  {activeCategory ? activeCategory.name : "All Dishes"}
                </h2>
                <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {filteredItems.length} {filteredItems.length === 1 ? "dish" : "dishes"}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {/* Search Input */}
                <div className="relative min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search dishes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 pl-9 pr-3 text-xs rounded-xl"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center p-1 bg-gray-100 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === "grid"
                        ? "bg-white text-primary shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    title="Grid view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === "table"
                        ? "bg-white text-primary shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    title="Table view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedItemIds.size > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-bold text-primary">
                  <CheckSquare className="w-4 h-4" />
                  <span>{selectedItemIds.size} dish(es) selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAvailability(true)}
                    className="h-8 text-xs rounded-lg bg-white"
                  >
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Mark Available
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAvailability(false)}
                    className="h-8 text-xs rounded-lg bg-white"
                  >
                    <X className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Mark Sold Out
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setDeleteDialog({
                        open: true,
                        type: "bulk_items",
                        title: `Delete ${selectedItemIds.size} selected dishes?`,
                        description:
                          "Dishes referenced in existing orders will be marked inactive. Unused dishes will be permanently removed.",
                      });
                    }}
                    className="h-8 text-xs rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete Selected
                  </Button>
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <UtensilsCrossed className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p className="text-base font-semibold text-gray-700">No dishes found</p>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                  {searchQuery
                    ? `No dish matches "${searchQuery}" in this category.`
                    : "This category does not have any dishes yet."}
                </p>
                <Button
                  onClick={() => {
                    setEditingItem(null);
                    setItemDialogOpen(true);
                  }}
                  className="rounded-xl h-10 px-4 text-xs font-semibold"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add First Dish
                </Button>
              </div>
            ) : viewMode === "grid" ? (
              /* Grid Cards View */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredItems.map((item) => {
                  const isSelected = selectedItemIds.has(item.id);
                  return (
                    <Card
                      key={item.id}
                      className={`overflow-hidden rounded-xl border transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/20 shadow-md"
                          : "border-border hover:border-gray-300 shadow-sm"
                      } ${!item.isActive ? "opacity-60 bg-gray-50" : "bg-white"}`}
                    >
                      <div className="relative h-36 w-full bg-gray-100">
                        {item.image ? (
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="300px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <UtensilsCrossed className="w-10 h-10" />
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleItemSelect(item.id)}
                            className="w-7 h-7 rounded-lg bg-white/90 text-gray-700 flex items-center justify-center hover:bg-white shadow-sm"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          {!item.isActive && (
                            <span className="px-2 py-0.5 rounded-md bg-gray-900/80 text-white text-[10px] font-bold uppercase">
                              Hidden
                            </span>
                          )}
                        </div>

                        {/* Sold out overlay */}
                        {!item.available && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="px-3 py-1 bg-amber-500 text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-md">
                              Sold Out
                            </span>
                          </div>
                        )}
                      </div>

                      <CardContent className="p-3.5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-gray-900 truncate" title={item.name}>
                              {item.name}
                            </h3>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <span className="font-mono font-bold text-sm text-primary shrink-0 tabular-nums">
                            {formatMoney(item.price)}
                          </span>
                        </div>

                        {/* Toggles */}
                        <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                          <InlineSwitch
                            checked={item.available}
                            onToggle={(avail) => handleToggleItemAvailability(item, avail)}
                            activeLabel="Available"
                            inactiveLabel="Sold out"
                          />

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setItemToDuplicate(item);
                                setDuplicateDialogOpen(true);
                              }}
                              className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
                              title="Duplicate to other floor"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingItem(item);
                                setItemDialogOpen(true);
                              }}
                              className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
                              title="Edit dish"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteDialog({
                                  open: true,
                                  type: "item",
                                  id: item.id,
                                  name: item.name,
                                  title: `Delete Dish "${item.name}"?`,
                                  description:
                                    "If this dish has order history, it will be marked inactive to protect previous financial records.",
                                });
                              }}
                              className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                              title="Delete dish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-border text-gray-500 font-semibold uppercase">
                    <tr>
                      <th className="p-3 w-10">
                        <button
                          type="button"
                          onClick={handleSelectAll}
                          className="flex items-center justify-center text-gray-600"
                        >
                          {selectedItemIds.size === filteredItems.length ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="p-3">Dish</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Stock Status</th>
                      <th className="p-3">POS Visibility</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map((item) => {
                      const isSelected = selectedItemIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-gray-50/60 transition-colors ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => handleToggleItemSelect(item.id)}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden relative shrink-0">
                                {item.image ? (
                                  <Image
                                    src={item.image}
                                    alt={item.name}
                                    fill
                                    sizes="40px"
                                    className="object-cover"
                                    unoptimized
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                                    <UtensilsCrossed className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="font-bold text-gray-900 block">
                                  {item.name}
                                </span>
                                {item.description && (
                                  <span className="text-muted-foreground text-[11px] block truncate max-w-xs">
                                    {item.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-mono font-bold text-gray-900 tabular-nums">
                            {formatMoney(item.price)}
                          </td>
                          <td className="p-3">
                            <InlineSwitch
                              checked={item.available}
                              onToggle={(avail) => handleToggleItemAvailability(item, avail)}
                              activeLabel="Available"
                              inactiveLabel="Sold out"
                            />
                          </td>
                          <td className="p-3">
                            <InlineSwitch
                              checked={item.isActive}
                              onToggle={(act) => handleToggleItemActive(item, act)}
                              activeLabel="Visible"
                              inactiveLabel="Hidden"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setItemToDuplicate(item);
                                  setDuplicateDialogOpen(true);
                                }}
                                className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
                                title="Duplicate to other floor"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingItem(item);
                                  setItemDialogOpen(true);
                                }}
                                className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-gray-900"
                                title="Edit dish"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeleteDialog({
                                    open: true,
                                    type: "item",
                                    id: item.id,
                                    name: item.name,
                                    title: `Delete Dish "${item.name}"?`,
                                    description:
                                      "If this dish has order history, it will be marked inactive to protect previous financial records.",
                                  });
                                }}
                                className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                                title="Delete dish"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Dialog */}
      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        floorId={floorId}
        printers={printers}
        onSubmit={handleSaveCategory}
      />

      {/* Item Dialog */}
      <ItemFormDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        floorId={floorId}
        categories={categories}
        onSubmit={handleSaveItem}
      />

      {/* Duplicate Item Dialog */}
      <DuplicateItemDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        item={itemToDuplicate}
        currentFloorId={floorId}
        onConfirm={handleDuplicateConfirm}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
        title={deleteDialog.title}
        description={deleteDialog.description}
        itemName={deleteDialog.name}
        isSoftDeleteWarning={true}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
