"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useRestaurant } from "../../hooks/use-restaurant-data"
import { DollarSign, ShoppingCart, TrendingUp, Calendar, RotateCcw } from "lucide-react"
import React from "react"

export function Accounting() {
  const { state, dispatch } = useRestaurant()
  const [showConfirm, setShowConfirm] = React.useState(false)

  const completedOrders = state.orders.filter((order) => order.status === "Paid" || order.status === "Delivered")

  const totalSales = completedOrders.reduce((sum, order) => sum + order.total, 0)
  const totalTax = completedOrders.reduce((sum, order) => sum + order.tax, 0)
  const totalOrders = completedOrders.length

  // Get today's orders
  const today = new Date().toDateString()
  const todayOrders = completedOrders.filter((order) => order.createdAt.toDateString() === today)
  const todaySales = todayOrders.reduce((sum, order) => sum + order.total, 0)

  // Most popular items
  const itemCounts: { [key: string]: { count: number; revenue: number; name: string } } = {}
  completedOrders.forEach((order) => {
    order.items.forEach((item) => {
      if (!itemCounts[item.id]) {
        itemCounts[item.id] = { count: 0, revenue: 0, name: item.menuItem.name }
      }
      itemCounts[item.id].count += item.quantity
      itemCounts[item.id].revenue += item.menuItem.price * item.quantity
    })
  })

  const popularItems = Object.entries(itemCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 5)

  // Order type breakdown
  const orderTypeBreakdown = {
    "Dine In": completedOrders.filter((o) => o.orderType === "Dine In").length,
    "Take Away": completedOrders.filter((o) => o.orderType === "Take Away").length,
    Delivery: completedOrders.filter((o) => o.orderType === "Delivery").length,
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Accounting Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar className="h-4 w-4" />
          <span>{new Date().toLocaleDateString()}</span>
          <button
            className="ml-4 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all shadow-sm"
            onClick={() => setShowConfirm(true)}
            title="Reset POS (Clear all orders & tables)"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-xs w-full border">
            <h2 className="text-lg font-bold mb-2 text-red-600 flex items-center gap-2"><RotateCcw className="h-5 w-5" /> Reset POS?</h2>
            <p className="mb-4 text-gray-700">This will clear all orders and reset all tables to available. Are you sure?</p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={() => { dispatch({ type: "RESET_POS" }); setShowConfirm(false); }}
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">All time revenue</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${todaySales.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{todayOrders.length} orders today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Completed orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tax Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalTax.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">5% tax rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Popular Items */}
        <Card>
          <CardHeader>
            <CardTitle>Most Popular Items</CardTitle>
          </CardHeader>
          <CardContent>
            {popularItems.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No sales data available</p>
            ) : (
              <div className="space-y-3">
                {popularItems.map(([id, data], index) => (
                  <div key={id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{data.name}</p>
                        <p className="text-xs text-gray-600">{data.count} sold</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">${data.revenue.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">revenue</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Type Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Order Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(orderTypeBreakdown).map(([type, count]) => {
                const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0
                return (
                  <div key={type}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium">{type}</span>
                      <span className="text-sm text-gray-600">{count} orders</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{percentage.toFixed(1)}%</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {completedOrders.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No completed orders yet</p>
          ) : (
            <div className="space-y-3">
              {completedOrders
                .slice(-10)
                .reverse()
                .map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Order #{order.id}</p>
                      <p className="text-sm text-gray-600">
                        {order.customerName} • {order.orderType}
                      </p>
                      <p className="text-xs text-gray-500">{order.createdAt.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${order.total.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">{order.items.length} items</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
