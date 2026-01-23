// src/Services/NotificationService.ts
import api from "./api";

export interface Notification {
  id: number;
  message: string;
  createdAt: string;
  isRead: boolean;
  action?: string;
  medicineName?: string;
}

export interface MedicineChangePayload {
  action: "created" | "updated" | "deleted";
  id: number;
  name?: string;
  price?: number;
  quantity?: number;
  message: string;
  timestamp: string;
}

// GET all notifications
export const getNotifications = async (): Promise<Notification[]> => {
  const response = await api.get("/api/Notifications");
  return response.data;
};

// MARK notifications as read
export const markNotificationsRead = async (ids: number[]): Promise<void> => {
  await api.post("/api/Notifications/markread", { ids });
};

// MARK all notifications as read
export const markAllNotificationsRead = async (): Promise<void> => {
  await api.post("/api/Notifications/markallread");
};

// DELETE notification
export const deleteNotification = async (id: number): Promise<void> => {
  await api.delete(`/api/Notifications/${id}`);
};

// Build a medicine change payload for SignalR broadcast
export const buildMedicineChangePayload = (
  action: "created" | "updated" | "deleted",
  medicine: { id: number; name?: string; price?: number; quantity?: number }
): MedicineChangePayload => ({
  action,
  id: medicine.id,
  name: medicine.name,
  price: medicine.price,
  quantity: medicine.quantity,
  message: action === "deleted"
    ? `Medicine removed (id: ${medicine.id})`
    : `Medicine ${action}: ${medicine.name}`,
  timestamp: new Date().toISOString(),
});

