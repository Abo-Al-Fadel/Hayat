// src/Services/SupplierService.ts
import api from "./api";

export interface Supplier {
  id: number;
  name: string;
  contactInfo?: string;
  email?: string;
  phone?: string;
  address?: string;
}

// GET all suppliers
export const getSuppliers = async (): Promise<Supplier[]> => {
  const response = await api.get("/api/Supplier");
  return response.data;
};

// GET supplier by id
export const getSupplierById = async (id: number): Promise<Supplier> => {
  const response = await api.get(`/api/Supplier/${id}`);
  return response.data;
};

// CREATE supplier
export const createSupplier = async (supplier: Omit<Supplier, "id">): Promise<Supplier> => {
  const response = await api.post("/api/Supplier", supplier);
  return response.data;
};

// UPDATE supplier
export const updateSupplier = async (id: number, supplier: Partial<Supplier>): Promise<Supplier> => {
  const response = await api.put(`/api/Supplier/${id}`, supplier);
  return response.data;
};

// DELETE supplier
export const deleteSupplier = async (id: number): Promise<void> => {
  await api.delete(`/api/Supplier/${id}`);
};
