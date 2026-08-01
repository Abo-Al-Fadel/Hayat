// src/Services/StatsService.ts
import api from "./api";

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  grossProfit: number;
  orderCount: number;
}

export interface TopMedicine {
  medicineId: number;
  name: string;
  unitsSold: number;
  revenue: number;
  grossProfit: number;
  grossMarginPercent: number | null;
}

export interface FinancialStats {
  fromUtc: string;
  toUtc: string;

  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  orderCount: number;
  unitsSold: number;
  averageOrderValue: number;
  /** Revenue whose cost is unknown, so profit is understated by an unknown amount. */
  revenueWithUnknownCost: number;

  inventoryValueAtCost: number;
  inventoryValueAtRetail: number;
  potentialProfit: number;
  inventoryUnits: number;
  lowStockCount: number;
  outOfStockCount: number;

  revenueByDay: DailyRevenuePoint[];
  topMedicines: TopMedicine[];
}

export interface PriceSuggestion {
  cost: number;
  markupPercent: number;
  suggestedPrice: number;
  marginPercent: number | null;
}

/** Financial summary for a rolling window of `days`, ending now. Admin only. */
export const getFinancialStats = async (days: number = 30): Promise<FinancialStats> => {
  const response = await api.get(`/api/Stats/financial?days=${days}`);
  return response.data;
};

/** Suggested retail price for a supplier unit cost, from the configured markup tiers. */
export const suggestPrice = async (cost: number): Promise<PriceSuggestion> => {
  const response = await api.get(`/api/Stats/suggest-price?cost=${cost}`);
  return response.data;
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value ?? 0);

export const formatPercent = (value: number | null): string =>
  value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
