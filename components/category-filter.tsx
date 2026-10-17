"use client"

import { Grid, Coffee, Soup, UtensilsCrossed, ChefHat, Sandwich, Wine, Cookie } from "lucide-react"
import { useRestaurant } from "../hooks/use-restaurant-data"

const categories = [
  { icon: Grid, label: "All", key: "All" },
  { icon: Coffee, label: "Breakfast", key: "Breakfast" },
  { icon: Soup, label: "Soups", key: "Soups" },
  { icon: UtensilsCrossed, label: "Pasta", key: "Pasta" },
  { icon: ChefHat, label: "Main Course", key: "Main Course" },
  { icon: Sandwich, label: "Burgers", key: "Burgers" },
  { icon: Wine, label: "Beverages", key: "Beverages" },
  { icon: Cookie, label: "Desserts", key: "Desserts" },
]

export function CategoryFilter() {
  const { state, dispatch } = useRestaurant()

  const getItemCount = (categoryKey: string) => {
    if (categoryKey === "All") {
      return state.menuItems.filter((item) => item.available).length
    }
    return state.menuItems.filter((item) => item.category === categoryKey && item.available).length
  }

  return (
    <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
      {categories.map((category, index) => (
        <div
          key={index}
          onClick={() => dispatch({ type: "SET_CATEGORY", payload: category.key })}
          className={`flex flex-col items-center p-3 rounded-xl min-w-[100px] ${
            state.selectedCategory === category.key ? "bg-green-50 text-green-600" : "bg-white"
          } border cursor-pointer hover:bg-green-50 transition-colors`}
        >
          <category.icon className="h-6 w-6 mb-1" />
          <span className="text-sm font-medium">{category.label}</span>
          <span className="text-xs text-gray-500">{getItemCount(category.key)} Items</span>
        </div>
      ))}
    </div>
  )
}
