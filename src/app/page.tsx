"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, useUiStore } from "@/store";
import { LoadingScreen } from "@/components/ui/loading-screen";
import type { FloorSlug } from "@/types";

export default function RootHomePage() {
  const router = useRouter();
  const { user, hasHydrated, token } = useAuthStore();
  const { getLastVisitedFloor } = useUiStore();

  useEffect(() => {
    if (!hasHydrated) return;

    if (!token || !user) {
      router.replace("/login");
      return;
    }

    if (user.role === "admin") {
      router.replace("/admin/menu");
      return;
    }

    // Waiter role: determine floor
    const lastFloor = getLastVisitedFloor(user.id) as FloorSlug | undefined;
    const isAllowed = !user.allowedFloors || (lastFloor && user.allowedFloors.includes(lastFloor));

    if (lastFloor && isAllowed) {
      router.replace(`/${lastFloor}`);
    } else if (user.allowedFloors && user.allowedFloors.length > 0) {
      router.replace(`/${user.allowedFloors[0]}`);
    } else {
      router.replace("/floor-1");
    }
  }, [hasHydrated, token, user, getLastVisitedFloor, router]);

  return <LoadingScreen message="Routing to shift terminal..." />;
}
