"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Minus, Plus } from "lucide-react"
import type { MenuItem } from "../types/restaurant"
import { useRestaurant } from "../hooks/use-restaurant-data"

interface FoodCardProps {
  menuItem: MenuItem
}

export function FoodCard({ menuItem }: FoodCardProps) {
  const { state, dispatch } = useRestaurant()

  const cartItem = state.currentCart.find((item) => item.id === menuItem.id)
  const quantity = cartItem?.quantity || 0

  const displayPrice = menuItem.discount ? menuItem.price * (1 - menuItem.discount / 100) : menuItem.price

  const handleAddToCart = () => {
    dispatch({ type: "ADD_TO_CART", payload: menuItem })
  }

  const handleUpdateQuantity = (newQuantity: number) => {
    dispatch({
      type: "UPDATE_CART_QUANTITY",
      payload: { id: menuItem.id, quantity: newQuantity },
    })
  }

  if (!menuItem.available) {
    return null
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <img src={menuItem.image || "/placeholder.svg"} alt={menuItem.name} className="w-full h-40 object-cover" />
        {menuItem.discount && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-black px-2 py-1 rounded-md text-xs font-medium">
            {menuItem.discount}% Off
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium mb-1 line-clamp-2">{menuItem.name}</h3>
        <div className="flex justify-between items-center mb-2">
          <div className="flex flex-col">
            <span className="text-green-600 font-bold">${displayPrice.toFixed(2)}</span>
            {menuItem.discount && (
              <span className="text-xs text-gray-400 line-through">${menuItem.price.toFixed(2)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${menuItem.type === "Veg" ? "bg-green-500" : "bg-red-500"}`}></span>
            <span className="text-xs text-gray-500">{menuItem.type}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          {quantity > 0 ? (
            <>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-transparent"
                onClick={() => handleUpdateQuantity(quantity - 1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full bg-transparent"
                onClick={() => handleUpdateQuantity(quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="outline" className="w-full bg-transparent" onClick={handleAddToCart}>
              Add to Cart
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
