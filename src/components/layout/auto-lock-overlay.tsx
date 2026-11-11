"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useUiStore, useAuthStore } from "@/store";
import { SESSION_LOCK_MINUTES, APP_NAME } from "@/config/app";
import { Lock, ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function AutoLockOverlay() {
  const router = useRouter();
  const { sessionLocked, setSessionLocked } = useUiStore();
  const { user, token, logout } = useAuthStore();
  const [lastActivity, setLastActivity] = useState(Date.now());

  const isAuthenticated = Boolean(user && token);

  const resetTimer = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ["pointerdown", "keydown", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    const checkInterval = setInterval(() => {
      const inactiveMs = Date.now() - lastActivity;
      const thresholdMs = SESSION_LOCK_MINUTES * 60 * 1000;
      if (inactiveMs >= thresholdMs && !sessionLocked) {
        setSessionLocked(true);
      }
    }, 15000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      clearInterval(checkInterval);
    };
  }, [isAuthenticated, lastActivity, sessionLocked, setSessionLocked, resetTimer]);

  if (!sessionLocked || !isAuthenticated) return null;

  const handleUnlock = () => {
    setSessionLocked(false);
    resetTimer();
  };

  const handleSignOut = () => {
    setSessionLocked(false);
    logout();
    router.push("/login");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md select-none">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-border p-8 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-sm">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Session Locked</h2>
          <p className="text-xs text-muted-foreground">
            Locked due to {SESSION_LOCK_MINUTES} minutes of inactivity
          </p>
          {user && (
            <p className="text-xs font-semibold text-gray-800 pt-1">
              Active staff: <span className="text-primary">{user.name}</span> ({user.role})
            </p>
          )}
        </div>

        <div className="pt-2 space-y-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleUnlock}
            className="font-bold min-h-[52px] rounded-xl text-base shadow-sm"
          >
            <span>Tap to Resume</span>
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={handleSignOut}
            className="text-xs text-gray-500 hover:text-gray-900 font-semibold"
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            <span>Switch User / Sign Out</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

