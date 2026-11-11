"use client";

import React, { useState, useEffect } from "react";
import { useUiStore } from "@/store/uiStore";
import { Button } from "@/components/ui/button";
import {
  Volume2,
  VolumeX,
  Vibrate,
  Sun,
  Maximize2,
  Minimize2,
  Type,
  Download,
  X,
  Info,
  Smartphone,
} from "lucide-react";
import { feedback } from "@/lib/device/feedback";
import {
  isWakeLockSupported,
  isSecureContext,
  requestWakeLock,
  releaseWakeLock,
} from "@/lib/device/wakeLock";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function DeviceSettingsSheet() {
  const {
    deviceSettingsOpen,
    setDeviceSettingsOpen,
    soundEnabled,
    setSoundEnabled,
    hapticsEnabled,
    setHapticsEnabled,
    wakeLockEnabled,
    setWakeLockEnabled,
    largeText,
    setLargeText,
  } = useUiStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [wakeLockMsg, setWakeLockMsg] = useState<string | null>(null);

  useEffect(() => {
    if (deferredPrompt) {
      setCanInstall(true);
    }

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  useEffect(() => {
    const checkFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", checkFullscreen);
    return () => document.removeEventListener("fullscreenchange", checkFullscreen);
  }, []);

  if (!deviceSettingsOpen) return null;

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    if (enabled) {
      feedback.confirm();
    }
  };

  const handleToggleHaptics = (enabled: boolean) => {
    setHapticsEnabled(enabled);
    if (enabled) {
      feedback.tick();
    }
  };

  const handleToggleWakeLock = async (enabled: boolean) => {
    setWakeLockEnabled(enabled);
    if (enabled) {
      if (!isWakeLockSupported()) {
        setWakeLockMsg("Screen Wake Lock is not supported on this browser.");
        return;
      }
      if (!isSecureContext()) {
        setWakeLockMsg("Keep screen awake requires HTTPS or localhost (disabled on plain HTTP).");
        return;
      }
      const ok = await requestWakeLock();
      if (!ok) {
        setWakeLockMsg("Unable to activate Screen Wake Lock.");
      } else {
        setWakeLockMsg(null);
      }
    } else {
      await releaseWakeLock();
      setWakeLockMsg(null);
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen rejected or unsupported
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setCanInstall(false);
      }
      deferredPrompt = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-white rounded-3xl border border-border p-6 shadow-xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Tablet Device Preferences</h2>
              <p className="text-xs text-muted-foreground">Adjust audio, screen and touch settings</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeviceSettingsOpen(false)}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings items list */}
        <div className="space-y-4 text-xs">
          {/* Sound */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-border">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-primary" />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-400" />
              )}
              <div>
                <p className="font-bold text-gray-900">Audio Feedback</p>
                <p className="text-muted-foreground text-[11px]">Short confirmation beeps on actions</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSound(!soundEnabled)}
              className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
                soundEnabled ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  soundEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Haptics */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-border">
            <div className="flex items-center gap-3">
              <Vibrate className="w-5 h-5 text-primary" />
              <div>
                <p className="font-bold text-gray-900">Haptic Vibration</p>
                <p className="text-muted-foreground text-[11px]">Tactile pulse on button tap</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleToggleHaptics(!hapticsEnabled)}
              className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
                hapticsEnabled ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  hapticsEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Keep Screen Awake */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-border">
              <div className="flex items-center gap-3">
                <Sun className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-bold text-gray-900">Keep Screen Awake</p>
                  <p className="text-muted-foreground text-[11px]">Prevents display sleep during rush</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleWakeLock(!wakeLockEnabled)}
                className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
                  wakeLockEnabled ? "bg-primary" : "bg-gray-300"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    wakeLockEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {wakeLockMsg && (
              <p className="text-[11px] text-amber-700 px-2 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{wakeLockMsg}</span>
              </p>
            )}
          </div>

          {/* Large Text */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-border">
            <div className="flex items-center gap-3">
              <Type className="w-5 h-5 text-primary" />
              <div>
                <p className="font-bold text-gray-900">Large Tablet Text</p>
                <p className="text-muted-foreground text-[11px]">Scales base typography for fast scanning</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLargeText(!largeText)}
              className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
                largeText ? "bg-primary" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  largeText ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Fullscreen Button */}
          {typeof document !== "undefined" && document.fullscreenEnabled && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-border">
              <div className="flex items-center gap-3">
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-primary" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-gray-600" />
                )}
                <div>
                  <p className="font-bold text-gray-900">Fullscreen Tablet Mode</p>
                  <p className="text-muted-foreground text-[11px]">Hides browser navigation bar</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleFullscreen}
                className="min-h-[36px] px-3 rounded-xl font-semibold border-border bg-white"
              >
                {isFullscreen ? "Exit" : "Expand"}
              </Button>
            </div>
          )}

          {/* PWA Install Button / Note */}
          <div className="p-3 rounded-2xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <span className="font-bold text-gray-900">Home Screen PWA</span>
              </div>
              {canInstall && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleInstallApp}
                  className="min-h-[36px] px-3 rounded-xl font-semibold text-xs"
                >
                  Install App
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {canInstall
                ? "Tap Install to add Resto POS to your tablet home screen."
                : "To install as a standalone app, open the browser menu and select 'Add to Home screen'."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={() => setDeviceSettingsOpen(false)}
            className="min-h-[48px] rounded-xl font-bold"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

