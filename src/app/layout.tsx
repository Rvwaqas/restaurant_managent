import type React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION } from "@/config/app";
import { Toaster } from "@/components/ui/toaster";
import { ConnectionBanner } from "@/components/common/connection-banner";
import { ServiceWorkerRegister } from "@/components/layout/service-worker-register";
import { DeviceSettingsSheet } from "@/components/layout/device-settings-sheet";
import { AutoLockOverlay } from "@/components/layout/auto-lock-overlay";
import { RealtimeInitializer } from "@/components/layout/realtime-initializer";

export const metadata: Metadata = {
  title: {
    template: `%s | ${APP_NAME}`,
    default: APP_NAME,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents accidental double-tap zoom on tablet touchscreen
  viewportFit: "cover",
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="font-sans antialiased bg-background text-foreground min-h-screen min-h-[100dvh] flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
        <ConnectionBanner />
        <main className="flex-1 flex flex-col">{children}</main>
        <Toaster />
        <ServiceWorkerRegister />
        <DeviceSettingsSheet />
        <AutoLockOverlay />
        <RealtimeInitializer />
      </body>
    </html>
  );
}
