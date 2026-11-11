import React from "react";

export default function WaiterLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-6 animate-pulse max-w-7xl mx-auto select-none">
      {/* Floor summary skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-border">
        <div className="space-y-2">
          <div className="h-6 w-36 bg-gray-200 rounded-lg" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-gray-100 rounded-xl" />
          <div className="h-10 w-24 bg-gray-100 rounded-xl" />
        </div>
      </div>

      {/* Grid of tables skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-2xl bg-white border border-border p-4 flex flex-col justify-between"
          >
            <div className="flex justify-between items-center">
              <div className="h-6 w-12 bg-gray-200 rounded" />
              <div className="h-5 w-16 bg-gray-100 rounded-full" />
            </div>
            <div className="h-8 w-24 bg-gray-100 rounded mx-auto" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

