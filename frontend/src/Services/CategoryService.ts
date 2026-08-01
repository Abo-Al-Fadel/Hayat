// src/Services/CategoryService.ts
/**
 * Category Service - Direct API calls for categories
 * Uses axios interceptor which attaches auth_token from sessionStorage
 */
import api from "./api";

export interface Category {
  id: number;
  name: string;
}

// GET all categories - with explicit logging
export const getCategories = async (): Promise<Category[]> => {
  const response = await api.get("/api/Categories");
  return response.data;
};

// CREATE category
export const createCategory = async (category: Omit<Category, "id">): Promise<Category> => {
  const response = await api.post("/api/Categories", category);
  return response.data;
};

// UPDATE category
export const updateCategory = async (id: number, category: Partial<Category>): Promise<Category> => {
  const response = await api.put(`/api/Categories/${id}`, category);
  return response.data;
};

// DELETE category
export const deleteCategory = async (id: number): Promise<void> => {
  await api.delete(`/api/Categories/${id}`);
};
