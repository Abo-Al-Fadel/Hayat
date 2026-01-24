// src/Services/SupplyOrderService.ts
import api from "./api";

/**
 * Supply Stock Status Enum
 * ─────────────────────────────────────────────────────────────────────────────
 * Status flow:
 * 1. Created   → Admin creates the supply stock order
 * 2. Approved  → Approved internally by admin
 * 3. Ordered   → Admin confirms order after calling supplier
 *                (Once ordered, it appears in Storage Manager panel)
 * 4. Shipped   → Marked by Storage Manager when supplier ships
 * 5. Received  → Arrived at pharmacy
 * 6. Stored    → Added to inventory (TRIGGERS STOCK UPDATE - then removed from list)
 * 7. Cancelled → Cancelled by Admin (only before Shipped)
 * 
 * Admin permissions:
 * - Create, Approve, Order, Cancel (only before Shipped)
 * 
 * Storage Manager permissions:
 * - Mark as Shipped, Received, Stored
 * 
 * Edit Restrictions:
 * - Supply stock can only be edited when Status === "Created"
 * - Once approved, items and supplier cannot be changed
 * 
 * Inventory Update Logic:
 * - When status changes to "Stored", backend atomically adds quantities
 *   to pharmacy main stock (Medicine.Quantity field)
 * - After becoming "Stored", item is removed from active list for performance
 */
export enum SupplyStockStatus {
  Created = "Created",
  Approved = "Approved",
  Ordered = "Ordered",
  Shipped = "Shipped",
  Received = "Received",
  Stored = "Stored",
  Cancelled = "Cancelled",
}

// Status display configuration for UI rendering
export const SUPPLY_STOCK_STATUS_CONFIG: Record<SupplyStockStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  darkBgColor: string;
  step: number;
}> = {
  [SupplyStockStatus.Created]: { 
    label: "Created", 
    color: "text-blue-700", 
    bgColor: "bg-blue-100",
    darkBgColor: "dark:bg-blue-900/30 dark:text-blue-400",
    step: 1 
  },
  [SupplyStockStatus.Approved]: { 
    label: "Approved", 
    color: "text-indigo-700", 
    bgColor: "bg-indigo-100",
    darkBgColor: "dark:bg-indigo-900/30 dark:text-indigo-400",
    step: 2 
  },
  [SupplyStockStatus.Ordered]: { 
    label: "Ordered", 
    color: "text-purple-700", 
    bgColor: "bg-purple-100",
    darkBgColor: "dark:bg-purple-900/30 dark:text-purple-400",
    step: 3 
  },
  [SupplyStockStatus.Shipped]: { 
    label: "Shipped", 
    color: "text-orange-700", 
    bgColor: "bg-orange-100",
    darkBgColor: "dark:bg-orange-900/30 dark:text-orange-400",
    step: 4 
  },
  [SupplyStockStatus.Received]: { 
    label: "Received", 
    color: "text-teal-700", 
    bgColor: "bg-teal-100",
    darkBgColor: "dark:bg-teal-900/30 dark:text-teal-400",
    step: 5 
  },
  [SupplyStockStatus.Stored]: { 
    label: "Stored", 
    color: "text-green-700", 
    bgColor: "bg-green-100",
    darkBgColor: "dark:bg-green-900/30 dark:text-green-400",
    step: 6 
  },
  [SupplyStockStatus.Cancelled]: { 
    label: "Cancelled", 
    color: "text-red-700", 
    bgColor: "bg-red-100",
    darkBgColor: "dark:bg-red-900/30 dark:text-red-400",
    step: -1 
  },
};

/**
 * Check if admin can perform an action on a supply stock
 * Admin can only: approve, order, cancel (before shipped)
 */
