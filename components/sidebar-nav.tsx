"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  TableIcon as TableBar,
  Calculator,
  Settings,
  UtensilsCrossed,
  SlidersHorizontal,
  UserCog,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useRestaurant } from "@/hooks/use-restaurant-data"

const mainNavItems = [
  { icon: UtensilsCrossed, label: "Menu", href: "/", key: "menu" },
  { icon: TableBar, label: "Table Services", href: "/tables", key: "tables" },
  { icon: Calculator, label: "Accounting", href: "/accounting", key: "accounting" },
]

const settingsSubItems = [
  { icon: SlidersHorizontal, label: "Menu Settings", href: "/menu-items", key: "menu-management" },
  { icon: UserCog, label: "Account Settings", href: "/settings", key: "settings" },
]

export function SidebarNav() {
  const { state, dispatch } = useRestaurant()
  const pathname = usePathname()

  const isSettingsActive = pathname === "/settings" || pathname === "/menu-items"
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive)

  useEffect(() => {
    if (isSettingsActive) {
      setSettingsOpen(true)
    }
  }, [isSettingsActive])

  const handleNavClick = (key: string) => {
    dispatch({ type: "SET_PAGE", payload: key })
  }

  return (
    <div
      className={`${state.sidebarCollapsed ? "w-16" : "w-64"} p-4 border-r h-screen transition-all duration-300 bg-white flex flex-col`}
    >
      {!state.sidebarCollapsed && (
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 via-yellow-400 to-red-500 rounded-lg flex items-center justify-center shadow-sm">
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

      <nav className="space-y-2 flex-1">
        {mainNavItems.map((item, index) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={index}
              href={item.href}
              onClick={() => handleNavClick(item.key)}
              className={`w-full transition-all duration-200 flex items-center ${
                state.sidebarCollapsed ? "justify-center px-2 py-2.5" : "justify-start px-4 py-2.5"
              } 
                ${
                  isActive
                    ? "bg-gradient-to-r from-green-400 to-green-600 text-white rounded-xl shadow-md scale-[1.03]"
                    : "hover:bg-gradient-to-r hover:from-green-100 hover:to-green-200 text-gray-700 rounded-xl"
                }
                group text-sm font-medium
              `}
              title={state.sidebarCollapsed ? item.label : undefined}
            >
              <item.icon
                className={`h-5 w-5 transition-all duration-200 ${
                  state.sidebarCollapsed ? "" : "mr-2"
                } 
                  ${isActive ? "text-white scale-110" : "text-green-600 group-hover:text-green-700"}`}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              {!state.sidebarCollapsed && (
                <span className={`transition-all duration-200 ${isActive ? "font-bold" : "font-medium"}`}>
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}

        {/* Settings Parent Item with Sub-items */}
        <div className="pt-1">
          {state.sidebarCollapsed ? (
            <Link
              href="/settings"
              onClick={() => handleNavClick("settings")}
              className={`w-full transition-all duration-200 flex items-center justify-center px-2 py-2.5 rounded-xl ${
                isSettingsActive
                  ? "bg-gradient-to-r from-green-400 to-green-600 text-white shadow-md"
                  : "hover:bg-gradient-to-r hover:from-green-100 hover:to-green-200 text-gray-700"
              }`}
              title="Settings"
            >
              <Settings
                className={`h-5 w-5 ${
                  isSettingsActive ? "text-white" : "text-green-600"
                }`}
                strokeWidth={isSettingsActive ? 2.5 : 1.5}
              />
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`w-full transition-all duration-200 flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                  isSettingsActive
                    ? "bg-green-50 text-green-700 font-bold border border-green-200"
                    : "hover:bg-gradient-to-r hover:from-green-100 hover:to-green-200 text-gray-700"
                }`}
              >
                <div className="flex items-center">
                  <Settings
                    className="h-5 w-5 mr-2 text-green-600"
                    strokeWidth={isSettingsActive ? 2.5 : 1.5}
                  />
                  <span>Settings</span>
                </div>
                {settingsOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500 transition-transform duration-200" />
                )}
              </button>

              {settingsOpen && (
                <div className="pl-4 pt-1 space-y-1">
                  {settingsSubItems.map((sub, idx) => {
                    const isSubActive = pathname === sub.href
                    return (
                      <Link
                        key={idx}
                        href={sub.href}
                        onClick={() => handleNavClick(sub.key)}
                        className={`w-full transition-all duration-200 flex items-center px-3 py-2 rounded-lg text-xs font-medium ${
                          isSubActive
                            ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm font-bold scale-[1.02]"
                            : "hover:bg-green-100 text-gray-600"
                        }`}
                      >
                        <sub.icon
                          className={`h-4 w-4 mr-2 ${
                            isSubActive ? "text-white" : "text-green-600"
                          }`}
                        />
                        <span>{sub.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </nav>
    </div>
  )
}
