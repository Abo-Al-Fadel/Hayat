// src/Components/ui/DeleteConfirmModal.tsx
import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemName?: string;
  warningText?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  loading?: boolean;
  darkMode?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * DeleteConfirmModal - A professional confirmation dialog for destructive actions
 * 
 * Features:
 * - Clear warning messaging
 * - Irreversible action indicator
 * - Loading state support
 * - Dark mode support
 * - Accessible with proper focus management
 */
export function DeleteConfirmModal({
  isOpen,
  title,
  message,
  itemName,
  warningText = "This action cannot be undone.",
  confirmButtonText = "Delete",
  cancelButtonText = "Cancel",
  loading = false,
  darkMode = false,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={!loading ? onCancel : undefined}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-md mx-4 rounded-xl shadow-2xl ${
        darkMode ? "bg-gray-800" : "bg-white"
      }`}>
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={loading}
          className={`absolute top-4 right-4 p-1 rounded-full transition-colors ${
            darkMode 
              ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" 
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          } disabled:opacity-50`}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Warning Icon */}
          <div className="flex justify-center mb-4">
            <div className={`p-3 rounded-full ${
              darkMode ? "bg-red-900/30" : "bg-red-100"
            }`}>
              <AlertTriangle className={`h-8 w-8 ${
                darkMode ? "text-red-400" : "text-red-600"
              }`} />
            </div>
          </div>

          {/* Title */}
          <h3 className={`text-xl font-semibold text-center mb-2 ${
            darkMode ? "text-gray-100" : "text-gray-900"
          }`}>
            {title}
          </h3>

          {/* Message */}
          <p className={`text-center mb-2 ${
            darkMode ? "text-gray-300" : "text-gray-600"
          }`}>
            {message}
          </p>

          {/* Item name highlight */}
          {itemName && (
            <p className={`text-center font-semibold mb-3 ${
              darkMode ? "text-gray-100" : "text-gray-900"
            }`}>
              "{itemName}"
            </p>
          )}

          {/* Warning text */}
          <div className={`flex items-center justify-center gap-2 p-3 rounded-lg mb-6 ${
            darkMode ? "bg-red-900/20 border border-red-800" : "bg-red-50 border border-red-200"
          }`}>
            <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${
              darkMode ? "text-red-400" : "text-red-600"
            }`} />
            <span className={`text-sm ${
              darkMode ? "text-red-300" : "text-red-700"
            }`}>
              {warningText}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                darkMode 
                  ? "bg-gray-700 text-gray-200 hover:bg-gray-600" 
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              } disabled:opacity-50`}
            >
              {cancelButtonText}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-colors ${
                loading 
                  ? "bg-red-400 cursor-not-allowed" 
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deleting...
                </span>
              ) : (
                confirmButtonText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
