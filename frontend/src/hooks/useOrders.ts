// src/hooks/useOrders.ts
import { useState, useCallback, useRef } from "react";
import { getOrders, getInvoice, type OrderSummary } from "../Services/OrderService";

export interface OrderDetailView {
  id: number;
  createdAt: string;
  totalPrice: number;
  items: { medicineName: string; quantity: number; price: number; lineTotal: number }[];
  invoiceText?: string;
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetailView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Guard to prevent duplicate API calls in StrictMode
  const didFetchRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      return; // Silently skip if not authenticated - AdminDashboard handles redirect
    }

    // StrictMode guard - only fetch once
    if (didFetchRef.current) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getOrders();
      setOrders(data);
      didFetchRef.current = true;
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setError(err instanceof Error ? err : new Error("Failed to load orders"));
      // NO TOAST - let dashboard handle it
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrderDetail = useCallback(async (orderId: number) => {
    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("Not authenticated");
    }

    setLoadingDetail(true);
    try {
      const orderSummary = orders.find((o) => o.id === orderId);
      const invoiceText = await getInvoice(orderId);

      const detail: OrderDetailView = {
        id: orderId,
        createdAt: orderSummary?.createdAt ?? new Date().toISOString(),
        totalPrice: orderSummary?.totalPrice ?? 0,
        items: orderSummary?.items?.map((it) => ({
          medicineName: it.medicineName ?? "",
          quantity: it.quantity,
          price: it.price,
          lineTotal: it.lineTotal ?? it.price * it.quantity,
        })) ?? [],
        invoiceText,
      };

      setSelectedOrder(detail);
      return detail;
    } catch (err) {
      console.error("fetchOrderDetail failed:", err);
      throw err; // Re-throw for dashboard to handle
    } finally {
      setLoadingDetail(false);
    }
  }, [orders]);

  const closeOrderDetail = useCallback(() => {
    setSelectedOrder(null);
  }, []);

  // Allow manual reload by resetting the guard
  const reload = useCallback(async () => {
    didFetchRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const data = await getOrders();
      setOrders(data);
      didFetchRef.current = true;
    } catch (err) {
      console.error("Failed to reload orders:", err);
      setError(err instanceof Error ? err : new Error("Failed to load orders"));
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    orders,
    loading,
    error,
    selectedOrder,
    loadingDetail,
    fetchOrders,
    fetchOrderDetail,
    closeOrderDetail,
    reload,
  };
}
