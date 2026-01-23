// src/Services/OrderService.ts
import api from "./api";

export interface OrderItem {
  id?: number;
  medicineId: number;
  medicineName?: string;
  quantity: number;
  price: number;
  lineTotal?: number;
}

export interface OrderSummary {
  id: number;
  createdAt: string;
  totalPrice: number;
  itemsCount: number;
  items?: OrderItem[];
}

export interface OrderDetail {
  id: number;
  createdAt: string;
  totalPrice: number;
  items: OrderItem[];
  invoiceText?: string;
}

export interface CheckoutDto {
  customerName?: string;
  items: { medicineId: number; quantity: number }[];
}

// GET all orders
export const getOrders = async (): Promise<OrderSummary[]> => {
  const response = await api.get("/api/Order");
  return (response.data || []).map((o: any) => ({
    id: o.id,
    createdAt: o.createdAt,
    totalPrice: Number(o.totalPrice ?? o.total ?? 0),
    itemsCount: Number(o.items?.length ?? o.itemsCount ?? 0),
    items: o.items?.map((it: any) => ({
      id: it.id,
      medicineId: it.medicineId,
      medicineName: it.medicineName ?? it.medicine?.name ?? "",
      quantity: Number(it.quantity ?? 0),
      price: Number(it.price ?? 0),
      lineTotal: Number(it.price ?? 0) * Number(it.quantity ?? 0),
    })),
  }));
};

// GET invoice (text format) - This is the only detail endpoint available
export const getInvoice = async (id: number): Promise<string> => {
  const response = await api.get(`/api/Order/${id}/invoice`);
  return response.data;
};

// CREATE order
export const createOrder = async (items: { medicineId: number; quantity: number }[]) => {
  const response = await api.post("/api/Order", items);
  return response.data;
};

// CANCEL order
export const cancelOrder = async (orderId: number) => {
  const response = await api.delete(`/api/Order/${orderId}`);
  return response.data;
};

// REMOVE item from order
export const removeOrderItem = async (orderId: number, itemId: number) => {
  const response = await api.delete(`/api/Order/${orderId}/item/${itemId}`);
  return response.data;
};

// UPDATE item quantity
export const updateOrderItemQuantity = async (orderId: number, itemId: number, quantity: number) => {
  const response = await api.put(`/api/Order/${orderId}/item/${itemId}`, { quantity });
  return response.data;
};
