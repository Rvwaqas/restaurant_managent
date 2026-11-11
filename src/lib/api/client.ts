import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { env } from "@/config/env";
import type { ApiError } from "@/types";
import { clearSessionCookies } from "@/lib/auth/session";
import { useConnectionStore } from "@/store/connectionStore";

export class OfflineError extends Error {
  constructor(message = "Device is currently offline") {
    super(message);
    this.name = "OfflineError";
  }
}

interface CustomRequestConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

const apiClient = axios.create({
  baseURL: env.apiUrl,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Dynamically attach mock adapter ONLY if mock mode is explicitly enabled
if (env.useMock) {
  void import("./mock").then(({ setupMockApi }) => {
    setupMockApi();
  });
}

// Request interceptor — attach Bearer token and adjust timeouts
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Dynamically adjust baseURL if running in browser on test port
    if (typeof window !== "undefined") {
      config.baseURL = env.apiUrl;
    }
    // Check if browser is strictly offline before dispatching
    if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine === false) {
      useConnectionStore.getState().setBrowserOnline(false);
      // Let GET requests return cached or fail quickly
      if (config.method?.toLowerCase() !== "get") {
        return Promise.reject(new OfflineError("Cannot perform modifications while offline"));
      }
    }

    // Attach timeout overrides per category
    if (config.url?.includes("/reports/")) {
      config.timeout = config.timeout ?? 20000;
    } else if (config.url?.includes("/uploads")) {
      config.timeout = config.timeout ?? 30000;
    }

    // Attach Authorization header
    if (typeof window !== "undefined") {
      const authData = localStorage.getItem("auth-storage");
      if (authData) {
        try {
          const parsed = JSON.parse(authData);
          const token = parsed?.state?.token;
          if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — retry GET requests on failure & report connection health
apiClient.interceptors.response.use(
  (response) => {
    // Record healthy connection
    useConnectionStore.getState().reportSuccess();
    return response;
  },
  async (error: AxiosError<{ message?: string; detail?: string }>) => {
    const config = error.config as CustomRequestConfig | undefined;

    // Report network failure to connection store
    const isNetworkError = !error.response || error.code === "ECONNABORTED";
    const isServerError = (error.response?.status ?? 0) >= 500;

    if (isNetworkError || isServerError) {
      useConnectionStore.getState().reportFailure();
    }

    // Automatic retry for GET requests ONLY (max 2 retries, 400ms then 1200ms)
    const isGet = config?.method?.toLowerCase() === "get";
    if (config && isGet && (isNetworkError || isServerError)) {
      config._retryCount = config._retryCount ?? 0;
      if (config._retryCount < 2) {
        config._retryCount += 1;
        const delayMs = config._retryCount === 1 ? 400 : 1200;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return apiClient.request(config);
      }
    }

    // Format normalized ApiError
    const data = error.response?.data as { message?: string; detail?: string | any[]; details?: string; code?: string } | undefined;
    let errorMessage = "An unexpected error occurred";
    let errorDetails: string | undefined;

    if (data) {
      if (typeof data.message === "string" && data.message.trim()) {
        errorMessage = data.message;
      } else if (typeof data.detail === "string" && data.detail.trim()) {
        errorMessage = data.detail;
      } else if (Array.isArray(data.detail)) {
        errorMessage = data.detail
          .map((d: any) => `${d.loc ? d.loc.filter((p: any) => p !== "body").join(".") + ": " : ""}${d.msg || JSON.stringify(d)}`)
          .join("; ");
      } else if (typeof data.details === "string" && data.details.trim()) {
        errorMessage = data.details;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (typeof data.detail === "string") {
        errorDetails = data.detail;
      } else if (typeof data.details === "string") {
        errorDetails = data.details;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    const apiError: ApiError = {
      status: error.response?.status ?? (error.code === "ECONNABORTED" ? 408 : 500),
      message: errorMessage,
      details: errorDetails,
      code: data?.code || (error.code ?? undefined),
    };

    // On 401 on protected endpoints (excluding login itself), clear session & redirect
    const isLoginEndpoint = error.config?.url?.includes("/auth/login");
    if (apiError.status === 401 && !isLoginEndpoint && typeof window !== "undefined") {
      clearSessionCookies();
      localStorage.removeItem("auth-storage");
      if (!window.location.pathname.startsWith("/login")) {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }

    return Promise.reject(apiError);
  }
);

export { apiClient };
