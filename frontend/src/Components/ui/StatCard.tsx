// src/Components/ui/StatCard.tsx
import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  darkMode?: boolean;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow">
      <h3 className="text-sm text-gray-500">{label}</h3>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
