"use client"

import type React from "react"

import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react"
import type { MenuItem, Order, CartItem, Table, OrderType } from "../types/restaurant"

interface RestaurantState {
  menuItems: MenuItem[]
  orders: Order[]
  tables: Table[]
  currentCart: CartItem[]
  currentOrder: {
    tableNumber: string
    customerName: string
    orderType: OrderType
    paymentMethod: "cash" | "card" | ""
  }
  selectedCategory: string
  searchQuery: string
  taxRate: number
  sidebarCollapsed: boolean
  currentPage: string
  selectedOrder: Order | null
}

type RestaurantAction =
  | { type: "ADD_TO_CART"; payload: MenuItem }
  | { type: "REMOVE_FROM_CART"; payload: string }
  | { type: "UPDATE_CART_QUANTITY"; payload: { id: string; quantity: number } }
  | { type: "CLEAR_CART" }
  | {
      type: "SET_ORDER_INFO"
      payload: { tableNumber: string; customerName: string; orderType: OrderType; paymentMethod?: "cash" | "card" | ""; deliveryAddress?: string; customerPhone?: string; notes?: string }
    }
  | { type: "PLACE_ORDER" }
  | { type: "UPDATE_ORDER_STATUS"; payload: { orderId: string; status: Order["status"] } }
  | { type: "UPDATE_ORDER_INFO"; payload: { orderId: string; customerPhone?: string; deliveryAddress?: string; notes?: string } }
  | { type: "UPDATE_SETTINGS"; payload: { taxRate: string; maxTables: string } }
  | { type: "SET_CATEGORY"; payload: string }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "LOAD_DATA"; payload: Partial<RestaurantState> }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_PAGE"; payload: string }
  | { type: "SELECT_ORDER"; payload: Order | null }
  | { type: "RESET_POS" }
  | { type: "ADD_MENU_ITEM"; payload: MenuItem }
  | { type: "UPDATE_MENU_ITEM"; payload: MenuItem }
  | { type: "DELETE_MENU_ITEM"; payload: string }
  | { type: "TOGGLE_MENU_ITEM_AVAILABILITY"; payload: string }

const initialMenuItems: MenuItem[] = [
  {
    id: "1",
    name: "Tasty Vegetable Salad Healthy Diet",
    price: 17.99,
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&h=200&fit=crop",
    category: "Main Course",
    type: "Veg",
    discount: 20,
    available: true,
  },
  {
    id: "2",
    name: "Original Cheese Meat Burger With Chips",
    price: 23.99,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=200&fit=crop",
    category: "Burgers",
    type: "Non Veg",
    available: true,
  },
  {
    id: "3",
    name: "Tacos Salsa With Grilled Chicken",
    price: 14.99,
    image:
      "https://cdn.apartmenttherapy.info/image/upload/f_auto,q_auto:eco,c_fill,g_auto,w_1220,h_915/k%2FEdit%2F2022-08-Grilled-Chicken-Tacos%2FGrilled_Chicken_Tacos-2",
    category: "Main Course",
    type: "Non Veg",
    available: true,
  },
  {
    id: "4",
    name: "Fresh Orange Juice With Basil Seed",
    price: 12.99,
    image: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=300&h=200&fit=crop",
    category: "Beverages",
    type: "Veg",
    available: true,
  },
  {
    id: "5",
    name: "Meat Sushi Maki With Tuna",
    price: 9.99,
    image: "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=300&h=200&fit=crop",
    category: "Main Course",
    type: "Non Veg",
    available: true,
  },
  {
    id: "6",
    name: "Classic Cheese Burger With French Fries",
    price: 10.59,
    image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=300&h=200&fit=crop",
    category: "Burgers",
    type: "Veg",
    discount: 20,
    available: true,
  },
  {
    id: "7",
    name: "Pancakes With Maple Syrup",
    price: 8.99,
    image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=300&h=200&fit=crop",
    category: "Breakfast",
    type: "Veg",
    available: true,
  },
  {
    id: "8",
    name: "Chicken Caesar Salad",
    price: 16.99,
    image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=300&h=200&fit=crop",
    category: "Main Course",
    type: "Non Veg",
    available: true,
  },
  {
    id: "9",
    name: "Tomato Basil Soup",
    price: 7.99,
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=300&h=200&fit=crop",
    category: "Soups",
    type: "Veg",
    available: true,
  },
  {
    id: "10",
    name: "Spaghetti Carbonara",
    price: 18.99,
    image:
      "https://static01.nyt.com/images/2021/02/14/dining/carbonara-horizontal/carbonara-horizontal-threeByTwoMediumAt2X-v2.jpg",
    category: "Pasta",
    type: "Non Veg",
    available: true,
  },
  {
    id: "11",
    name: "Chocolate Lava Cake",
    price: 6.99,
    image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300&h=200&fit=crop",
    category: "Desserts",
    type: "Veg",
    available: true,
  },
  {
    id: "12",
    name: "Iced Coffee",
    price: 4.99,
    image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=300&h=200&fit=crop",
    category: "Beverages",
    type: "Veg",
    available: true,
  },
  {
    id: "13",
    name: "Grilled Salmon",
    price: 24.99,
    image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=300&h=200&fit=crop",
    category: "Main Course",
    type: "Non Veg",
    available: true,
  },
  {
    id: "14",
    name: "Mushroom Risotto",
    price: 19.99,
    image: "https://images.unsplash.com/photo-1476124369491-e7addf5db371?w=300&h=200&fit=crop",
    category: "Main Course",
    type: "Veg",
    available: true,
  },
  {
    id: "15",
    name: "Chicken Noodle Soup",
    price: 9.99,
    image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=300&h=200&fit=crop",
    category: "Soups",
    type: "Non Veg",
    available: true,
  },
]

