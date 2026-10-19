"use client"

import { useRestaurant } from "@/hooks/use-restaurant-data"
import { OrderDetailsModal } from "./order-details-modal"

export function Footer() {
  const { state, dispatch } = useRestaurant()

  const kitchenOrders = state.orders.filter((order) => order.status === "New" || order.status === "In Kitchen")

  const handleOrderClick = (order: any) => {
    dispatch({ type: "SELECT_ORDER", payload: order })
  }

  const handleCloseModal = () => {
    dispatch({ type: "SELECT_ORDER", payload: null })
  }

  if (kitchenOrders.length === 0) {
    return (
      <div className="bg-white border-t p-4">
        <div className="text-center text-gray-500">
          <p className="text-sm">No orders in kitchen</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border-t p-4 flex gap-4 overflow-x-auto">
        {kitchenOrders.map((order) => (
          <div
            key={order.id}
            className="flex items-center gap-3 bg-orange-50 rounded-lg p-3 min-w-[200px] cursor-pointer hover:bg-orange-100 transition-colors"
            onClick={() => handleOrderClick(order)}
          >
            <div className="w-8 h-8 bg-orange-400 rounded-full flex items-center justify-center text-white font-medium">
              {order.tableNumber || "TO"}
            </div>
            <div>
              <div className="text-sm font-medium">
                {order.items.reduce((sum: number, item: any) => sum + item.quantity, 0)} Items → Kitchen
              </div>
              <div className="text-xs text-orange-600">{order.status === "New" ? "New Order" : "In Process"}</div>
              <div className="text-xs text-gray-500">{order.customerName}</div>
            </div>
          </div>
        ))}
      </div>

      {state.selectedOrder && <OrderDetailsModal order={state.selectedOrder} onClose={handleCloseModal} />}
    </>
  )
}
