// src/hooks/useCategories.ts
/**
 * Hook for managing product categories
 * 
 * Features:
 * - Fetch categories on mount with caching
 * - Create, update, delete categories
 * - Prevent deleting categories that are in use by products
 * - Cache categories in localStorage for faster initial load
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { 
  getCategories, 
  createCategory, 
  updateCategory, 
  deleteCategory,
  type Category 
} from "../Services/CategoryService";

// Storage keys - shared across all tabs
const TOKEN_KEY = "token";
const CATEGORIES_CACHE_KEY = "categories_cache";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(() => {
    // Initialize from cache for instant render
    try {
      const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Guards for StrictMode
  const fetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);

  const fetchCategories = useCallback(async (force = false) => {
    // Check token from localStorage (shared across tabs)
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      console.log("[Categories] No token in localStorage, skipping fetch");
      setError("Not authenticated");
      return;
    }

    // Prevent duplicate fetches unless forced
    if (fetchingRef.current) return;
    if (hasFetchedRef.current && !force) return;
    
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    
    console.log("[Categories] Fetching from API...");
    
    try {
      const data = await getCategories();
      console.log("[Categories] API response count:", data.length);
      setCategories(data);
      // Cache for next load
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(data));
      hasFetchedRef.current = true;
    } catch (err: any) {
      console.error("[Categories] API failed:", err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  /**
   * Create a new category
   * Returns the created category on success
   */
  const addCategory = useCallback(async (name: string): Promise<Category> => {
    const created = await createCategory({ name });
    setCategories((prev) => {
      const updated = [...prev, created];
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(updated));
      return updated;
    });
    return created;
  }, []);

  /**
   * Update an existing category
   * Returns the updated category on success
   */
  const editCategory = useCallback(async (id: number, name: string): Promise<Category> => {
    const updated = await updateCategory(id, { name });
    setCategories((prev) => {
      const newCategories = prev.map((c) => (c.id === id ? updated : c));
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(newCategories));
      return newCategories;
    });
    return updated;
  }, []);

  /**
   * Delete a category
   * IMPORTANT: Backend should reject if category is in use by products
   */
  const removeCategory = useCallback(async (id: number): Promise<void> => {
    await deleteCategory(id);
    setCategories((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(filtered));
      return filtered;
    });
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    reload: () => fetchCategories(true),
    addCategory,
    editCategory,
    removeCategory,
  };
}