const initialTables: Table[] = Array.from({ length: 12 }, (_, i) => ({
  number: `T${i + 1}`,
  status: "Available",
  capacity: Math.floor(Math.random() * 6) + 2,
}))

const initialState: RestaurantState = {
  menuItems: initialMenuItems,
  orders: [],
  tables: initialTables,
  currentCart: [],
  currentOrder: {
    tableNumber: "",
    customerName: "",
    orderType: "Dine In",
    paymentMethod: "",
  },
  selectedCategory: "All",
  searchQuery: "",
  taxRate: 0.05,
  sidebarCollapsed: false,
  currentPage: "menu",
  selectedOrder: null,
}

function restaurantReducer(state: RestaurantState, action: RestaurantAction): RestaurantState {
  switch (action.type) {
    case "ADD_TO_CART": {
      const existingItem = state.currentCart.find((item) => item.id === action.payload.id)
      if (existingItem) {
        return {
          ...state,
          currentCart: state.currentCart.map((item) =>
            item.id === action.payload.id ? { ...item, quantity: item.quantity + 1 } : item,
          ),
        }
      }
      return {
        ...state,
        currentCart: [
          ...state.currentCart,
          {
            id: action.payload.id,
            menuItem: action.payload,
            quantity: 1,
          },
        ],
      }
    }
    case "REMOVE_FROM_CART":
      return {
        ...state,
        currentCart: state.currentCart.filter((item) => item.id !== action.payload),
      }
    case "UPDATE_CART_QUANTITY": {
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          currentCart: state.currentCart.filter((item) => item.id !== action.payload.id),
        }
      }
      return {
        ...state,
        currentCart: state.currentCart.map((item) =>
          item.id === action.payload.id ? { ...item, quantity: action.payload.quantity } : item,
        ),
      }
    }
    case "CLEAR_CART":
      return {
        ...state,
        currentCart: [],
        currentOrder: {
          tableNumber: "",
          customerName: "",
          orderType: "Dine In",
          paymentMethod: "",
        },
      }
    case "SET_ORDER_INFO":
      return {
        ...state,
        currentOrder: {
          ...state.currentOrder,
          ...action.payload,
        },
      }
    case "PLACE_ORDER": {
      if (state.currentCart.length === 0) return state

      const subtotal = state.currentCart.reduce((sum, item) => {
        const itemPrice = item.menuItem.discount
          ? item.menuItem.price * (1 - item.menuItem.discount / 100)
          : item.menuItem.price
        return sum + itemPrice * item.quantity
      }, 0)

      const tax = subtotal * state.taxRate
      const total = subtotal + tax

      const newOrder: Order = {
        id: Date.now().toString(),
        tableNumber: state.currentOrder.tableNumber,
        customerName: state.currentOrder.customerName,
        orderType: state.currentOrder.orderType,
        items: [...state.currentCart],
        subtotal,
        tax,
        total,
        status: "New",
        createdAt: new Date(),
      }

      return {
        ...state,
        orders: [...state.orders, newOrder],
        currentCart: [],
        currentOrder: {
          tableNumber: "",
          customerName: "",
          orderType: "Dine In",
          paymentMethod: "",
        },
        tables: state.tables.map((table) =>
          table.number === state.currentOrder.tableNumber
            ? { ...table, status: "Occupied", currentOrder: newOrder.id }
            : table,
        ),
      }
    }
    case "UPDATE_ORDER_STATUS": {
      // Update the order status
      const updatedOrders = state.orders.map((order) =>
        order.id === action.payload.orderId ? { ...order, status: action.payload.status } : order,
      )

      // Find the updated order
      const updatedOrder = state.orders.find((order) => order.id === action.payload.orderId)
      // Only proceed if the order exists and is being marked as Paid
      if (updatedOrder && action.payload.status === "Paid") {
        // Check if there are any other active (non-Paid) orders for the same table
        const hasOtherActiveOrders = updatedOrders.some(
          (order) =>
            order.tableNumber === updatedOrder.tableNumber &&
            order.status !== "Paid" &&
            order.id !== updatedOrder.id
        )
        return {
          ...state,
          orders: updatedOrders,
          tables: state.tables.map((table) =>
            table.number === updatedOrder.tableNumber && !hasOtherActiveOrders
              ? { ...table, status: "Available", currentOrder: undefined }
              : table
          ),
        }
      }
      return {
        ...state,
        orders: updatedOrders,
      }
    }
    case "UPDATE_ORDER_INFO": {
      const { orderId, customerPhone, deliveryAddress, notes } = action.payload;
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === orderId
            ? { ...order, customerPhone, deliveryAddress, notes }
            : order
        ),
      };
    }
    case "UPDATE_SETTINGS": {
      // Only update taxRate and maxTables in global state
      const { taxRate, maxTables } = action.payload;
      return {
        ...state,
        taxRate: parseFloat(taxRate) / 100,
        tables: state.tables.length === parseInt(maxTables)
          ? state.tables
          : Array.from({ length: parseInt(maxTables) }, (_, i) =>
              state.tables[i] || {
                number: `T${i + 1}`,
                status: "Available",
                capacity: Math.floor(Math.random() * 6) + 2,
              }
            ),
      };
    }
    case "SET_CATEGORY":
      return {
        ...state,
        selectedCategory: action.payload,
      }
    case "SET_SEARCH":
      return {
        ...state,
        searchQuery: action.payload,
      }
    case "LOAD_DATA":
      const loadedData = { ...action.payload }
      // Convert date strings back to Date objects
      if (loadedData.orders) {
        loadedData.orders = loadedData.orders.map((order: any) => ({
          ...order,
          createdAt: typeof order.createdAt === "string" ? new Date(order.createdAt) : order.createdAt,
        }))
      }
      return {
        ...state,
        ...loadedData,
      }
    case "TOGGLE_SIDEBAR":
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed,
      }
    case "SET_PAGE":
      return {
        ...state,
        currentPage: action.payload,
      }
    case "SELECT_ORDER":
      return {
        ...state,
        selectedOrder: action.payload,
      }
    case "RESET_POS":
      return {
        ...state,
        currentCart: [],
        currentOrder: {
          tableNumber: "",
          customerName: "",
          orderType: "Dine In",
          paymentMethod: "",
        },
        orders: [],
        tables: state.tables.map((table) => ({ ...table, status: "Available", currentOrder: undefined })),
      }
    case "ADD_MENU_ITEM":
      return {
        ...state,
        menuItems: [action.payload, ...state.menuItems],
      }
    case "UPDATE_MENU_ITEM":
      return {
        ...state,
        menuItems: state.menuItems.map((item) =>
          item.id === action.payload.id ? action.payload : item
        ),
        currentCart: state.currentCart.map((cartItem) =>
          cartItem.menuItem.id === action.payload.id
            ? { ...cartItem, menuItem: action.payload }
            : cartItem
        ),
      }
    case "DELETE_MENU_ITEM":
      return {
        ...state,
        menuItems: state.menuItems.filter((item) => item.id !== action.payload),
        currentCart: state.currentCart.filter((cartItem) => cartItem.menuItem.id !== action.payload),
      }
    case "TOGGLE_MENU_ITEM_AVAILABILITY":
      return {
        ...state,
        menuItems: state.menuItems.map((item) =>
          item.id === action.payload ? { ...item, available: !item.available } : item
        ),
      }
    default:
      return state
  }
}

