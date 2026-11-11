import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that never require authentication
const PUBLIC_PATHS = ["/login", "/403", "/404", "/_not-found", "/not-found"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow Next.js build-time prerendering, static assets, internal paths, and API routes
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    request.headers.has("x-prerender-revalidate") ||
    request.headers.has("x-next-prerender") ||
    request.headers.get("user-agent")?.includes("Next.js") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/_") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") // e.g. favicon.ico, images, manifest.json
  ) {
    return NextResponse.next();
  }

  // 2. Dev routes protection: only allowed in non-production environments with mock mode enabled
  if (pathname.startsWith("/dev")) {
    if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_USE_MOCK !== "true") {
      return NextResponse.redirect(new URL("/403", request.url));
    }
    return NextResponse.next();
  }

  // 3. Extract auth cookies
  const token = request.cookies.get("pos_token")?.value;
  const role = request.cookies.get("pos_role")?.value;
  const isAuthenticated = Boolean(token);

  // 4. Handle root path "/" -> redirect by role
  if (pathname === "/") {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin/menu", request.url));
    }
    return NextResponse.redirect(new URL("/floor-1", request.url));
  }

  // 5. If already logged in and visiting /login -> redirect to home
  if (pathname === "/login") {
    if (isAuthenticated) {
      const redirectUrl = request.nextUrl.searchParams.get("redirect");
      if (redirectUrl && redirectUrl.startsWith("/")) {
        return NextResponse.redirect(new URL(redirectUrl, request.url));
      }
      if (role === "admin") {
        return NextResponse.redirect(new URL("/admin/menu", request.url));
      }
      return NextResponse.redirect(new URL("/floor-1", request.url));
    }
    return NextResponse.next();
  }

  // 6. If accessing public error pages (/403, /404) -> allow
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC_PATHS.includes(normalizedPath) || PUBLIC_PATHS.some((path) => pathname.startsWith(path + "/"))) {
    return NextResponse.next();
  }

  // 7. Protected routes: check if authenticated
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // 8. Admin route guard: waiters cannot access /admin/**
  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/403", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
