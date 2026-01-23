// src/Components/ui/ConfirmModal.tsx
import React from "react";
import { X, Trash2 } from "lucide-react";
import { Spinner } from "./Spinner";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  darkMode?: boolean;
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Yes, delete",
  cancelText = "No, cancel",
  loading = false,
  darkMode = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div
        className={`relative max-w-lg w-full rounded-lg shadow-2xl ${
          darkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Top-right close */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close"
        >
          <X className={`h-4 w-4 ${darkMode ? "text-gray-200" : "text-gray-700"}`} />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center ${
                darkMode ? "bg-gray-800" : "bg-red-50"
              }`}
            >
              {icon ?? (
                <Trash2 className={`h-6 w-6 ${darkMode ? "text-red-300" : "text-red-600"}`} />
              )}
            </div>

            <div className="flex-1">
              <h3 id="confirm-title" className="text-lg font-semibold">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{message}</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              className={`px-4 py-2 rounded-md border ${
                darkMode
                  ? "border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {cancelText}
            </button>

            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white shadow disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Spinner /> Deleting…
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