const RestaurantContext = createContext<{
  state: RestaurantState
  dispatch: React.Dispatch<RestaurantAction>
} | null>(null)

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(restaurantReducer, initialState)

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem("restaurant-pos-data")
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData)
        dispatch({ type: "LOAD_DATA", payload: parsedData })
      } catch (error) {
        console.error("Failed to load saved data:", error)
      }
    }
  }, [])

  // One-time cleanup: reset tables stuck as 'Occupied' with no active orders
  useEffect(() => {
    const stuckTables = state.tables.filter(table => {
      if (table.status !== "Occupied") return false
      // Check if there are any active (non-Paid) orders for this table
      const hasActiveOrder = state.orders.some(order => order.tableNumber === table.number && order.status !== "Paid")
      return !hasActiveOrder
    })
    if (stuckTables.length > 0) {
      dispatch({
        type: "LOAD_DATA",
        payload: {
          tables: state.tables.map(table =>
            stuckTables.some(stuck => stuck.number === table.number)
              ? { ...table, status: "Available", currentOrder: undefined }
              : table
          ),
        },
      })
    }
    // Only run on mount and when tables/orders change
  }, [state.tables, state.orders])

  // Save data to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(
      "restaurant-pos-data",
      JSON.stringify({
        orders: state.orders,
        tables: state.tables,
        menuItems: state.menuItems,
      }),
    )
  }, [state.orders, state.tables, state.menuItems])

  return <RestaurantContext.Provider value={{ state, dispatch }}>{children}</RestaurantContext.Provider>
}

export function useRestaurant() {
  const context = useContext(RestaurantContext)
  if (!context) {
    throw new Error("useRestaurant must be used within a RestaurantProvider")
  }
  return context
}
