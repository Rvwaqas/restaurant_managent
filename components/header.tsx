"use client"

import type React from "react"

import { Search, Share2, Menu } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRestaurant } from "@/hooks/use-restaurant-data"

export function Header() {
  const { state, dispatch } = useRestaurant()

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "SET_SEARCH", payload: e.target.value })
  }

  const toggleSidebar = () => {
    dispatch({ type: "TOGGLE_SIDEBAR" })
  }

  return (
    <div className="bg-white p-4 flex items-center gap-4 border-b">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-green-500 via-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <span
          className="text-lg font-extrabold tracking-widest bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 bg-clip-text text-transparent drop-shadow-md"
          style={{ letterSpacing: "0.15em" }}
        >
          SOUFI REST
        </span>
      </div>

      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input
          type="text"
          placeholder="Search Product here..."
          className="pl-10 w-full"
          value={state.searchQuery}
          onChange={handleSearchChange}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{state.currentOrder.tableNumber || "No Table"}</span>
        <span className="text-gray-500 text-sm">{state.currentOrder.customerName || "No Customer"}</span>
      </div>
      <Button variant="ghost" size="icon">
        <Share2 className="h-5 w-5" />
      </Button>
    </div>
  )
}
