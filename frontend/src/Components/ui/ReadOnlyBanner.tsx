// src/Components/ui/ReadOnlyBanner.tsx
import React from "react";
import { Link } from "react-router-dom";
import { Eye, LayoutGrid } from "lucide-react";

/**
 * Tells a read-only observer why the controls they expect are missing.
 *
 * Without this the dashboard just looks broken - a products page with no way to add a
 * product reads as a bug, not as a permission. Saying so once, at the top, is cheaper
 * than a disabled button on every row.
 *
 * It also carries the only route back to the view picker. HR borrows all three
 * dashboards, and the sidebar of whichever one it is looking at offers "Sign out" but
 * no way to switch - without this link, changing view means signing out and back in.
 */
export function ReadOnlyBanner({ darkMode }: { darkMode?: boolean }) {
  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-sm ${
        darkMode
          ? "bg-amber-900/20 border-amber-700/40 text-amber-200"
          : "bg-amber-50 border-amber-200 text-amber-900"
      }`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">View-only access.</strong>{" "}
          You can see every page, but not add, change or delete anything.
        </span>
      </span>

      <Link
        to="/hr"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium transition-colors ${
          darkMode
            ? "border-amber-700/50 hover:bg-amber-900/40"
            : "border-amber-300 hover:bg-amber-100"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        Switch view
      </Link>
    </div>
  );
}
