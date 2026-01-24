// src/Components/dashboard/DashboardHeader.tsx
import React from "react";
import { Sun, Moon, Search } from "lucide-react";
import { Spinner } from "../ui/Spinner";

interface DashboardHeaderProps {
  title: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  // Search
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  // Save/Undo
  showSaveUndo?: boolean;
  isDirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onUndo?: () => void;
  // Custom actions
  children?: React.ReactNode;
}

export function DashboardHeader({
  title,
  darkMode,
  onToggleDarkMode,
  showSearch = false,
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  showSaveUndo = false,
  isDirty = false,
  saving = false,
  onSave,
  onUndo,
  children,
}: DashboardHeaderProps) {
  return (
    <header className="h-16 bg-white dark:bg-gray-800 shadow-md flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
        {title}
      </h1>

      <div className="flex items-center gap-2 flex-1 justify-end">
        {showSearch && onSearchChange && (
          <div className="relative flex-1 max-w-md">
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-full px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-100"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-300" />
          </div>
        )}

        {children}

        {showSaveUndo && (
          <>
            <button
              onClick={onUndo}
              disabled={!isDirty || saving}
              className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 disabled:opacity-40 transition"
            >
              Undo
            </button>

            <button
              onClick={onSave}
              disabled={!isDirty || saving}
              className="px-3 py-1 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm shadow-lg transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </>
        )}

        <button
          onClick={onToggleDarkMode}
          className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          {darkMode ? (
            <Sun className="h-5 w-5 text-yellow-400" />
          ) : (
            <Moon className="h-5 w-5 text-gray-600" />
          )}
        </button>
      </div>
    </header>
  );
}
