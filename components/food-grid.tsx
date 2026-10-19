"use client"

import { FoodCard } from "./food-card"
import { useRestaurant } from "@/hooks/use-restaurant-data"

export function FoodGrid() {
  const { state } = useRestaurant()

  const filteredItems = state.menuItems.filter((item) => {
    const matchesCategory =
      state.selectedCategory === "All" ||
      item.category.trim().toLowerCase() === state.selectedCategory.trim().toLowerCase()
    const matchesSearch = item.name.toLowerCase().includes((state.searchQuery || "").toLowerCase())
    return matchesCategory && matchesSearch && item.available
  })

  if (filteredItems.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No items found matching your criteria.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredItems.map((item) => (
        <FoodCard key={item.id} menuItem={item} />
      ))}
    </div>
  )
}
