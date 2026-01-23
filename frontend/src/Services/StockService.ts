// src/Services/StockService.ts
import api from "./api";

export interface StockItem {
  medicineId: number;
  medicineName?: string;
  quantity: number;
  lowStockThreshold?: number;
  medicine?: {
    id: number;
    name: string;
    image?: string;
    price?: number;
    stock?: number;
  };
}

export interface StockAdjustment {
  quantity: number;
  reason?: string;
}

// Default threshold for low stock alerts (matches frontend constant)
const DEFAULT_LOW_STOCK_THRESHOLD = 30;

// GET all stock
export const getStock = async (): Promise<StockItem[]> => {
  const response = await api.get("/api/Stock");
  return response.data;
};

// GET stock for specific medicine
export const getStockByMedicine = async (medicineId: number): Promise<StockItem> => {
  const response = await api.get(`/api/Stock/${medicineId}`);
  return response.data;
};

// ADJUST stock for a medicine
export const adjustStock = async (medicineId: number, adjustment: StockAdjustment): Promise<StockItem> => {
  const response = await api.put(`/api/Stock/${medicineId}/adjust`, adjustment);
  return response.data;
};

/**
 * GET low stock items from backend
 * 
 * Uses the correct backend endpoint: GET /api/Stock/low-stock?threshold={threshold}
 * The backend accepts threshold as a query parameter (default: 10 on backend)
 * Frontend default threshold: 30
 * 
 * @param threshold - Stock quantity threshold (items with quantity <= threshold are returned)
 * @returns Array of StockItem with medicine details
 */
export const getLowStock = async (threshold: number = DEFAULT_LOW_STOCK_THRESHOLD): Promise<StockItem[]> => {
  // Correct endpoint: /api/Stock/low-stock with threshold query parameter
  // Backend controller: StockController.GetLowStock([FromQuery] int threshold = 10)
  const response = await api.get(`/api/Stock/low-stock?threshold=${threshold}`);
  return response.data;
};
