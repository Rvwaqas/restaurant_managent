import { SidebarNav } from "../components/sidebar-nav"
import { Header } from "../components/header"
import { PageRouter } from "../components/page-router"
import { Cart } from "../components/cart"
import { Footer } from "../components/footer"
import { RestaurantProvider, useRestaurant } from "../hooks/use-restaurant-data"
import ShowCartOnlyOnHome from "../components/show-cart-only-on-home"

export default function POSPage() {
  return (
    <RestaurantProvider>
      <div className="flex h-screen bg-gray-100">
        <SidebarNav />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex overflow-hidden">
            <main className="flex-1 overflow-auto p-4">
              <PageRouter />
            </main>
            <ShowCartOnlyOnHome />
          </div>
          <Footer />
        </div>
      </div>
    </RestaurantProvider>
  )
}
