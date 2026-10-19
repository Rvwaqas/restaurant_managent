"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Users, Phone, Trash2 } from "lucide-react"

interface Reservation {
  id: string
  customerName: string
  phone: string
  guests: number
  date: string
  time: string
  tableNumber: string
  status: "Confirmed" | "Seated" | "Cancelled"
  createdAt: Date
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([
    {
      id: "1",
      customerName: "John Smith",
      phone: "+1 234 567 8900",
      guests: 4,
      date: "2024-01-15",
      time: "19:00",
      tableNumber: "T5",
      status: "Confirmed",
      createdAt: new Date(),
    },
    {
      id: "2",
      customerName: "Sarah Johnson",
      phone: "+1 234 567 8901",
      guests: 2,
      date: "2024-01-15",
      time: "20:30",
      tableNumber: "T2",
      status: "Confirmed",
      createdAt: new Date(),
    },
  ])

  const [newReservation, setNewReservation] = useState({
    customerName: "",
    phone: "",
    guests: "",
    date: "",
    time: "",
    tableNumber: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !newReservation.customerName ||
      !newReservation.phone ||
      !newReservation.guests ||
      !newReservation.date ||
      !newReservation.time ||
      !newReservation.tableNumber
    ) {
      alert("Please fill all fields")
      return
    }

    const reservation: Reservation = {
      id: Date.now().toString(),
      customerName: newReservation.customerName,
      phone: newReservation.phone,
      guests: Number.parseInt(newReservation.guests),
      date: newReservation.date,
      time: newReservation.time,
      tableNumber: newReservation.tableNumber,
      status: "Confirmed",
      createdAt: new Date(),
    }

    setReservations([...reservations, reservation])
    setNewReservation({
      customerName: "",
      phone: "",
      guests: "",
      date: "",
      time: "",
      tableNumber: "",
    })
    alert("Reservation created successfully!")
  }

  const updateReservationStatus = (id: string, status: Reservation["status"]) => {
    setReservations(reservations.map((res) => (res.id === id ? { ...res, status } : res)))
  }

  const deleteReservation = (id: string) => {
    setReservations(reservations.filter((res) => res.id !== id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Confirmed":
        return "bg-green-100 text-green-800"
      case "Seated":
        return "bg-blue-100 text-blue-800"
      case "Cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const tables = Array.from({ length: 12 }, (_, i) => `T${i + 1}`)

  return (
    <main className="flex-1 overflow-auto p-4">
      <div className="p-8 bg-gray-50 min-h-screen">
        <h1 className="text-3xl font-extrabold tracking-tight mb-8">Reservations</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* New Reservation Form */}
          <Card className="lg:col-span-1 shadow-lg rounded-2xl border-0 bg-white">
            <CardHeader>
              <CardTitle className="text-xl font-extrabold flex items-center gap-2">
                <Users className="h-6 w-6 text-green-600" />
                New Reservation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Users className="w-5 h-5" />
                  </span>
                  <Label htmlFor="customerName" className="text-base font-semibold">Customer Name</Label>
                </div>
                <Input
                  id="customerName"
                  value={newReservation.customerName}
                  onChange={(e) => setNewReservation({ ...newReservation, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Phone className="w-5 h-5" />
                  </span>
                  <Label htmlFor="phone" className="text-base font-semibold">Phone Number</Label>
                </div>
                <Input
                  id="phone"
                  value={newReservation.phone}
                  onChange={(e) => setNewReservation({ ...newReservation, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Users className="w-5 h-5" />
                  </span>
                  <Label htmlFor="guests" className="text-base font-semibold">Number of Guests</Label>
                </div>
                <Select
                  value={newReservation.guests}
                  onValueChange={(value) => setNewReservation({ ...newReservation, guests: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select guests" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} Guest{num > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <Label htmlFor="date" className="text-base font-semibold">Date</Label>
                </div>
                <Input
                  id="date"
                  type="date"
                  value={newReservation.date}
                  onChange={(e) => setNewReservation({ ...newReservation, date: e.target.value })}
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <Clock className="w-5 h-5" />
                  </span>
                  <Label htmlFor="time" className="text-base font-semibold">Time</Label>
                </div>
                <Input
                  id="time"
                  type="time"
                  value={newReservation.time}
                  onChange={(e) => setNewReservation({ ...newReservation, time: e.target.value })}
                />
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <span className="text-gray-400">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-table"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
                  </span>
                  <Label htmlFor="table" className="text-base font-semibold">Table</Label>
                </div>
                <Select
                  value={newReservation.tableNumber}
                  onValueChange={(value) => setNewReservation({ ...newReservation, tableNumber: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((table) => (
                      <SelectItem key={table} value={table}>
                        {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button type="submit" className="w-full bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-bold text-lg py-3 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200">
                  <Users className="w-5 h-5 mr-1" />
                  Create Reservation
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Reservations List */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-bold mb-2">Upcoming Reservations</h2>
            {reservations.length === 0 ? (
              <Card className="shadow-md rounded-2xl border-0">
                <CardContent className="text-center py-12">
                  <Users className="h-14 w-14 text-gray-300 mx-auto mb-6" />
                  <p className="text-gray-500 text-lg">No reservations yet</p>
                  <p className="text-base text-gray-400">Reservations will appear here when created</p>
                </CardContent>
              </Card>
            ) : (
              reservations.map((res) => (
                <Card key={res.id} className="shadow-md rounded-2xl border-0">
                  <CardContent className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-400"><Users className="w-5 h-5" /></span>
                        <span className="font-semibold text-lg">{res.customerName}</span>
                        <Badge className={getStatusColor(res.status) + " ml-2"}>{res.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                        <Phone className="w-4 h-4" />
                        <span>{res.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                        <Users className="w-4 h-4" />
                        <span>{res.guests} Guest{res.guests > 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-sm mb-1">
                        <Calendar className="w-4 h-4" />
                        <span>{res.date}</span>
                        <Clock className="w-4 h-4 ml-2" />
                        <span>{res.time}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-table"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
                        <span>{res.tableNumber}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 md:items-end w-40">
                      {res.status === "Confirmed" && (
                        <Button
                          size="lg"
                          className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200 transform hover:scale-105"
                          onClick={() => updateReservationStatus(res.id, "Seated")}
                        >
                          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                          Mark as Seated
                        </Button>
                      )}
                      {res.status === "Seated" && (
                        <Button
                          size="lg"
                          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200 transform hover:scale-105"
                          onClick={() => updateReservationStatus(res.id, "Confirmed")}
                        >
                          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                          Mark as Confirmed
                        </Button>
                      )}
                      <Button
                        size="lg"
                        variant="destructive"
                        className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all duration-200 transform hover:scale-105"
                        onClick={() => deleteReservation(res.id)}
                      >
                        <Trash2 className="w-5 h-5 mr-1" /> Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
