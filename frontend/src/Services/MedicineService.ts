// src/Services/MedicineService.ts
import api from "./api";

export interface Medicine {
  id: number;
  name: string;
  price: number;
  quantity: number; // backend uses "quantity"
  image?: string;
  categoryId?: number | null;
  isHidden?: boolean; // backend field for visibility
}

// Mapped type for frontend usage (stock instead of quantity)
export interface MedicineDisplay {
  id: number;
  name: string;
  price: number;
  stock: number;
  hidden?: boolean;
  image?: string;
  categoryId?: number | null;
}

// Input types for create/update
export interface MedicineCreateInput {
  name: string;
  price: number;
  quantity: number;
  categoryId?: number | null;
  imageFile?: File | null; // actual file for FormData upload
}

export interface MedicineUpdateInput {
  name: string;
  price: number;
  quantity: number;
  categoryId?: number | null;
  imageFile?: File | null; // actual file for FormData upload
}

// Convert backend Medicine to frontend display format
export const toDisplayMedicine = (m: Medicine): MedicineDisplay => ({
  id: m.id,
  name: m.name,
  price: Number(m.price ?? 0),
  stock: Number(m.quantity ?? 0),
  hidden: m.isHidden ?? false, // use backend isHidden field
  image: m.image ?? "",
  categoryId: m.categoryId ?? null,
});

// GET all medicines
export const getMedicines = async (): Promise<Medicine[]> => {
  const res = await api.get("/api/Medicine");
  return res.data;
};

// GET all medicines as display format
export const getMedicinesForDisplay = async (): Promise<MedicineDisplay[]> => {
  const medicines = await getMedicines();
  return medicines.map(toDisplayMedicine);
};

// Helper to build FormData for medicine create/update
const buildMedicineFormData = (data: MedicineCreateInput | MedicineUpdateInput): FormData => {
  const formData = new FormData();
  formData.append("Name", data.name);
  formData.append("Price", String(data.price));
  formData.append("Quantity", String(data.quantity));
  
  // CategoryId is optional - ONLY append if it's a valid positive number
  // Do NOT send empty string or null - just omit the field entirely
  if (typeof data.categoryId === "number" && data.categoryId > 0) {
    formData.append("CategoryId", String(data.categoryId));
  }
  // If categoryId is null, undefined, or 0 - don't append anything
  
  // Image file is optional - only append if it's a valid File object
  if (data.imageFile instanceof File) {
    formData.append("Image", data.imageFile, data.imageFile.name);
  }
  
  // Debug logging (remove in production)
  if (process.env.NODE_ENV === "development") {
    console.log("FormData entries:");
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
  }
  
  return formData;
};

// ADD new medicine (uses FormData for file upload)
// NOTE: Do NOT set Content-Type header manually - browser sets it with correct boundary for FormData
export const addMedicine = async (input: MedicineCreateInput): Promise<Medicine> => {
  const formData = buildMedicineFormData(input);
  const res = await api.post("/api/Medicine", formData);
  return res.data;
};

// UPDATE medicine (uses FormData for file upload)
// NOTE: Do NOT set Content-Type header manually - browser sets it with correct boundary for FormData
export const updateMedicine = async (id: number, input: MedicineUpdateInput): Promise<Medicine> => {
  const formData = buildMedicineFormData(input);
  const res = await api.put(`/api/Medicine/${id}`, formData);
  return res.data;
};

// DELETE medicine
export const deleteMedicine = async (id: number): Promise<void> => {
  await api.delete(`/api/Medicine/${id}`);
};

// TOGGLE visibility (uses PATCH endpoint - only updates IsHidden)
export const toggleMedicineVisibility = async (id: number, isHidden: boolean): Promise<Medicine> => {
  const res = await api.patch(`/api/Medicine/${id}/visibility`, { isHidden });
  return res.data;
};

// GET medicine by ID
export const getMedicineById = async (id: number): Promise<Medicine> => {
  const res = await api.get(`/api/Medicine/${id}`);
  return res.data;
};

// SEARCH medicines
export const searchMedicines = async (query?: string): Promise<Medicine[]> => {
  const params = query ? `?query=${encodeURIComponent(query)}` : "";
  const res = await api.get(`/api/Medicine/search${params}`);
  return res.data;
};

// GET medicines by category
export const getMedicinesByCategory = async (categoryId: number): Promise<Medicine[]> => {
  const res = await api.get(`/api/Medicine/by-category/${categoryId}`);
  return res.data;
};

// GET medicines by category as display format
export const getMedicinesByCategoryForDisplay = async (categoryId: number): Promise<MedicineDisplay[]> => {
  const medicines = await getMedicinesByCategory(categoryId);
  return medicines.map(toDisplayMedicine);
};
