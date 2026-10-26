"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRestaurant } from "@/hooks/use-restaurant-data"
import { Users, CheckCircle, DollarSign } from "lucide-react"

export default function TablesPage() {
  const { state, dispatch } = useRestaurant()

  const getTableOrder = (tableNumber: string) => {
    return state.orders.find((order) => order.tableNumber === tableNumber && order.status !== "Paid")
  }

  const updateOrderStatus = (orderId: string, status: any) => {
    dispatch({ type: "UPDATE_ORDER_STATUS", payload: { orderId, status } })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Available":
        return "bg-green-100 text-green-800"
      case "Occupied":
        return "bg-blue-100 text-blue-800"
      case "Reserved":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getOrderStatusColor = (status: string) => {
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

  return (
    <main className="flex-1 overflow-auto p-4">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Table Services</h1>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span>Reserved</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {state.tables.map((table) => {
            const order = getTableOrder(table.number)
            return (
              <Card key={table.number} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{table.number}</CardTitle>
                    <Badge className={getStatusColor(table.status)}>{table.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>Capacity: {table.capacity}</span>
                  </div>
                </CardHeader>

                <CardContent>
                  {order ? (
                    <div className="space-y-3">
                      <div className="text-sm">
                        <p className="font-medium">{order.customerName}</p>
                        <p className="text-gray-600">
                          {order.items.length} items • ${order.total.toFixed(2)}
                        </p>
                      </div>

                      {order.status !== "In Kitchen" && (
                        <Badge className={getOrderStatusColor(order.status)}>{order.status}</Badge>
                      )}

                      <div className="flex gap-2">
                        {order.status !== "Delivered" && order.status !== "Paid" && (
                          <Button
                            size="sm"
                            onClick={() => updateOrderStatus(order.id, "Delivered")}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Delivered
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => updateOrderStatus(order.id, "Paid")}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        >
                          <DollarSign className="h-3 w-3 mr-1" />
                          Paid
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-4">
                      <p className="text-sm">No active orders</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </main>
  )
}
