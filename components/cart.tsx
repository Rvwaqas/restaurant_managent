"use client"

import React, { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CreditCard, Banknote, Trash2, Plus, Minus, CheckCircle, User, Utensils, ShoppingBag, Truck, Printer, ChefHat, X } from "lucide-react"
import { useRestaurant } from "../hooks/use-restaurant-data"
import type { OrderType, Order } from "../types/restaurant"
import { ThermalReceiptModal } from "./thermal-receipt-modal"

export function Cart() {
  const { state, dispatch } = useRestaurant()
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null)
  const [printMode, setPrintMode] = useState<"bill" | "kot" | null>(null)

  const subtotal = state.currentCart.reduce((sum, item) => {
    const itemPrice = item.menuItem.discount
      ? item.menuItem.price * (1 - item.menuItem.discount / 100)
      : item.menuItem.price
    return sum + itemPrice * item.quantity
  }, 0)

  const tax = subtotal * state.taxRate
  const total = subtotal + tax

  const handleOrderTypeChange = (orderType: OrderType) => {
    dispatch({
      type: "SET_ORDER_INFO",
      payload: {
        ...state.currentOrder,
        orderType,
      },
    })
  }

  const handleCustomerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: "SET_ORDER_INFO",
      payload: {
        ...state.currentOrder,
        customerName: e.target.value,
      },
    })
  }

  const handleTableChange = (tableNumber: string) => {
    dispatch({
      type: "SET_ORDER_INFO",
      payload: {
        ...state.currentOrder,
        tableNumber,
      },
    })
  }

  const handlePaymentMethodChange = (paymentMethod: "cash" | "card") => {
    dispatch({
      type: "SET_ORDER_INFO",
      payload: {
        ...state.currentOrder,
        paymentMethod,
      },
    })
  }

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    dispatch({
      type: "UPDATE_CART_QUANTITY",
      payload: { id, quantity: newQuantity },
    })
  }

  const handlePlaceOrder = () => {
    if (state.currentCart.length === 0) {
      alert("Please add items to cart")
      return
    }
    if (!state.currentOrder.customerName.trim()) {
      alert("Please enter customer name")
      return
    }
    if (state.currentOrder.orderType === "Dine In" && !state.currentOrder.tableNumber) {
      alert("Please select a table")
      return
    }
    if (!state.currentOrder.paymentMethod) {
      alert("Please select a payment method")
      return
    }

    const orderSnapshot: Order = {
      id: Date.now().toString(),
      tableNumber: state.currentOrder.tableNumber,
      customerName: state.currentOrder.customerName,
      orderType: state.currentOrder.orderType,
      items: [...state.currentCart],
      subtotal,
      tax,
      total,
      status: "New",
      createdAt: new Date(),
      paymentMethod: state.currentOrder.paymentMethod as "cash" | "card",
    }

    dispatch({ type: "PLACE_ORDER" })
    setPlacedOrder(orderSnapshot)
  }

  const availableTables = state.tables.filter((table) => table.status === "Available")

  return (
    <div
      className={`${state.sidebarCollapsed ? "w-[450px]" : "w-[400px]"} bg-white border-l h-full transition-all duration-300`}
    >
      {/* Single Scrollable Container for Everything */}
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Header Section */}
          <div>
            <h2 className="text-xl font-bold mb-4">New Order</h2>

            <div className="space-y-3">
              {/* Order Mode (Dine In on top, Take Away & Delivery commented out for now) */}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center py-3 rounded-xl shadow-sm border-2 border-green-500 bg-gradient-to-r from-green-400 to-green-600 text-white font-semibold text-sm gap-2"
                  onClick={() => handleOrderTypeChange("Dine In")}
                >
                  <Utensils className="w-5 h-5" />
                  Dine In
                </button>

                {/* 
                <button
                  type="button"
                  className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl shadow-sm border-2 transition-all duration-200 text-sm font-semibold gap-1
                    ${state.currentOrder.orderType === "Take Away"
                      ? "bg-gradient-to-r from-green-400 to-green-600 text-white scale-105 border-green-500"
                      : "bg-white text-gray-700 hover:bg-gray-100 border-gray-200"}
                  `}
                  onClick={() => handleOrderTypeChange("Take Away")}
                >
                  <ShoppingBag className="w-5 h-5 mb-1" />
                  Take Away
                </button>

                <button
                  type="button"
                  className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl shadow-sm border-2 transition-all duration-200 text-sm font-semibold gap-1
                    ${state.currentOrder.orderType === "Delivery"
                      ? "bg-gradient-to-r from-green-400 to-green-600 text-white scale-105 border-green-500"
                      : "bg-white text-gray-700 hover:bg-gray-100 border-gray-200"}
                  `}
                  onClick={() => handleOrderTypeChange("Delivery")}
                >
                  <Truck className="w-5 h-5 mb-1" />
                  Delivery
                </button>
                */}
              </div>

              {/* Table Selection */}
              {state.currentOrder.orderType === "Dine In" && (
                <div className="relative">
                  <Utensils className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Select value={state.currentOrder.tableNumber} onValueChange={handleTableChange}>
                    <SelectTrigger className="h-12 pl-10 pr-4 rounded-xl shadow-sm bg-gray-50 border border-gray-200 text-base focus:ring-2 focus:ring-green-400 focus:border-green-400">
                      <SelectValue placeholder="Select Table" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTables.map((table) => (
                        <SelectItem key={table.number} value={table.number} className="text-base">
                          {table.number} (Capacity: {table.capacity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Customer Name (Moved below Dine In & Table Selection) */}
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Customer Name"
                  value={state.currentOrder.customerName}
                  onChange={handleCustomerNameChange}
                  className="h-12 pl-10 pr-4 rounded-xl shadow-sm bg-gray-50 focus:ring-2 focus:ring-green-400 focus:border-green-400 border border-gray-200 text-base"
                />
              </div>
            </div>
          </div>

          {/* Cart Items Section */}
          <div>
            {state.currentCart.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <p className="text-lg">No items in cart</p>
                <p className="text-sm">Add items from the menu</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Selected Items ({state.currentCart.length})</h3>
                {state.currentCart.map((item) => {
                  const itemPrice = item.menuItem.discount
                    ? item.menuItem.price * (1 - item.menuItem.discount / 100)
                    : item.menuItem.price

                  return (
                    <div key={item.id} className="flex items-start gap-4 p-4 border rounded-lg bg-gray-50 shadow-sm">
                      <img
                        src={item.menuItem.image || "/placeholder.svg"}
                        alt={item.menuItem.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold line-clamp-2 mb-2 text-gray-900">
                          {item.menuItem.name}
                        </h4>

                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className={`w-3 h-3 rounded-full ${item.menuItem.type === "Veg" ? "bg-green-500" : "bg-red-500"}`}
                          ></span>
                          <span className="text-sm text-gray-600">{item.menuItem.type}</span>
                          {item.menuItem.discount && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                              {item.menuItem.discount}% Off
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <span className="text-lg font-bold text-green-600">${itemPrice.toFixed(2)}</span>
                            {item.menuItem.discount && (
                              <span className="text-sm text-gray-400 line-through ml-2">
                                ${item.menuItem.price.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => dispatch({ type: "REMOVE_FROM_CART", payload: item.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3 bg-white rounded-lg border p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="text-lg font-semibold w-8 text-center">{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Item Total</p>
                            <p className="text-lg font-bold text-gray-900">${(itemPrice * item.quantity).toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Order Summary & Payment - Only show when there are items */}
          {state.currentCart.length > 0 && (
            <>
              {/* Order Summary */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold mb-3 text-lg">Order Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-base">
                    <span className="text-gray-600">Sub Total</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base">
                    <span className="text-gray-600">Tax ({(state.taxRate * 100).toFixed(0)}%)</span>
                    <span className="font-medium">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold border-t pt-2">
                    <span>Total Amount</span>
                    <span className="text-green-600">${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="border rounded-lg p-4">
                <p className="text-base font-semibold mb-3">Payment Method *</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`relative flex flex-col items-center py-6 h-auto rounded-xl shadow-md transition-all duration-200 border-2
                      ${state.currentOrder.paymentMethod === "cash"
                        ? "bg-gradient-to-r from-green-400 to-green-600 text-white scale-105 border-green-500"
                        : "bg-white text-gray-700 hover:bg-gray-100 border-gray-200"}
                    `}
                    onClick={() => handlePaymentMethodChange("cash")}
                  >
                    <Banknote className="h-7 w-7 mb-2" />
                    <span className="text-base font-semibold">Cash</span>
                    {state.currentOrder.paymentMethod === "cash" && (
                      <CheckCircle className="absolute top-2 right-2 text-white bg-green-500 rounded-full" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`relative flex flex-col items-center py-6 h-auto rounded-xl shadow-md transition-all duration-200 border-2
                      ${state.currentOrder.paymentMethod === "card"
                        ? "bg-gradient-to-r from-blue-400 to-blue-600 text-white scale-105 border-blue-500"
                        : "bg-white text-gray-700 hover:bg-gray-100 border-gray-200"}
                    `}
                    onClick={() => handlePaymentMethodChange("card")}
                  >
                    <CreditCard className="h-7 w-7 mb-2" />
                    <span className="text-base font-semibold">Card</span>
                    {state.currentOrder.paymentMethod === "card" && (
                      <CheckCircle className="absolute top-2 right-2 text-white bg-blue-500 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Button */}
              <div className="pb-4">
                <button
                  type="button"
                  className="w-full py-5 mt-6 rounded-xl bg-gradient-to-r from-green-400 to-green-600 text-white font-bold text-xl shadow-lg flex items-center justify-center gap-3 transition-transform duration-200 hover:scale-105 hover:from-green-500 hover:to-green-700"
                  onClick={handlePlaceOrder}
                >
                  <CheckCircle className="w-7 h-7" />
                  Confirm Order - ${total.toFixed(2)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Order Placed Success & Quick Print Modal */}
      {placedOrder && !printMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle className="w-10 h-10" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-gray-900">
                Order Placed Successfully!
              </h2>
              <p className="text-sm text-gray-500 mt-1 font-mono font-semibold">
                Token / Order #{placedOrder.id.slice(-6)}
              </p>
              <div className="mt-3 inline-block bg-gray-100 px-3 py-1 rounded-full text-xs font-bold text-gray-700">
                {placedOrder.orderType}
                {placedOrder.tableNumber ? ` - Table ${placedOrder.tableNumber}` : ""}
                {" • "}${placedOrder.total.toFixed(2)}
              </div>
            </div>

            {/* Quick Thermal Print Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                type="button"
                onClick={() => setPrintMode("bill")}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Customer Bill (Receipt)
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => setPrintMode("kot")}
                className="w-full border-amber-300 text-amber-800 hover:bg-amber-50 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
              >
                <ChefHat className="w-4 h-4 text-amber-600" />
                Print Kitchen KOT
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => setPlacedOrder(null)}
              className="w-full text-gray-500 hover:text-gray-900 text-sm font-semibold rounded-xl"
            >
              Start New Order (Close)
            </Button>
          </div>
        </div>
      )}

      {/* Printable Thermal Slip Modal */}
      {placedOrder && printMode && (
        <ThermalReceiptModal
          order={placedOrder}
          initialMode={printMode}
          onClose={() => setPrintMode(null)}
        />
      )}
    </div>
  )
}

