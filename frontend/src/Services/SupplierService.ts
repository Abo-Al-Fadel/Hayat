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

export interface UpdateSupplierDto {
  name: string;
  email?: string;
  phone?: string;
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
//
// The API returns the whole created supplier. It used to return only { id }, while
// this signature still promised a Supplier - so callers appended an object with an
// undefined name to their list and TypeScript raised nothing. The normalise call is
// belt and braces: a partial response now yields empty strings rather than a crash
// the next time something calls .trim() on a field.
export const createSupplier = async (supplier: Omit<Supplier, "id">): Promise<Supplier> => {
  const response = await api.post("/api/Supplier", supplier);
  return normaliseSupplier(response.data);
};

/** Guarantees the optional string fields are strings, and that `name` is present. */
export const normaliseSupplier = (raw: Partial<Supplier> & { id: number }): Supplier => ({
  id: raw.id,
  name: raw.name ?? "",
  email: raw.email ?? "",
  phone: raw.phone ?? "",
  address: raw.address ?? "",
  contactInfo: raw.contactInfo ?? "",
});

// UPDATE supplier - returns updated supplier data
export const updateSupplier = async (id: number, data: UpdateSupplierDto): Promise<Supplier> => {
  const response = await api.put(`/api/Supplier/${id}`, data);
  return response.data;
};

// DELETE supplier
export const deleteSupplier = async (id: number): Promise<void> => {
  await api.delete(`/api/Supplier/${id}`);
};
