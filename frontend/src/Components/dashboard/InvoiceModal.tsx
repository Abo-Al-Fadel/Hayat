// src/Components/dashboard/InvoiceModal.tsx
import React from "react";
import toast from "react-hot-toast";
import type { OrderDetailView } from "../../hooks/useOrders";

interface InvoiceModalProps {
  order: OrderDetailView;
  darkMode?: boolean;
  onClose: () => void;
}

export function InvoiceModal({ order, darkMode = false, onClose }: InvoiceModalProps) {
  const handleCopy = () => {
    navigator.clipboard?.writeText(JSON.stringify(order));
    toast.success("Copied order JSON");
  };

  const handlePrint = () => {
    window.print();
  };

  const computedTotal =
    order.totalPrice ||
    order.items?.reduce((s, it) => s + (it.lineTotal ?? it.price * it.quantity), 0) ||
    0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-lg p-6 shadow-xl text-gray-800 dark:text-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold">Invoice #{order.id}</h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {new Date(order.createdAt).toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded ${
                darkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"
              }`}
              onClick={handleCopy}
            >
              Copy
            </button>
            <button
              className="px-3 py-1 rounded bg-purple-600 text-white"
              onClick={handlePrint}
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="text-sm text-gray-500 dark:text-gray-400 ml-2"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4">
          {/* If server returned textual invoice (invoiceText) show as formatted text */}
          {order.invoiceText ? (
            <div
              className={`p-4 rounded border ${
                darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
              } whitespace-pre-wrap text-sm`}
            >
              {order.invoiceText}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2">Item</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">Price</th>
                      <th className="pb-2">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((it, idx) => (
                      <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-2">{it.medicineName}</td>
                        <td className="py-2">{it.quantity}</td>
                        <td className="py-2">${Number(it.price ?? 0).toFixed(2)}</td>
                        <td className="py-2">
                          ${Number(it.lineTotal ?? it.price * it.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
                  <div className="text-2xl font-bold">${Number(computedTotal).toFixed(2)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
