function getEnvBoolean(val: string | undefined, defaultValue: boolean): boolean {
  if (val === undefined || val === "") return defaultValue;
  return val === "true" || val === "1";
}

function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    // If running on e2e test port 3100, default backend is port 8100
    if (window.location.port === "3100") {
      return `${window.location.protocol}//${window.location.hostname}:8100/api`;
    }
  }
  if (typeof window === "undefined" && process.env.PORT === "3100") {
    return "http://127.0.0.1:8100/api";
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
}

const useMock = getEnvBoolean(process.env.NEXT_PUBLIC_USE_MOCK, false);
const devTools = process.env.NODE_ENV === "development" && getEnvBoolean(process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS, false);
const wsEnabled = getEnvBoolean(process.env.NEXT_PUBLIC_WS_ENABLED, true);

// Startup validation in Node environment
if (typeof window === "undefined") {
  const initialUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  if (!initialUrl.startsWith("http://") && !initialUrl.startsWith("https://")) {
    console.warn(`[Config Warning] NEXT_PUBLIC_API_URL "${initialUrl}" is not a valid HTTP/HTTPS URL.`);
  }
}

export const env = {
  get apiUrl() {
    return resolveApiUrl();
  },
  useMock,
  devTools,
  wsEnabled,
  isProduction: process.env.NODE_ENV === "production",
};
