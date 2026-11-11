"use client";

import { Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/app";
import { useUiStore, useAuthStore } from "@/store";
import { ConnectionPill } from "@/components/common/connection-banner";

export function Header() {
  const { toggleSidebar, setDeviceSettingsOpen } = useUiStore();
  const { user, token, logout } = useAuthStore();
  const isAuthenticated = Boolean(token && user);

  return (
    <header className="bg-white px-6 py-3 flex items-center justify-between border-b shadow-sm h-16 select-none">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden" aria-label="Toggle navigation">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="font-extrabold text-lg text-gray-800 tracking-wide">
          {APP_NAME}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Connection pill */}
        <ConnectionPill />

        {/* Device Settings Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeviceSettingsOpen(true)}
          className="h-10 w-10 p-0 rounded-xl text-gray-600 hover:text-gray-900"
          title="Tablet Device Settings"
          aria-label="Tablet Device Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-bold text-gray-800">{user.name}</div>
              <div className="text-xs text-gray-500 capitalize">{user.role}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => logout()} className="text-xs rounded-lg">
              Logout
            </Button>
          </div>
        ) : (
          <div className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200">
            Mock Mode (Offline WiFi)
          </div>
        )}
      </div>
    </header>
  );
}
