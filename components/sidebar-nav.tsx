"use client"

import { Home, TableIcon as TableBar, CalendarRange, Truck, Calculator, Settings, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRestaurant } from "../hooks/use-restaurant-data"

const navItems = [
  { icon: Home, label: "Home", key: "menu", color: "text-green-600" },
  { icon: UtensilsCrossed, label: "Menu Items", key: "menu-management", color: "text-gray-600" },
  { icon: TableBar, label: "Table Services", key: "tables", color: "text-gray-600" },
  { icon: CalendarRange, label: "Reservation", key: "reservations", color: "text-gray-600" },
  { icon: Truck, label: "Delivery", key: "delivery", color: "text-gray-600" },
  { icon: Calculator, label: "Accounting", key: "accounting", color: "text-gray-600" },
  { icon: Settings, label: "Settings", key: "settings", color: "text-gray-600" },
]

export function SidebarNav() {
  const { state, dispatch } = useRestaurant()

  const handleNavClick = (key: string) => {
    if (key === "menu") {
      dispatch({ type: "TOGGLE_SIDEBAR" })
    }
    dispatch({ type: "SET_PAGE", payload: key })
  }

  return (
    <div
      className={`${state.sidebarCollapsed ? "w-16" : "w-64"} p-4 border-r h-screen transition-all duration-300 bg-white`}
    >
      {!state.sidebarCollapsed && (
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 via-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span
            className="text-xl font-extrabold tracking-widest bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 bg-clip-text text-transparent drop-shadow-md"
            style={{ letterSpacing: "0.15em" }}
          >
            SOUFI REST
          </span>
        </div>
      )}

      <nav className="space-y-2">
        {navItems.map((item, index) => {
          const isActive = state.currentPage === item.key;
          return (
            <Button
              key={index}
              variant="ghost"
              className={`w-full transition-all duration-200 ${state.sidebarCollapsed ? "justify-center px-2" : "justify-start"} 
                ${isActive ? "bg-gradient-to-r from-green-400 to-green-600 text-white rounded-xl shadow-md scale-[1.03]" : "hover:bg-gradient-to-r hover:from-green-100 hover:to-green-200 text-gray-700 rounded-xl"}
                group
              `}
              onClick={() => handleNavClick(item.key)}
              title={state.sidebarCollapsed ? item.label : undefined}
            >
              <item.icon 
                className={`h-5 w-5 transition-all duration-200 ${state.sidebarCollapsed ? "" : "mr-2"} 
                  ${isActive ? "text-white scale-110" : "text-green-600 group-hover:text-green-700"}`}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              {!state.sidebarCollapsed && (
                <span className={`transition-all duration-200 ${isActive ? "font-bold" : "font-medium"}`}>{item.label}</span>
              )}
            </Button>
          );
        })}
      </nav>
    </div>
  )
}
