"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store";

export default function ForbiddenPage() {
  const { user } = useAuthStore();

  // Determine home route based on user role and floor permissions
  const homeHref = React.useMemo(() => {
    if (!user) return "/login";
    if (user.role === "admin") return "/admin/menu";
    if (user.allowedFloors && user.allowedFloors.length > 0) {
      return `/${user.allowedFloors[0]}`;
    }
    return "/floor-1";
  }, [user]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 select-none safe-top safe-bottom">
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-border p-8 shadow-lg text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-sm">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            403 - Access Forbidden
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You don&apos;t have permission to access this page or floor. Please contact the restaurant manager if you believe this is in error.
          </p>
        </div>

        {user && (
          <div className="p-3 bg-gray-50 border border-border rounded-xl text-xs text-gray-600 text-left space-y-1">
            <div>
              Signed in as: <strong className="text-gray-900">{user.name}</strong> ({user.username})
            </div>
            <div>
              Role: <strong className="text-gray-900 uppercase">{user.role}</strong>
            </div>
            {user.role === "waiter" && user.allowedFloors && (
              <div>
                Permitted Floors:{" "}
                <span className="font-mono font-bold text-primary">
                  {user.allowedFloors.join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link href={homeHref} className="flex-1">
            <Button variant="primary" size="lg" fullWidth className="font-bold shadow-sm">
              <Home className="w-5 h-5 mr-2" />
              <span>Go to My Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

