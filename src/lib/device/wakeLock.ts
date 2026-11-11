type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
};

let sentinel: WakeLockSentinel | null = null;
let keepAwakeRequested = false;

export function isWakeLockSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "wakeLock" in navigator && typeof navigator.wakeLock?.request === "function";
}

export function isSecureContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext ?? (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
}

export async function requestWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported()) return false;
  keepAwakeRequested = true;

  try {
    sentinel = await (navigator.wakeLock as unknown as { request: (type: string) => Promise<WakeLockSentinel> }).request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
    });
    return true;
  } catch (err) {
    console.warn("Screen Wake Lock request failed", err);
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  keepAwakeRequested = false;
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      // Ignore release error
    } finally {
      sentinel = null;
    }
  }
}

// Re-acquire wake lock if tab is made visible again
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && keepAwakeRequested && !sentinel) {
      await requestWakeLock();
    }
  });
}

