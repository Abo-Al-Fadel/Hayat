// src/Components/ui/ReadOnlyBanner.tsx
import React from "react";
import { Eye } from "lucide-react";

/**
 * Tells a read-only observer why the controls they expect are missing.
 *
 * Without this the dashboard just looks broken - a products page with no way to add a
 * product reads as a bug, not as a permission. Saying so once, at the top, is cheaper
 * than a disabled button on every row.
 */
export function ReadOnlyBanner({ darkMode }: { darkMode?: boolean }) {
  return (
    <div
      role="status"
      className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
        darkMode
          ? "bg-amber-900/20 border-amber-700/40 text-amber-200"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">View-only access.</strong>{" "}
        You can see every page, but not add, change or delete anything.
      </span>
    </div>
  );
}
