import type React from "react";
import { UtensilsCrossed } from "lucide-react";
import { APP_NAME, APP_DESCRIPTION } from "@/config/app";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-6 select-none safe-top safe-bottom">
      <div className="w-full max-w-md">
        {/* Brand Banner */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-white shadow-lg mb-4 ring-4 ring-primary/20">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
            {APP_NAME}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {APP_DESCRIPTION}
          </p>
        </div>

        {/* Auth Box Container */}
        <div className="bg-white rounded-2xl border-2 border-border shadow-md p-6 sm:p-8">
          {children}
        </div>

        {/* Offline local wifi banner */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border shadow-xs">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>Local WiFi POS Server &bull; Tablet Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}