export const canAdminPerformAction = (status: SupplyStockStatus, action: "approve" | "order" | "cancel" | "edit"): boolean => {
  switch (action) {
    case "approve":
      return status === SupplyStockStatus.Created;
    case "order":
      return status === SupplyStockStatus.Approved;
    case "cancel":
      // Admin can cancel only before Shipped
      return [SupplyStockStatus.Created, SupplyStockStatus.Approved, SupplyStockStatus.Ordered].includes(status);
    case "edit":
      // Can only edit when status is "Created"
      return status === SupplyStockStatus.Created;
    default:
      return false;
  }
};

/**
 * Check if Storage Manager can change to a specific status
 * Storage Manager can only: mark as Shipped, Received, or Stored
 * Status can only progress forward, never backward
 */
export const canStorageManagerChangeStatus = (currentStatus: SupplyStockStatus, targetStatus: SupplyStockStatus): boolean => {
  // Define valid transitions for Storage Manager
  const validTransitions: Record<SupplyStockStatus, SupplyStockStatus[]> = {
    [SupplyStockStatus.Created]: [],        // Storage Manager cannot see Created
    [SupplyStockStatus.Approved]: [],       // Storage Manager cannot see Approved
    [SupplyStockStatus.Ordered]: [SupplyStockStatus.Shipped],
    [SupplyStockStatus.Shipped]: [SupplyStockStatus.Received],
    [SupplyStockStatus.Received]: [SupplyStockStatus.Stored],
    [SupplyStockStatus.Stored]: [],         // Final state
    [SupplyStockStatus.Cancelled]: [],      // Final state
  };
  
  return validTransitions[currentStatus]?.includes(targetStatus) ?? false;
};

/**
 * Get available next statuses for Storage Manager
 * Returns array of statuses that can be selected from current status
 */
export const getStorageManagerAvailableStatuses = (currentStatus: SupplyStockStatus): SupplyStockStatus[] => {
  switch (currentStatus) {
    case SupplyStockStatus.Ordered:
      return [SupplyStockStatus.Shipped];
    case SupplyStockStatus.Shipped:
      return [SupplyStockStatus.Received];
    case SupplyStockStatus.Received:
      return [SupplyStockStatus.Stored];
    default:
      return [];
  }
};

/**
 * Check if we can advance to the next status
 */
export const getNextStatus = (current: SupplyStockStatus): SupplyStockStatus | null => {
  const transitions: Record<SupplyStockStatus, SupplyStockStatus | null> = {
    [SupplyStockStatus.Created]: SupplyStockStatus.Approved,
    [SupplyStockStatus.Approved]: SupplyStockStatus.Ordered,
    [SupplyStockStatus.Ordered]: SupplyStockStatus.Shipped,
    [SupplyStockStatus.Shipped]: SupplyStockStatus.Received,
    [SupplyStockStatus.Received]: SupplyStockStatus.Stored,
    [SupplyStockStatus.Stored]: null,
    [SupplyStockStatus.Cancelled]: null,
  };
  return transitions[current];
};

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces - MUST match backend DTO property names exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supply Order Item from backend (SupplyOrderItemDto)
 * Backend returns: medicineId, medicineName, quantity, unitPrice, medicineImageUrl
 * All fields are required - no optional flags to mask missing data
 */
export interface SupplyStockItem {
  medicineId: number;
  medicineName: string;  // From backend: item.Medicine.Name
  quantity: number;      // From backend: item.Quantity  
  unitPrice: number;     // From backend: item.UnitPrice (BUY price)
  medicineImageUrl?: string | null;  // From backend: item.Medicine.Image (for Storage Manager visual ID)
}

export interface SupplyStock {
  id: number;
  supplierId: number;
  supplierName?: string;
  status: SupplyStockStatus;
  // Timestamps for each status transition
  createdAt: string;
  approvedAt?: string | null;
  orderedAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  storedAt?: string | null;
  cancelledAt?: string | null;
  items: SupplyStockItem[];
  totalAmount?: number;
  notes?: string;
}

