"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { tablesService } from "@/lib/api/services";
import { FloorClientGuard } from "../../floor-client-guard";
import { OrderScreenClient } from "./order-client";
import type { Floor, Table } from "@/types";
import { Loader2 } from "lucide-react";

const FLOORS_DATA: Record<string, Floor> = {
  "floor-1": {
    id: "f1",
    slug: "floor-1",
    name: "Floor 1 (Halal)",
    menuType: "halal",
  },
  "floor-2": {
    id: "f2",
    slug: "floor-2",
    name: "Floor 2 (Non-Halal)",
    menuType: "non-halal",
  },
};

interface TableOrderPageProps {
  params: Promise<{ floor: string; tableId: string }>;
}

export default function TableOrderPage({ params }: TableOrderPageProps) {
  const { floor: floorSlug, tableId } = use(params);

  // 1. Validate floor parameter
  if (floorSlug !== "floor-1" && floorSlug !== "floor-2") {
    notFound();
  }

  const floor = FLOORS_DATA[floorSlug];
  if (!floor) {
    notFound();
  }

  const [table, setTable] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    tablesService
      .getById(tableId)
      .then((t) => {
        if (!active) return;
        if (!t || t.floorId !== floor.id) {
          setError(true);
        } else {
          setTable(t);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        const match = tableId.match(/^(f[12])-t(\d+)$/);
        if (match && match[1] === floor.id) {
          const num = parseInt(match[2], 10);
          setTable({
            id: tableId,
            floorId: floor.id,
            number: floor.id === "f1" ? num : 10 + num,
            capacity: 4,
            status: "free",
            isActive: true,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tableId, floor.id]);

  if (error) {
    notFound();
  }

  if (loading || !table) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <FloorClientGuard floorSlug={floorSlug}>
      <OrderScreenClient floor={floor} table={table} />
    </FloorClientGuard>
  );
}
