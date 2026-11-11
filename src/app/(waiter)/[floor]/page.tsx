"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { FloorClientGuard } from "./floor-client-guard";
import { FloorTableGrid } from "@/components/tables/floor-table-grid";
import type { Floor } from "@/types";

const FLOORS_DATA: Record<string, Floor> = {
  "floor-1": {
    id: "f1",
    slug: "floor-1",
    name: "Floor 1 (Arabic)",
    menuType: "halal",
  },
  "floor-2": {
    id: "f2",
    slug: "floor-2",
    name: "Floor 2 (Malaysian)",
    menuType: "non-halal",
  },
};

interface FloorPageProps {
  params: Promise<{ floor: string }>;
}

export default function FloorPage({ params }: FloorPageProps) {
  const { floor: floorSlug } = use(params);

  if (floorSlug !== "floor-1" && floorSlug !== "floor-2") {
    notFound();
  }

  const floor = FLOORS_DATA[floorSlug];
  if (!floor) {
    notFound();
  }

  return (
    <FloorClientGuard floorSlug={floorSlug}>
      <FloorTableGrid floor={floor} />
    </FloorClientGuard>
  );
}