export interface CreateSupplyStockDto {
  supplierId: number;
  // Items must include unitPrice (BUY price) - required by backend
  items: { medicineId: number; quantity: number; unitPrice: number }[];
  notes?: string;
}

export interface UpdateSupplyStockDto {
  supplierId?: number;
  // Items must include unitPrice (BUY price) - required by backend
  items?: { medicineId: number; quantity: number; unitPrice: number }[];
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely format a date string, returns "N/A" if invalid
 */
export const formatDate = (dateString?: string | null): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Invalid Date";
  }
};

/**
 * Format date with time
 */
export const formatDateTime = (dateString?: string | null): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid Date";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET active supply stocks (excludes Stored and Cancelled for performance)
 * Use this for the main admin list to avoid loading thousands of historical records
 */
export const getSupplyStocks = async (): Promise<SupplyStock[]> => {
  const response = await api.get("/api/SupplyOrder/active");
  
  // Debug logging - can be removed in production
  if (process.env.NODE_ENV === 'development') {
    console.log("[SupplyOrderService] Fetched supply orders:", response.data?.length || 0);
    // Check for data issues
    const issues: string[] = [];
    response.data?.forEach((order: any) => {
      order.items?.forEach((item: any, idx: number) => {
        if (!item.medicineName) issues.push(`Order ${order.id} item ${idx}: missing medicineName`);
        if (item.unitPrice === 0 || item.unitPrice === undefined) issues.push(`Order ${order.id} item ${idx}: unitPrice is ${item.unitPrice}`);
      });
    });
    if (issues.length > 0) {
      console.warn("[SupplyOrderService] Data issues found:", issues);
    }
  }
  
  return response.data.map(normalizeSupplyStock);
};

/**
 * GET supply stocks for Storage Manager (Ordered, Shipped, Received only)
 * These are orders that require Storage Manager action
 */
export const getSupplyStocksForStorageManager = async (): Promise<SupplyStock[]> => {
  const response = await api.get("/api/SupplyOrder/storage-manager");
  
  if (process.env.NODE_ENV === 'development') {
    console.log("[SupplyOrderService] Fetched storage manager orders:", response.data?.length || 0);
  }
  
  return response.data.map(normalizeSupplyStock);
};

/**
 * GET all supply stocks (including historical)
 * Use sparingly - may be slow with large datasets
 */
export const getAllSupplyStocks = async (): Promise<SupplyStock[]> => {
  const response = await api.get("/api/SupplyOrder");
  return response.data.map(normalizeSupplyStock);
};

/**
 * GET supply stocks by status
 */
export const getSupplyStocksByStatus = async (status: SupplyStockStatus): Promise<SupplyStock[]> => {
  const response = await api.get(`/api/SupplyOrder/status/${status}`);
  return response.data.map(normalizeSupplyStock);
};

/**
 * GET supply stock by ID
 */
export const getSupplyStockById = async (id: number): Promise<SupplyStock> => {
  const response = await api.get(`/api/SupplyOrder/${id}`);
  return normalizeSupplyStock(response.data);
};

/**
 * CREATE supply stock
 */
export const createSupplyStock = async (dto: CreateSupplyStockDto): Promise<SupplyStock> => {
  const response = await api.post("/api/SupplyOrder", dto);
  return normalizeSupplyStock(response.data);
};

/**
 * UPDATE supply stock status (PATCH - partial update)
 * This is the main method for status transitions
 */
export const updateSupplyStockStatus = async (id: number, status: SupplyStockStatus): Promise<SupplyStock> => {
  const response = await api.patch(`/api/SupplyOrder/${id}/status`, { status });
  return normalizeSupplyStock(response.data);
};

/**
 * UPDATE supply stock details (PUT - only when status is "Created")
 * Allows editing supplier, items, and notes
 */
