// src/Services/NotificationService.ts
/**
 * Notification Service
 * 
 * Handles fetching and managing notifications from the backend.
 * Notifications are role-based:
 * - Admin: Receives status changes from StorageManager
 * - StorageManager: Receives new supply orders from Admin
 * - Pharmacist: Receives medicine updates from Admin
 */
import api from "./api";

export interface Notification {
  id: number;
  message: string;
  createdAt: string;
  isRead: boolean;
  action?: string;
  type?: string;
  medicineName?: string;
  medicineId?: number;
  supplyOrderId?: number;
  oldStatus?: string;
  newStatus?: string;
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

export interface SupplyOrderNotificationPayload {
  supplyOrderId: number;
  oldStatus?: string;
  newStatus: string;
  message: string;
  action: string;
  type: "supplyorder";
  changedBy?: string;
  timestamp: string;
}

// GET notifications for a specific role
export const getNotifications = async (role?: string, unreadOnly: boolean = false): Promise<Notification[]> => {
  const params = new URLSearchParams();
  if (role) params.append("role", role);
  if (unreadOnly) params.append("unreadOnly", "true");
  
  const response = await api.get(`/api/Notifications?${params.toString()}`);
  return response.data;
};

// GET unread notification count for a role
export const getUnreadNotificationCount = async (role: string): Promise<number> => {
  const notifications = await getNotifications(role, true);
  return notifications.length;
};

// MARK notifications as read
export const markNotificationsRead = async (ids: number[]): Promise<void> => {
  await api.post("/api/Notifications/markread", ids);
};

// MARK all notifications as read for the signed-in user's own role.
// The backend derives the role from the JWT and ignores any role passed in.
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

