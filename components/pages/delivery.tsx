"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useRestaurant } from "../../hooks/use-restaurant-data"
import { MapPin, Phone, Package, Truck } from "lucide-react"

export function Delivery() {
  const { state, dispatch } = useRestaurant()

  const deliveryOrders = state.orders.filter((order) => order.orderType === "Delivery" && order.status !== "Out for Delivery")

  const [newDelivery, setNewDelivery] = useState({
    customerName: "",
    phone: "",
    address: "",
    notes: "",
  })
  const [error, setError] = useState("")

  const handleConfirmDelivery = () => {
    if (!newDelivery.customerName || !newDelivery.phone || !newDelivery.address) {
      setError("Please fill in all required fields.")
      return
    }
    // Check if a delivery order with the same customer name exists
    const existingOrder = state.orders.find(
      (order) => order.orderType === "Delivery" && order.customerName.trim().toLowerCase() === newDelivery.customerName.trim().toLowerCase() && order.status !== "Delivered" && order.status !== "Out for Delivery"
    )
    if (existingOrder) {
      // Attach delivery info to the existing order
      dispatch({
        type: "UPDATE_ORDER_INFO",
        payload: {
          orderId: existingOrder.id,
          customerPhone: newDelivery.phone,
          deliveryAddress: newDelivery.address,
          notes: newDelivery.notes,
        },
      })
      setNewDelivery({ customerName: "", phone: "", address: "", notes: "" })
      setError("")
      return
    }
    // If no existing order, require items in cart to create a new one
    if (state.currentCart.length === 0) {
      setError("Please add items to cart before confirming delivery.")
      return
    }
    // First, update current order info in state
    dispatch({
      type: "SET_ORDER_INFO",
      payload: {
        tableNumber: "",
        customerName: newDelivery.customerName,
        orderType: "Delivery",
        paymentMethod: "cash",
        deliveryAddress: newDelivery.address,
        customerPhone: newDelivery.phone,
        notes: newDelivery.notes,
      },
    })
    // Then, place the order
    dispatch({ type: "PLACE_ORDER" })
    setNewDelivery({ customerName: "", phone: "", address: "", notes: "" })
    setError("")
    dispatch({ type: "CLEAR_CART" })
  }

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
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getDeliveryTime = (createdAt: Date | string) => {
    const now = new Date()
    const orderDate = typeof createdAt === "string" ? new Date(createdAt) : createdAt
    const diffMinutes = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60))
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`
    }
    return `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m ago`
  }

  const handleOutForDelivery = (orderId: string) => {
    // Set status to 'Out for Delivery' and remove from active list
    dispatch({ type: "UPDATE_ORDER_STATUS", payload: { orderId, status: "Out for Delivery" } })
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Delivery Management</h1>
        <div className="flex gap-4 text-base">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-500" />
            <span>In Kitchen: {deliveryOrders.filter((o) => o.status === "In Kitchen").length}</span>
          </div>
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-green-500" />
            <span>Ready: {deliveryOrders.filter((o) => o.status === "Ready").length}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Customer Info Form */}
        <Card className="lg:col-span-1 shadow-lg rounded-2xl border-0 bg-white">
          <CardHeader>
            <CardTitle className="text-xl font-extrabold flex items-center gap-2">
              <Truck className="h-6 w-6 text-green-600" />
              Delivery Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <Label htmlFor="customerName" className="text-base font-semibold">Customer Name</Label>
                </div>
                <Input
                  id="customerName"
                  className="h-12 rounded-xl shadow-sm bg-gray-50 focus:ring-2 focus:ring-green-400 focus:border-green-400 border border-gray-200 text-base"
                  value={newDelivery.customerName}
                  onChange={(e) => setNewDelivery({ ...newDelivery, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Phone className="w-5 h-5" />
                  </span>
                  <Label htmlFor="phone" className="text-base font-semibold">Phone Number</Label>
                </div>
                <Input
                  id="phone"
                  className="h-12 rounded-xl shadow-sm bg-gray-50 focus:ring-2 focus:ring-green-400 focus:border-green-400 border border-gray-200 text-base"
                  value={newDelivery.phone}
                  onChange={(e) => setNewDelivery({ ...newDelivery, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <MapPin className="w-5 h-5" />
                  </span>
                  <Label htmlFor="address" className="text-base font-semibold">Delivery Address</Label>
                </div>
                <Textarea
                  id="address"
                  className="pt-3 rounded-xl shadow-sm bg-gray-50 focus:ring-2 focus:ring-green-400 focus:border-green-400 border border-gray-200 text-base"
                  value={newDelivery.address}
                  onChange={(e) => setNewDelivery({ ...newDelivery, address: e.target.value })}
                  placeholder="Enter full delivery address"
                  rows={3}
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><line x1="14" x2="14" y1="2" y2="8"/><line x1="2" x2="18" y1="8" y2="8"/><line x1="8" x2="16" y1="16" y2="16"/></svg>
                  </span>
                  <Label htmlFor="notes" className="text-base font-semibold">Special Instructions</Label>
                </div>
                <Textarea
                  id="notes"
                  className="pt-3 rounded-xl shadow-sm bg-gray-50 focus:ring-2 focus:ring-green-400 focus:border-green-400 border border-gray-200 text-base"
                  value={newDelivery.notes}
                  onChange={(e) => setNewDelivery({ ...newDelivery, notes: e.target.value })}
                  placeholder="Any special delivery instructions"
                  rows={2}
                />
              </div>
              <div className="my-4 border-t border-gray-200" />
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Add items to cart from the Menu page, then return here to complete delivery details.
                </p>
              </div>
              {error && <div className="text-red-600 text-sm font-semibold">{error}</div>}
              <Button className="w-full bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-bold text-lg py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200" onClick={handleConfirmDelivery}>
                <Truck className="w-5 h-5 mr-1" />
                Confirm Delivery
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* Active Delivery Orders */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold mb-2">Active Delivery Orders</h2>
          {deliveryOrders.length === 0 ? (
            <Card className="shadow-md rounded-2xl border-0">
              <CardContent className="text-center py-12">
                <Truck className="h-14 w-14 text-gray-300 mx-auto mb-6" />
                <p className="text-gray-500 text-lg">No delivery orders yet</p>
                <p className="text-base text-gray-400">Orders will appear here when customers place delivery orders</p>
              </CardContent>
            </Card>
          ) : (
            deliveryOrders.map((order) => (
              <Card key={order.id} className="shadow-md rounded-2xl border-0">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold">{order.customerName}</h3>
                      <p className="text-sm text-gray-600">Order #{order.id}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                      <p className="text-sm text-gray-500 mt-1">{getDeliveryTime(order.createdAt)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4" />
                      <span>{order.customerPhone || "No phone provided"}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <span>{order.deliveryAddress || "No address provided"}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Order Items:</span>
                      <span className="text-sm text-gray-600">{order.items.length} items</span>
                    </div>
                    <div className="space-y-1">
                      {order.items.slice(0, 3).map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>
                            {item.quantity}x {item.menuItem.name}
                          </span>
                          <span>${(item.menuItem.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-xs text-gray-500">+{order.items.length - 3} more items</p>
                      )}
                    </div>
                    <div className="flex justify-between font-semibold text-sm mt-2 pt-2 border-t">
                      <span>Total:</span>
                      <span>${order.total.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {order.status === "Ready" && (
                      <Button size="sm" className="flex-1" onClick={() => handleOutForDelivery(order.id)}>
                        <Truck className="h-4 w-4 mr-1" />
                        Out for Delivery
                      </Button>
                    )}
                    <Button size="sm" variant="outline">
                      <Phone className="h-4 w-4 mr-1" />
                      Call Customer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
