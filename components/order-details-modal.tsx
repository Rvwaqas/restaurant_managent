"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, User, MapPin, Phone, Clock, Package, Printer, ChefHat } from "lucide-react"
import type { Order } from "../types/restaurant"
import { useRestaurant } from "@/hooks/use-restaurant-data"
import { ThermalReceiptModal } from "./thermal-receipt-modal"

interface OrderDetailsModalProps {
  order: Order
  onClose: () => void
}

export function OrderDetailsModal({ order, onClose }: OrderDetailsModalProps) {
  const { dispatch } = useRestaurant()
  const [printMode, setPrintMode] = useState<"bill" | "kot" | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-orange-100 text-orange-800"
      case "In Kitchen":
        return "bg-blue-100 text-blue-800"
      case "Ready":
        return "bg-green-100 text-green-800"
      case "Delivered":
        return "bg-purple-100 text-purple-800"
      case "Paid":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const updateOrderStatus = (status: Order["status"]) => {
    dispatch({ type: "UPDATE_ORDER_STATUS", payload: { orderId: order.id, status } })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Order Details #{order.id}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Order Status and Info */}
          <div className="flex justify-between items-start">
            <div>
              <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
              <p className="text-sm text-gray-600 mt-1">Created: {order.createdAt.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-lg">${order.total.toFixed(2)}</p>
              <p className="text-sm text-gray-600">{order.orderType}</p>
            </div>
          </div>

          {/* Customer Information */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Customer Information
            </h3>
            <div className="space-y-2">
              <p>
                <strong>Name:</strong> {order.customerName}
              </p>
              {order.orderType === "Dine In" && (
                <p>
                  <strong>Table:</strong> {order.tableNumber}
                </p>
              )}
              {order.customerPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>{order.customerPhone}</span>
                </div>
              )}
              {order.deliveryAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5" />
                  <span>{order.deliveryAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order Items */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Order Items ({order.items.length})
            </h3>
            <div className="space-y-3">
              {order.items.map((item, index) => {
                const itemPrice = item.menuItem.discount
                  ? item.menuItem.price * (1 - item.menuItem.discount / 100)
                  : item.menuItem.price

                return (
                  <div key={index} className="flex items-center gap-3 p-2 border rounded">
                    <img
                      src={item.menuItem.image || "/placeholder.svg"}
                      alt={item.menuItem.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.menuItem.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span
                          className={`w-2 h-2 rounded-full ${item.menuItem.type === "Veg" ? "bg-green-500" : "bg-red-500"}`}
                        ></span>
                        <span>{item.menuItem.type}</span>
                        {item.menuItem.discount && (
                          <Badge variant="secondary" className="text-xs">
                            {item.menuItem.discount}% Off
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        ${itemPrice.toFixed(2)} x {item.quantity}
                      </p>
                      <p className="text-sm text-gray-600">${(itemPrice * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Order Summary */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Order Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (5%):</span>
                <span>${order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total:</span>
                <span>${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Thermal Print Action Buttons */}
          <div className="flex gap-2 p-3 bg-gray-50 rounded-xl border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrintMode("bill")}
              className="flex-1 flex items-center justify-center gap-2 border-green-300 text-green-700 hover:bg-green-100 font-semibold rounded-xl"
            >
              <Printer className="h-4 w-4" />
              Print Bill
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPrintMode("kot")}
              className="flex-1 flex items-center justify-center gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 font-semibold rounded-xl"
            >
              <ChefHat className="h-4 w-4" />
              Print KOT
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {order.status === "New" && (
              <Button onClick={() => updateOrderStatus("In Kitchen")} className="flex-1">
                <Clock className="h-4 w-4 mr-1" />
                Start Cooking
              </Button>
            )}
            {order.status === "In Kitchen" && (
              <Button onClick={() => updateOrderStatus("Ready")} className="flex-1">
                Mark as Ready
              </Button>
            )}
            {order.status === "Ready" && (
              <Button onClick={() => updateOrderStatus("Delivered")} className="flex-1">
                Mark as Delivered
              </Button>
            )}
            {order.status === "Delivered" && (
              <Button onClick={() => updateOrderStatus("Paid")} className="flex-1" variant="outline">
                Mark as Paid
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Thermal Receipt Print Modal */}
      {printMode && (
        <ThermalReceiptModal
          order={order}
          initialMode={printMode}
          onClose={() => setPrintMode(null)}
        />
      )}
    </div>
  )
}

