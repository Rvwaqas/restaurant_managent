export interface MenuItem {
  id: string
  name: string
  price: number
  image: string
  category: string
  type: "Veg" | "Non Veg"
  discount?: number
  available: boolean
}

export interface CartItem {
  id: string
  menuItem: MenuItem
  quantity: number
  notes?: string
}

export interface Order {
  id: string
  tableNumber: string
  customerName: string
  orderType: "Dine In" | "Take Away" | "Delivery"
  items: CartItem[]
  subtotal: number
  tax: number
  total: number
  status: "New" | "In Kitchen" | "Ready" | "Delivered" | "Paid" | "Out for Delivery"
  createdAt: Date
  deliveryAddress?: string
  customerPhone?: string
  paymentMethod?: "cash" | "card"
  notes?: string
}

export interface Table {
  number: string
  status: "Available" | "Occupied" | "Reserved"
  currentOrder?: string
  capacity: number
}

export type OrderType = "Dine In" | "Take Away" | "Delivery"
export type Category = "All" | "Breakfast" | "Soups" | "Pasta" | "Main Course" | "Burgers" | "Beverages" | "Desserts"
