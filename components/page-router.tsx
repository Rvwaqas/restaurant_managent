"use client"

import { useRestaurant } from "../hooks/use-restaurant-data"
import { CategoryFilter } from "./category-filter"
import { FoodGrid } from "./food-grid"
import { TableServices } from "./pages/table-services"
import { Reservations } from "./pages/reservations"
import { Delivery } from "./pages/delivery"
import { Accounting } from "./pages/accounting"
import { Settings } from "./pages/settings"
import { MenuManagement } from "./pages/menu-management"

export function PageRouter() {
  const { state } = useRestaurant()

  switch (state.currentPage) {
    case "menu":
      return (
        <>
          <CategoryFilter />
          <FoodGrid />
        </>
      )
    case "menu-management":
      return <MenuManagement />
    case "tables":
      return <TableServices />
    case "reservations":
      return <Reservations />
    case "delivery":
      return <Delivery />
    case "accounting":
      return <Accounting />
    case "settings":
      return <Settings />
    default:
      return (
        <>
          <CategoryFilter />
          <FoodGrid />
        </>
      )
  }
}
