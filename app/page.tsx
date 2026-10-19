"use client"

import { CategoryFilter } from "@/components/category-filter"
import { FoodGrid } from "@/components/food-grid"
import { Cart } from "@/components/cart"

export default function POSPage() {
  return (
    <>
      <main className="flex-1 overflow-auto p-4">
        <CategoryFilter />
        <FoodGrid />
      </main>
      <Cart />
    </>
  )
}
