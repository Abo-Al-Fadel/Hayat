// src/Components/dashboard/OrderListItem.tsx
import React from "react";
import type { OrderSummary } from "../../Services/OrderService";

interface OrderListItemProps {
  order: OrderSummary;
  onView: (orderId: number) => void;
}

export function OrderListItem({ order, onView }: OrderListItemProps) {
  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow flex items-center justify-between">
      <div>
        <div className="font-semibold">Invoice #{order.id}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {new Date(order.createdAt).toLocaleString()}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {order.itemsCount} items — ${order.totalPrice.toFixed(2)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onView(order.id)}
          className="px-3 py-1 rounded-md bg-purple-600 text-white"
        >
          View
        </button>
      </div>
    </div>
  );
}
