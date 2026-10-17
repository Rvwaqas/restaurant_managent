"use client"
import { Cart } from "./cart"
import { useRestaurant } from "../hooks/use-restaurant-data"

export default function ShowCartOnlyOnHome() {
  const { state } = useRestaurant();
  if (state.currentPage !== "menu") return null;
  return <Cart />;
} 