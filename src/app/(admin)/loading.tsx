import React from "react";

export default function AdminLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-pulse select-none">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-72 bg-gray-100 rounded" />
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-white rounded-2xl border border-border p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="w-8 h-8 rounded-xl bg-gray-100" />
            </div>
            <div className="h-7 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-28 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Main content block skeleton */}
      <div className="h-96 bg-white rounded-2xl border border-border p-6" />
    </div>
  );
}

