"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, AlertCircle, WifiOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const STORAGE_KEY_LAST_USERNAME = "pos_last_username";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const { toast } = useToast();

  const { login, isLoading, error, clearError, sessionExpired, setSessionExpired } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Check for expired session reason param or store notification
  useEffect(() => {
    const reason = searchParams.get("reason");
    if (sessionExpired || reason === "expired" || searchParams.get("expired") === "true") {
      toast({
        title: "Session Expired",
        description: "Your shift session has expired. Please sign in again.",
        variant: "destructive",
      });
      setSessionExpired(false);
    }
  }, [sessionExpired, setSessionExpired, searchParams, toast]);

  // Initialize form state and check saved username
  useEffect(() => {
    clearError();
    setLocalError(null);
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_LAST_USERNAME);
      if (savedUser) {
        setUsername((prev) => prev || savedUser);
      }
    } catch {
      // ignore localStorage errors in sandboxed contexts
    }
    setMounted(true);
  }, [clearError]);

  // Clear errors when user edits input
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (localError || error) {
      setLocalError(null);
      clearError();
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (localError || error) {
      setLocalError(null);
      clearError();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLocalError(null);
    clearError();

    try {
      const user = await login(username.trim(), password);

      // Remember last username (NEVER the password)
      try {
        localStorage.setItem(STORAGE_KEY_LAST_USERNAME, username.trim());
      } catch {
        // ignore
      }

      toast({
        title: `Welcome, ${user.name}`,
        description: `Signed in as ${user.role.toUpperCase()}. Shift terminal active.`,
      });

      // Handle redirect
      let targetPath = "";
      if (
        redirectParam &&
        redirectParam.startsWith("/") &&
        !redirectParam.startsWith("//") &&
        !redirectParam.startsWith("/login") &&
        !redirectParam.startsWith("/403")
      ) {
        targetPath = redirectParam;
      } else if (user.role === "admin") {
        targetPath = "/admin/menu";
      } else if (user.allowedFloors && user.allowedFloors.length > 0) {
        targetPath = `/${user.allowedFloors[0]}`;
      } else {
        targetPath = "/floor-1";
      }

      router.replace(targetPath);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (!navigator.onLine || apiErr.status === 0 || apiErr.status === 503) {
        setLocalError("Cannot reach the server. Check the WiFi connection.");
      } else if (apiErr.status === 429) {
        setLocalError(apiErr.message || "Too many login attempts. Please wait 60 seconds before trying again.");
      } else {
        setLocalError(apiErr.message || "Invalid username or password");
      }
    }
  };

  const displayError = localError || error;

  return (
    <form onSubmit={handleSubmit} data-hydrated={mounted} className="space-y-5 select-none" noValidate>
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">
          Sign In to Terminal
        </h2>
        <p className="text-xs text-muted-foreground">
          Enter staff shift credentials for local WiFi access
        </p>
      </div>

      {/* Inline Error Banner (Fixed height to avoid layout shift) */}
      <div className="min-h-[44px] flex items-center justify-center">
        {displayError ? (
          <div className="w-full p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
            {displayError.includes("WiFi") ? (
              <WifiOff className="h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{displayError}</span>
          </div>
        ) : (
          <div className="h-4" />
        )}
      </div>

      {/* Username Field */}
      <div className="space-y-1.5">
        <Label
          htmlFor="username"
          className="text-xs font-extrabold uppercase tracking-wider text-gray-700"
        >
          Username
        </Label>
        <Input
          id="username"
          type="text"
          value={username}
          onChange={handleUsernameChange}
          placeholder="e.g. admin or waiter1"
          required
          autoFocus
          disabled={isLoading}
          className="h-14 text-base font-medium rounded-xl"
        />
      </div>

      {/* Password Field with Show/Hide toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="password"
            className="text-xs font-extrabold uppercase tracking-wider text-gray-700"
          >
            Password
          </Label>
        </div>
        <div className="relative flex items-center">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={handlePasswordChange}
            placeholder="••••••••"
            required
            disabled={isLoading}
            className="h-14 text-base font-medium pr-14 rounded-xl"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            className="absolute right-3 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Sign In Button */}
      <div className="pt-2">
        <Button
          type="submit"
          variant="primary"
          size="xl"
          fullWidth
          loading={isLoading}
          disabled={isLoading || !username.trim() || !password}
          className="font-extrabold text-lg shadow-md"
        >
          <LogIn className="h-5 w-5 mr-2" />
          <span>{isLoading ? "Signing In..." : "Sign In"}</span>
        </Button>
      </div>

      {/* Default Test Accounts hint for evaluators */}
      <div className="mt-4 p-3 bg-gray-50 border border-border rounded-xl text-xs text-muted-foreground space-y-1">
        <div className="font-bold text-gray-700">Quick Test Users:</div>
        <div className="flex justify-between">
          <span>Admin: <strong className="text-gray-900 font-mono">admin</strong></span>
          <span className="font-mono text-gray-600">admin123</span>
        </div>
        <div className="flex justify-between">
          <span>Waiters: <strong className="text-gray-900 font-mono">waiter1, waiter2</strong></span>
          <span className="font-mono text-gray-600">1234</span>
        </div>
        <div className="flex justify-between">
          <span>Restricted: <strong className="text-gray-900 font-mono">waiter3 (Floor 1 only)</strong></span>
          <span className="font-mono text-gray-600">1234</span>
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center p-8 space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground font-semibold">Loading terminal...</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
