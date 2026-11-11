import React from "react";

export default function AuthLoading() {
  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white rounded-3xl border border-border shadow-sm space-y-6 animate-pulse">
      <div className="h-12 w-12 rounded-2xl bg-gray-200 mx-auto" />
      <div className="space-y-2 text-center">
        <div className="h-6 w-40 bg-gray-200 rounded mx-auto" />
        <div className="h-4 w-60 bg-gray-100 rounded mx-auto" />
      </div>
      <div className="space-y-4 pt-2">
        <div className="h-12 bg-gray-100 rounded-xl" />
        <div className="h-12 bg-gray-100 rounded-xl" />
        <div className="h-12 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}