export const updateSupplyStock = async (id: number, dto: UpdateSupplyStockDto): Promise<SupplyStock> => {
  const response = await api.put(`/api/SupplyOrder/${id}`, dto);
  return normalizeSupplyStock(response.data);
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience methods for status transitions
// ─────────────────────────────────────────────────────────────────────────────

export const approveSupplyStock = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Approved);
export const orderSupplyStock = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Ordered);
export const cancelSupplyStock = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Cancelled);
export const markSupplyStockShipped = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Shipped);
export const markSupplyStockReceived = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Received);
export const markSupplyStockStored = (id: number) => updateSupplyStockStatus(id, SupplyStockStatus.Stored);

/**
 * DELETE supply order (Admin only, only Stored or Cancelled orders)
 */
export const deleteSupplyStock = async (id: number): Promise<void> => {
  await api.delete(`/api/SupplyOrder/${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize backend response to ensure consistent data structure
 * CRITICAL: Maps backend SupplyOrderDto/SupplyOrderItemDto to frontend types
 * 
 * Backend returns (camelCase):
 * - items[].medicineId, medicineName, quantity, unitPrice
 * 
 * DO NOT use fallback values that mask missing data - log errors instead
 */
function normalizeSupplyStock(data: any): SupplyStock {
  // Log raw data for debugging if items have issues
  if (data.items?.some((item: any) => !item.medicineName || item.unitPrice === undefined)) {
    console.warn("[SupplyOrder] Backend item data may be incomplete:", data.items);
  }

  return {
    id: data.id ?? 0,
    supplierId: data.supplierId ?? 0,
    supplierName: data.supplierName || "",
    status: normalizeStatus(data.status),
    createdAt: data.createdAt || new Date().toISOString(),
    approvedAt: data.approvedAt || null,
    orderedAt: data.orderedAt || null,
    shippedAt: data.shippedAt || null,
    receivedAt: data.receivedAt || null,
    storedAt: data.storedAt || null,
    cancelledAt: data.cancelledAt || null,
    // CRITICAL: Map items directly from backend response
    // Backend SupplyOrderItemDto has: medicineId, medicineName, quantity, unitPrice, medicineImageUrl
    items: Array.isArray(data.items) 
      ? data.items.map((item: any) => ({
          medicineId: item.medicineId,
          // medicineName comes from backend mapping: item.Medicine.Name
          medicineName: item.medicineName,
          // quantity from backend: item.Quantity
          quantity: item.quantity,
          // unitPrice (BUY price) from backend: item.UnitPrice
          unitPrice: item.unitPrice,
          // medicineImageUrl from backend: item.Medicine.Image
          medicineImageUrl: item.medicineImageUrl || null,
        }))
      : [],
    totalAmount: data.totalAmount,
    notes: data.notes,
  };
}

/**
 * Normalize status from backend (handles both string and number)
 */
function normalizeStatus(status: any): SupplyStockStatus {
  // Handle numeric status from backend enum
  if (typeof status === "number") {
    const statusMap: Record<number, SupplyStockStatus> = {
      1: SupplyStockStatus.Created,
      2: SupplyStockStatus.Approved,
      3: SupplyStockStatus.Ordered,
      4: SupplyStockStatus.Shipped,
      5: SupplyStockStatus.Received,
      6: SupplyStockStatus.Stored,
      7: SupplyStockStatus.Cancelled,
    };
    return statusMap[status] || SupplyStockStatus.Created;
  }
  
  // Handle string status
  if (typeof status === "string") {
    const normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    if (Object.values(SupplyStockStatus).includes(normalized as SupplyStockStatus)) {
      return normalized as SupplyStockStatus;
    }
  }
  
  return SupplyStockStatus.Created;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy aliases (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export type SupplyOrder = SupplyStock;
export type SupplyOrderItem = SupplyStockItem;
export type CreateSupplyOrderDto = CreateSupplyStockDto;
export const getSupplyOrders = getSupplyStocks;
export const createSupplyOrder = createSupplyStock;
export const markSupplyOrderReceived = markSupplyStockReceived;
