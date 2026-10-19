import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { RestaurantProvider } from "@/hooks/use-restaurant-data"
import { SidebarNav } from "@/components/sidebar-nav"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Waqas Restaurant",
  description: "Restaurant POS System",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RestaurantProvider>
          <div className="flex h-screen bg-gray-100">
            <SidebarNav />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <div className="flex-1 flex overflow-hidden">
                {children}
              </div>
              <Footer />
            </div>
          </div>
        </RestaurantProvider>
      </body>
    </html>
  )
}
