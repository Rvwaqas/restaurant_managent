"use client"

import React, { useState, useEffect } from "react"
import { Printer, X, ChefHat, Receipt, FileText, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Order } from "../types/restaurant"

interface ThermalReceiptModalProps {
  order: Order
  initialMode?: "bill" | "kot"
  onClose: () => void
}

export function ThermalReceiptModal({
  order,
  initialMode = "bill",
  onClose,
}: ThermalReceiptModalProps) {
  const [mode, setMode] = useState<"bill" | "kot">(initialMode)
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm")
  const [restaurantInfo, setRestaurantInfo] = useState({
    name: "SOUFI RESTAURANT",
    address: "123 Main Food Street, City",
    phone: "+92 300 1234567",
    currency: "$",
  })

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("restaurant-settings")
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        setRestaurantInfo({
          name: parsed.restaurantName || "SOUFI RESTAURANT",
          address: parsed.address || "123 Main Food Street, City",
          phone: parsed.phone || "+92 300 1234567",
          currency: parsed.currency === "USD" ? "$" : parsed.currency || "$",
        })
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const orderDate =
    order.createdAt instanceof Date
      ? order.createdAt
      : new Date(order.createdAt || Date.now())

  const formattedDate = orderDate.toLocaleDateString()
  const formattedTime = orderDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex flex-col bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-hidden border border-gray-100">
        {/* Header Controls (Hidden during print) */}
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between no-print">
          <div>
            <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              <Printer className="h-5 w-5 text-green-600" />
              Thermal Print Preview
            </h2>
            <p className="text-xs text-gray-500">Order #{order.id.slice(-6)}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-gray-200"
            onClick={onClose}
          >
            <X className="h-5 w-5 text-gray-600" />
          </Button>
        </div>

        {/* Mode & Paper Width Selectors (Hidden during print) */}
        <div className="p-3 bg-gray-100 border-b flex flex-wrap items-center justify-between gap-2 no-print">
          <div className="flex bg-white rounded-xl p-1 shadow-sm border">
            <button
              type="button"
              onClick={() => setMode("bill")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "bill"
                  ? "bg-green-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Customer Bill
            </button>
            <button
              type="button"
              onClick={() => setMode("kot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "kot"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <ChefHat className="h-3.5 w-3.5" />
              Kitchen (KOT)
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500 font-medium">Width:</span>
            <button
              type="button"
              onClick={() => setPaperWidth("80mm")}
              className={`px-2.5 py-1 rounded-md font-semibold text-xs border ${
                paperWidth === "80mm"
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              80mm
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth("58mm")}
              className={`px-2.5 py-1 rounded-md font-semibold text-xs border ${
                paperWidth === "58mm"
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              58mm
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-200/60 flex justify-center items-start">
          {/* Printable Area Target (Applied during print) */}
          <div
            id="printable-receipt-area"
            className={`bg-white shadow-md p-4 text-black border border-gray-200 transition-all ${
              paperWidth === "80mm" ? "w-[300px]" : "w-[220px]"
            }`}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: paperWidth === "80mm" ? "12px" : "11px",
              lineHeight: "1.3",
            }}
          >
            {/* ===================== MODE 1: CUSTOMER BILL ===================== */}
            {mode === "bill" ? (
              <div className="text-center">
                {/* Restaurant Brand Header */}
                <h1 className="font-extrabold text-base tracking-wide uppercase">
                  {restaurantInfo.name}
                </h1>
                <p className="text-[11px] text-gray-700">{restaurantInfo.address}</p>
                <p className="text-[11px] text-gray-700">Phone: {restaurantInfo.phone}</p>
                <p className="text-[11px] font-bold mt-1">*** CUSTOMER RECEIPT ***</p>

                <div className="my-2 border-t border-dashed border-black"></div>

                {/* Receipt Metadata */}
                <div className="text-left text-[11px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Order #: <strong>#{order.id.slice(-6)}</strong></span>
                    <span>{formattedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date: {formattedDate}</span>
                    <span>Type: <strong>{order.orderType}</strong></span>
                  </div>
                  {order.orderType === "Dine In" && order.tableNumber && (
                    <div className="font-bold text-sm bg-gray-100 py-0.5 px-1 rounded my-0.5 text-center">
                      TABLE: {order.tableNumber}
                    </div>
                  )}
                  {order.customerName && (
                    <div>Customer: {order.customerName}</div>
                  )}
                  {order.customerPhone && (
                    <div>Phone: {order.customerPhone}</div>
                  )}
                  {order.deliveryAddress && (
                    <div>Address: {order.deliveryAddress}</div>
                  )}
                </div>

                <div className="my-2 border-t border-dashed border-black"></div>

                {/* Items Table */}
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black font-bold">
                      <th className="pb-1">ITEM</th>
                      <th className="text-center pb-1">QTY</th>
                      <th className="text-right pb-1">PRICE</th>
                      <th className="text-right pb-1">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => {
                      const itemPrice = item.menuItem.discount
                        ? item.menuItem.price * (1 - item.menuItem.discount / 100)
                        : item.menuItem.price
                      const itemTotal = itemPrice * item.quantity

                      return (
                        <tr key={idx} className="border-b border-dotted border-gray-300">
                          <td className="py-1 pr-1 font-medium leading-tight">
                            {item.menuItem.name}
                          </td>
                          <td className="text-center py-1 font-bold">
                            {item.quantity}
                          </td>
                          <td className="text-right py-1">
                            {itemPrice.toFixed(2)}
                          </td>
                          <td className="text-right py-1 font-bold">
                            {itemTotal.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="my-2 border-t border-dashed border-black"></div>

                {/* Calculation Breakdown */}
                <div className="space-y-1 text-right text-[11px]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>
                      {restaurantInfo.currency}
                      {order.subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>
                      {restaurantInfo.currency}
                      {order.tax.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm border-t border-b border-black py-1 my-1">
                    <span>GRAND TOTAL:</span>
                    <span>
                      {restaurantInfo.currency}
                      {order.total.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-700">
                    <span>Payment Mode:</span>
                    <span className="uppercase font-semibold">
                      {order.paymentMethod || "Cash"}
                    </span>
                  </div>
                </div>

                <div className="my-3 border-t border-dashed border-black"></div>

                {/* Thermal Bill Footer */}
                <p className="text-[11px] font-bold">THANK YOU FOR YOUR VISIT!</p>
                <p className="text-[10px] text-gray-600">Please visit again.</p>
                <p className="text-[9px] text-gray-400 mt-2">
                  Software Powered by POS System
                </p>
              </div>
            ) : (
              /* ===================== MODE 2: KITCHEN ORDER TICKET (KOT) ===================== */
              <div className="text-center">
                <div className="border-2 border-black py-1 px-2 rounded mb-2">
                  <h1 className="font-extrabold text-base tracking-wider">
                    *** K.O.T. ***
                  </h1>
                  <p className="text-[11px] font-semibold">KITCHEN ORDER TICKET</p>
                </div>

                <div className="text-left text-[11px] font-mono space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">
                      KOT #{order.id.slice(-6)}
                    </span>
                    <span className="text-[10px]">{formattedTime}</span>
                  </div>

                  <div className="bg-black text-white p-1 rounded font-bold text-center text-sm tracking-wide">
                    {order.orderType.toUpperCase()}
                    {order.orderType === "Dine In" && order.tableNumber && (
                      <span> - {order.tableNumber}</span>
                    )}
                  </div>

                  <div className="flex justify-between text-[10px] text-gray-800">
                    <span>Date: {formattedDate}</span>
                    <span>Cust: {order.customerName || "Walk-In"}</span>
                  </div>
                </div>

                <div className="my-2 border-t-2 border-dashed border-black"></div>

                {/* Items to Cook */}
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-black font-extrabold text-xs">
                      <th className="w-12 text-center pb-1">QTY</th>
                      <th className="pb-1">ITEM DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-400">
                        <td className="text-center py-1.5 font-extrabold text-base align-top">
                          {item.quantity}x
                        </td>
                        <td className="py-1.5 font-bold text-xs align-top">
                          <div>{item.menuItem.name}</div>
                          <div className="text-[10px] font-normal text-gray-600">
                            Category: {item.menuItem.category} ({item.menuItem.type})
                          </div>
                          {item.notes && (
                            <div className="text-[10px] font-semibold text-red-600 mt-0.5">
                              Note: {item.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="my-3 border-t-2 border-dashed border-black"></div>

                {order.notes && (
                  <div className="text-left bg-gray-100 p-1.5 rounded text-[11px] mb-2 border border-gray-300">
                    <strong>Special Instructions:</strong> {order.notes}
                  </div>
                )}

                <p className="text-[10px] font-bold tracking-widest text-gray-700">
                  === CHEF COPY ===
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions (Hidden during print) */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3 no-print">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                setMode(mode === "bill" ? "kot" : "bill")
              }}
              variant="outline"
              className="rounded-xl border-gray-300"
            >
              Switch to {mode === "bill" ? "KOT" : "Bill"}
            </Button>
            <Button
              onClick={handlePrint}
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-md font-semibold flex items-center gap-2 px-6"
            >
              <Printer className="h-4 w-4" />
              Print Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
