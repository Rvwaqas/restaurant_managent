"use client"

import React, { useState } from "react"
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  UtensilsCrossed,
  Check,
  X,
  AlertCircle,
  Sparkles,
  DollarSign,
  Tag,
  ImageIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useRestaurant } from "@/hooks/use-restaurant-data"
import type { MenuItem } from "@/types/restaurant"

const SAMPLE_IMAGES = [
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400&h=300&fit=crop",
  "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop",
]

const DEFAULT_CATEGORIES = [
  "All",
  "Main Course",
  "Burgers",
  "Beverages",
  "Desserts",
  "Soups",
  "Pasta",
  "Breakfast",
]

export default function MenuItemsPage() {
  const { state, dispatch } = useRestaurant()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Form State
  const [formData, setFormData] = useState<{
    name: string
    price: string
    category: string
    customCategory: string
    type: "Veg" | "Non Veg"
    discount: string
    image: string
    available: boolean
  }>({
    name: "",
    price: "",
    category: "Main Course",
    customCategory: "",
    type: "Non Veg",
    discount: "0",
    image: SAMPLE_IMAGES[0],
    available: true,
  })

  // Derive dynamic list of categories from existing menu items
  const allCategories = Array.from(
    new Set(["All", ...DEFAULT_CATEGORIES.slice(1), ...state.menuItems.map((m) => m.category)])
  )

  // Filter items
  const filteredItems = state.menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory =
      selectedCategory === "All" || item.category.toLowerCase() === selectedCategory.toLowerCase()
    return matchesSearch && matchesCategory
  })

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingItem(null)
    setFormData({
      name: "",
      price: "",
      category: "Main Course",
      customCategory: "",
      type: "Non Veg",
      discount: "0",
      image: SAMPLE_IMAGES[Math.floor(Math.random() * SAMPLE_IMAGES.length)],
      available: true,
    })
    setIsModalOpen(true)
  }

  // Open Edit Modal
  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      price: item.price.toString(),
      category: item.category,
      customCategory: "",
      type: item.type,
      discount: item.discount ? item.discount.toString() : "0",
      image: item.image || SAMPLE_IMAGES[0],
      available: item.available,
    })
    setIsModalOpen(true)
  }

  // Save Dish (Add or Edit)
  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim() || !formData.price || parseFloat(formData.price) <= 0) {
      alert("Please enter a valid dish name and price.")
      return
    }

    const finalCategory =
      formData.category === "Custom"
        ? formData.customCategory.trim() || "General"
        : formData.category

    const parsedPrice = parseFloat(formData.price)
    const parsedDiscount = parseFloat(formData.discount) || 0

    if (editingItem) {
      // Update
      const updated: MenuItem = {
        ...editingItem,
        name: formData.name.trim(),
        price: parsedPrice,
        category: finalCategory,
        type: formData.type,
        discount: parsedDiscount > 0 ? parsedDiscount : undefined,
        image: formData.image.trim() || "/placeholder.svg",
        available: formData.available,
      }
      dispatch({ type: "UPDATE_MENU_ITEM", payload: updated })
    } else {
      // Add New
      const newItem: MenuItem = {
        id: Date.now().toString(),
        name: formData.name.trim(),
        price: parsedPrice,
        category: finalCategory,
        type: formData.type,
        discount: parsedDiscount > 0 ? parsedDiscount : undefined,
        image: formData.image.trim() || "/placeholder.svg",
        available: formData.available,
      }
      dispatch({ type: "ADD_MENU_ITEM", payload: newItem })
    }

    setIsModalOpen(false)
  }

  // Delete Dish
  const handleDeleteDish = (id: string) => {
    dispatch({ type: "DELETE_MENU_ITEM", payload: id })
    setDeleteConfirmId(null)
  }

  // Toggle Stock Availability
  const handleToggleAvailability = (id: string) => {
    dispatch({ type: "TOGGLE_MENU_ITEM_AVAILABILITY", payload: id })
  }

  const totalDishes = state.menuItems.length
  const availableDishes = state.menuItems.filter((i) => i.available).length
  const outOfStockDishes = totalDishes - availableDishes

  return (
    <main className="flex-1 overflow-auto p-4">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-3">
              <UtensilsCrossed className="h-7 w-7 text-green-600" />
              Menu Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Add new dishes, update rates, and manage daily item stock availability.
            </p>
          </div>

          <Button
            onClick={handleOpenAddModal}
            className="bg-green-600 hover:bg-green-700 text-white shadow-md rounded-xl px-5 py-2.5 font-semibold flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Add New Dish
          </Button>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Menu Dishes
              </p>
              <p className="text-2xl font-black text-gray-900 mt-1">{totalDishes}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              {totalDishes}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">
                Active / Available
              </p>
              <p className="text-2xl font-black text-green-700 mt-1">{availableDishes}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold">
              {availableDishes}
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">
                Out of Stock
              </p>
              <p className="text-2xl font-black text-red-600 mt-1">{outOfStockDishes}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
              {outOfStockDishes}
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white p-4 rounded-2xl border shadow-sm space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search dish by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 rounded-xl bg-gray-50 border-gray-200 text-base"
            />
          </div>

          {/* Categories Chips */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {allCategories.map((cat) => {
              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase()
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? "bg-green-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dish List Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border">
            <UtensilsCrossed className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800">No dishes found</h3>
            <p className="text-sm text-gray-500 mt-1">
              Try searching another dish or click &quot;Add New Dish&quot; above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const discountedPrice = item.discount
                ? item.price * (1 - item.discount / 100)
                : item.price

              return (
                <Card
                  key={item.id}
                  className={`overflow-hidden border transition-all hover:shadow-md ${
                    !item.available ? "opacity-75 bg-gray-50 border-red-200" : "bg-white"
                  }`}
                >
                  <div className="relative h-40 bg-gray-100">
                    <img
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src =
                          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"
                      }}
                    />
                    <div className="absolute top-2 left-2 flex gap-1">
                      <Badge
                        className={
                          item.type === "Veg"
                            ? "bg-green-600 text-white"
                            : "bg-red-600 text-white"
                        }
                      >
                        {item.type}
                      </Badge>
                      <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-sm">
                        {item.category}
                      </Badge>
                    </div>

                    {item.discount && item.discount > 0 && (
                      <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-0.5 rounded-md text-xs font-bold shadow">
                        {item.discount}% OFF
                      </div>
                    )}

                    {!item.available && (
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                          Out of Stock
                        </span>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base line-clamp-1">
                        {item.name}
                      </h3>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-extrabold text-green-700">
                          ${discountedPrice.toFixed(2)}
                        </span>
                        {item.discount && (
                          <span className="text-xs text-gray-400 line-through">
                            ${item.price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock Availability Toggle */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border">
                      <div className="text-xs">
                        <span className="font-semibold block text-gray-800">
                          Stock Status:
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            item.available ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {item.available ? "In Stock (Available)" : "Out of Stock"}
                        </span>
                      </div>
                      <Switch
                        checked={item.available}
                        onCheckedChange={() => handleToggleAvailability(item.id)}
                      />
                    </div>

                    {/* Edit & Delete Action Buttons */}
                    <div className="flex gap-2 pt-1 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEditModal(item)}
                        className="flex-1 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit Dish
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-lg text-gray-900">Delete Menu Dish?</h3>
              <p className="text-sm text-gray-500 mt-1 mb-6">
                Are you sure you want to remove this dish from the restaurant menu? This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                  onClick={() => handleDeleteDish(deleteConfirmId)}
                >
                  Yes, Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add / Edit Dish Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border">
              <div className="p-5 border-b flex items-center justify-between">
                <h2 className="font-extrabold text-xl text-gray-900 flex items-center gap-2">
                  <UtensilsCrossed className="h-5 w-5 text-green-600" />
                  {editingItem ? "Edit Dish" : "Add New Dish"}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleSaveDish} className="p-6 space-y-4">
                {/* Dish Name */}
                <div>
                  <Label htmlFor="dishName" className="font-semibold">
                    Dish Name *
                  </Label>
                  <Input
                    id="dishName"
                    required
                    placeholder="e.g. Chicken Tikka Burger"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 h-11 rounded-xl"
                  />
                </div>

                {/* Price & Discount */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dishPrice" className="font-semibold">
                      Price ($) *
                    </Label>
                    <Input
                      id="dishPrice"
                      type="number"
                      step="0.01"
                      required
                      placeholder="12.99"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="mt-1 h-11 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dishDiscount" className="font-semibold">
                      Discount (%)
                    </Label>
                    <Input
                      id="dishDiscount"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="0"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                      className="mt-1 h-11 rounded-xl"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <Label htmlFor="dishCategory" className="font-semibold">
                    Category
                  </Label>
                  <select
                    id="dishCategory"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="mt-1 w-full h-11 rounded-xl border border-gray-200 px-3 bg-white text-sm focus:ring-2 focus:ring-green-400 focus:outline-none"
                  >
                    {DEFAULT_CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="Custom">+ Add Custom Category</option>
                  </select>
                  {formData.category === "Custom" && (
                    <Input
                      placeholder="Enter custom category name"
                      value={formData.customCategory}
                      onChange={(e) =>
                        setFormData({ ...formData, customCategory: e.target.value })
                      }
                      className="mt-2 h-10 rounded-xl"
                    />
                  )}
                </div>

                {/* Dish Type (Veg / Non Veg) */}
                <div>
                  <Label className="font-semibold block mb-2">Food Type</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer border rounded-xl p-3 flex-1">
                      <input
                        type="radio"
                        name="dishType"
                        checked={formData.type === "Non Veg"}
                        onChange={() => setFormData({ ...formData, type: "Non Veg" })}
                        className="accent-red-600"
                      />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                      <span className="text-sm font-semibold">Non Veg</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer border rounded-xl p-3 flex-1">
                      <input
                        type="radio"
                        name="dishType"
                        checked={formData.type === "Veg"}
                        onChange={() => setFormData({ ...formData, type: "Veg" })}
                        className="accent-green-600"
                      />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                      <span className="text-sm font-semibold">Veg (Vegetarian)</span>
                    </label>
                  </div>
                </div>

                {/* Image URL */}
                <div>
                  <Label htmlFor="dishImage" className="font-semibold">
                    Dish Image URL
                  </Label>
                  <Input
                    id="dishImage"
                    placeholder="https://..."
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    className="mt-1 h-11 rounded-xl"
                  />
                  <div className="flex gap-2 mt-2 items-center">
                    <span className="text-xs text-gray-500">Quick sample photo:</span>
                    {SAMPLE_IMAGES.slice(0, 3).map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFormData({ ...formData, image: url })}
                        className="w-7 h-7 rounded-md overflow-hidden border hover:scale-110 transition-transform"
                      >
                        <img src={url} alt="sample" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stock Switch */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border">
                  <div>
                    <Label className="font-semibold block">Available in Kitchen</Label>
                    <p className="text-xs text-gray-500">
                      If toggled off, this dish will be hidden from cashiers.
                    </p>
                  </div>
                  <Switch
                    checked={formData.available}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, available: checked })
                    }
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-6 font-semibold shadow-md"
                  >
                    {editingItem ? "Update Dish" : "Save Dish"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
