"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Store, DollarSign, Bell, Users } from "lucide-react"
import { useRestaurant } from "@/hooks/use-restaurant-data"

export default function SettingsPage() {
  const { dispatch } = useRestaurant();
  const [settings, setSettings] = useState({
    restaurantName: "CHILI POS",
    address: "123 Main Street, City, State 12345",
    phone: "+1 (555) 123-4567",
    email: "info@chilipos.com",
    taxRate: "5",
    currency: "USD",
    timezone: "America/New_York",
    notifications: true,
    autoAcceptOrders: false,
    printReceipts: true,
    maxTables: "12",
    operatingHours: {
      open: "09:00",
      close: "22:00",
    },
  })

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("restaurant-settings")
    if (saved) setSettings(JSON.parse(saved))
  }, [])

  const handleSave = () => {
    localStorage.setItem("restaurant-settings", JSON.stringify(settings))
    dispatch && dispatch({ type: "UPDATE_SETTINGS", payload: settings })
    alert("Settings saved successfully!")
  }

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all settings to default?")) {
      setSettings({
        restaurantName: "CHILI POS",
        address: "123 Main Street, City, State 12345",
        phone: "+1 (555) 123-4567",
        email: "info@chilipos.com",
        taxRate: "5",
        currency: "USD",
        timezone: "America/New_York",
        notifications: true,
        autoAcceptOrders: false,
        printReceipts: true,
        maxTables: "12",
        operatingHours: {
          open: "09:00",
          close: "22:00",
        },
      })
    }
  }

  return (
    <main className="flex-1 overflow-auto p-4">
      <div className="p-8 bg-gray-50 min-h-screen">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              Reset to Default
            </Button>
            <Button onClick={handleSave} className="shadow-lg px-6 py-2 rounded-xl text-base font-semibold">
              Save Changes
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Restaurant Information */}
          <Card className="shadow-md rounded-2xl border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Store className="h-5 w-5" />
                Restaurant Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="restaurantName">Restaurant Name</Label>
                <Input
                  id="restaurantName"
                  value={settings.restaurantName}
                  onChange={(e) => setSettings({ ...settings, restaurantName: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={settings.email}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Financial Settings */}
          <Card className="shadow-md rounded-2xl border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <DollarSign className="h-5 w-5" />
                Financial Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="taxRate">Tax Rate (%)</Label>
                <Input
                  id="taxRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={settings.taxRate}
                  onChange={(e) => setSettings({ ...settings, taxRate: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={settings.currency}
                  onValueChange={(value) => setSettings({ ...settings, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD (C$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern Time</SelectItem>
                    <SelectItem value="America/Chicago">Central Time</SelectItem>
                    <SelectItem value="America/Denver">Mountain Time</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Operational Settings */}
          <Card className="shadow-md rounded-2xl border-0 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                <Users className="h-5 w-5" />
                Operational Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="maxTables">Maximum Tables</Label>
                <Input
                  id="maxTables"
                  type="number"
                  min="1"
                  max="50"
                  value={settings.maxTables}
                  onChange={(e) => setSettings({ ...settings, maxTables: e.target.value })}
                />
              </div>

              <div>
                <Label>Operating Hours</Label>
                <div className="flex gap-2 mt-1">
                  <div className="flex-1">
                    <Label htmlFor="openTime" className="text-sm">
                      Open
                    </Label>
                    <Input
                      id="openTime"
                      type="time"
                      value={settings.operatingHours.open}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          operatingHours: { ...settings.operatingHours, open: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="closeTime" className="text-sm">
                      Close
                    </Label>
                    <Input
                      id="closeTime"
                      type="time"
                      value={settings.operatingHours.close}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          operatingHours: { ...settings.operatingHours, close: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                System Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications">Enable Notifications</Label>
                  <p className="text-sm text-gray-600">Receive alerts for new orders</p>
                </div>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, notifications: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autoAccept">Auto-accept Orders</Label>
                  <p className="text-sm text-gray-600">Automatically accept incoming orders</p>
                </div>
                <Switch
                  id="autoAccept"
                  checked={settings.autoAcceptOrders}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoAcceptOrders: checked })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="printReceipts">Print Receipts</Label>
                  <p className="text-sm text-gray-600">Automatically print order receipts</p>
                </div>
                <Switch
                  id="printReceipts"
                  checked={settings.printReceipts}
                  onCheckedChange={(checked) => setSettings({ ...settings, printReceipts: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="my-8 border-t border-gray-200" />
        {/* Data Management */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button variant="outline">Export Data</Button>
              <Button variant="outline">Import Data</Button>
              <Button variant="destructive">Clear All Data</Button>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Export your restaurant data for backup or import data from another system.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
