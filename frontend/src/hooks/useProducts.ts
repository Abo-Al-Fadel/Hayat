// src/hooks/useProducts.ts
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getMedicinesForDisplay,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  toggleMedicineVisibility,
  toDisplayMedicine,
  type MedicineDisplay,
  type MedicineCreateInput,
  type MedicineUpdateInput,
} from "../Services/MedicineService";

const CACHE_KEY = "products";

export interface ProductCreateInput {
  name: string;
  price: number;
  stock: number;
  categoryId?: number | null;
  imageFile?: File | null;
}

export interface ProductUpdateInput {
  name: string;
  price: number;
  stock: number;
  categoryId?: number | null;
  imageFile?: File | null;
}

export function useProducts() {
  const [products, setProducts] = useState<MedicineDisplay[]>([]);
  const [savedProducts, setSavedProducts] = useState<MedicineDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);
  
  // Guards to prevent duplicate API calls in StrictMode
  const didFetchRef = useRef(false);

  // Load from cache first, then fetch from API
  useEffect(() => {
    // StrictMode guard - only fetch once on initial mount
    if (didFetchRef.current && reloadFlag === 0) {
      return;
    }
    
    const loadProducts = async () => {
      // Show cached data immediately
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as MedicineDisplay[];
          setProducts(parsed);
          setSavedProducts(parsed);
        } catch {}
      }

      // Get token from localStorage (shared across all tabs)
      const TOKEN_KEY = "token";
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        // No token - don't attempt API call, dashboard will redirect
        console.log("[API] No token in localStorage, skipping products fetch");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getMedicinesForDisplay();
        setProducts(data);
        setSavedProducts(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        didFetchRef.current = true;
      } catch (err) {
        console.error("Failed to load products:", err);
        setError(err instanceof Error ? err : new Error("Failed to load products"));
        // NO TOAST HERE - let dashboard handle it
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [reloadFlag]);

  // Dirty state detection
  const isDirty = useMemo(
    () => JSON.stringify(products) !== JSON.stringify(savedProducts),
    [products, savedProducts]
  );

  // Reload from API
  const reload = useCallback(() => {
    setReloadFlag((r) => r + 1);
  }, []);

  // Undo local changes
  const undo = useCallback(() => {
    setProducts(savedProducts.map((p) => ({ ...p })));
    // NO TOAST - let dashboard handle it
  }, [savedProducts]);

  // Update local state
  const updateLocalProduct = useCallback((id: number, updates: Partial<MedicineDisplay>) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  // Create product - throws on error, returns null on validation failure
  const createProduct = useCallback(async (input: ProductCreateInput): Promise<MedicineDisplay | null> => {
    // Validate required fields - return null with error message
    if (!input.name.trim()) {
      throw new Error("Medicine name is required");
    }
    if (input.price < 0) {
      throw new Error("Price must be non-negative");
    }
    if (input.stock < 0) {
      throw new Error("Quantity must be non-negative");
    }

    setSaving(true);
    try {
      const createInput: MedicineCreateInput = {
        name: input.name.trim(),
        price: input.price,
        quantity: input.stock,
        // Only pass categoryId if it's a valid number > 0, otherwise pass null
        categoryId: (typeof input.categoryId === "number" && input.categoryId > 0) ? input.categoryId : null,
        imageFile: input.imageFile ?? null,
      };
      
      console.log("Creating medicine with input:", createInput);
      
      const created = await addMedicine(createInput);
      const mapped = toDisplayMedicine(created);
      
      const updatedProducts = [mapped, ...products];
      setProducts(updatedProducts);
      setSavedProducts(updatedProducts);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updatedProducts));
      
      // NO TOAST - let dashboard handle it
      return mapped;
    } catch (err) {
      console.error("Failed to create product:", err);
      throw err; // Re-throw for dashboard to handle
    } finally {
      setSaving(false);
    }
  }, [products]);

  // Update product on backend
  const updateProduct = useCallback(async (
    id: number,
    input: ProductUpdateInput
  ): Promise<MedicineDisplay | null> => {
    try {
      const updateInput: MedicineUpdateInput = {
        name: input.name.trim(),
        price: input.price,
        quantity: input.stock,
        // Only pass categoryId if it's a valid number > 0, otherwise pass null
        categoryId: (typeof input.categoryId === "number" && input.categoryId > 0) ? input.categoryId : null,
        imageFile: input.imageFile ?? null,
      };
      
      console.log("Updating medicine with input:", updateInput);
      
      const updated = await updateMedicine(id, updateInput);
      const mapped = toDisplayMedicine(updated);
      
      setProducts((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)));
      setSavedProducts((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)));
      
      // Update cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as MedicineDisplay[];
        localStorage.setItem(CACHE_KEY, JSON.stringify(
          parsed.map((p) => (p.id === mapped.id ? mapped : p))
        ));
      }
      
      return mapped;
    } catch (err) {
      console.error("Update failed:", err);
      throw err;
    }
  }, []);

  // Delete product - throws on error
  const removeProduct = useCallback(async (id: number): Promise<boolean> => {
    setSaving(true);
    try {
      await deleteMedicine(id);
      
      const updated = products.filter((p) => p.id !== id);
      setProducts(updated);
      setSavedProducts(updated);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
      
      // NO TOAST - let dashboard handle it
      return true;
    } catch (err) {
      console.error("Failed to delete:", err);
      throw err; // Re-throw for dashboard to handle
    } finally {
      setSaving(false);
    }
  }, [products]);

  // Toggle hidden (syncs with backend via dedicated visibility endpoint)
  const toggleHidden = useCallback(async (id: number): Promise<boolean> => {
    const product = products.find((p) => p.id === id);
    if (!product) return false;

    const newHidden = !product.hidden;
    // Optimistic update
    updateLocalProduct(id, { hidden: newHidden });

    try {
      // Use dedicated visibility endpoint - only updates IsHidden field
      // This preserves the original stock value
      const updated = await toggleMedicineVisibility(id, newHidden);
      
      const mapped = toDisplayMedicine(updated);
      
      // Update both products and savedProducts with server response
      setProducts((prev) => prev.map((p) => (p.id === id ? mapped : p)));
      setSavedProducts((prev) => prev.map((p) => (p.id === id ? mapped : p)));
      
      // Update localStorage cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as MedicineDisplay[];
        localStorage.setItem(CACHE_KEY, JSON.stringify(
          parsed.map((p) => (p.id === id ? mapped : p))
        ));
      }
      
      return true;
    } catch (err) {
      console.error("Toggle hidden failed:", err);
      // Revert on error
      updateLocalProduct(id, { hidden: !newHidden });
      throw err; // Re-throw for dashboard to handle
    }
  }, [products, updateLocalProduct]);

  // Save all dirty changes
  const saveAll = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    
    setSaving(true);
    try {
      const savedMap = new Map(savedProducts.map((s) => [s.id, s]));
      const updatedList: MedicineDisplay[] = [];

      for (const p of products) {
        const saved = savedMap.get(p.id);
        const needsUpdate = saved && (
          saved.name !== p.name ||
          saved.price !== p.price ||
          saved.stock !== p.stock ||
          saved.categoryId !== p.categoryId
          // Note: image changes are handled separately via file uploads
        );

        if (needsUpdate) {
          try {
            const updated = await updateProduct(p.id, {
              name: p.name,
              price: p.price,
              stock: p.stock,
              categoryId: p.categoryId ?? null,
              imageFile: null, // only explicit image changes trigger file upload
            });
            updatedList.push(updated ?? p);
          } catch {
            updatedList.push(p);
          }
        } else {
          updatedList.push(p);
        }
      }

      setProducts(updatedList);
      setSavedProducts(updatedList);
      localStorage.setItem(CACHE_KEY, JSON.stringify(updatedList));
      // NO TOAST - let dashboard handle it
      return true;
    } catch (err) {
      console.error("Failed to save changes:", err);
      throw err; // Re-throw for dashboard to handle
    } finally {
      setSaving(false);
    }
  }, [isDirty, products, savedProducts, updateProduct]);

  // Update product image (uploads file to backend)
  const updateProductImage = useCallback(async (id: number, imageFile: File): Promise<boolean> => {
    const product = products.find((p) => p.id === id);
    if (!product) return false;

    setSaving(true);
    try {
      const updated = await updateMedicine(id, {
        name: product.name,
        price: product.price,
        quantity: product.stock,
        categoryId: product.categoryId ?? null,
        imageFile,
      });
      const mapped = toDisplayMedicine(updated);
      
      setProducts((prev) => prev.map((p) => (p.id === id ? mapped : p)));
      setSavedProducts((prev) => prev.map((p) => (p.id === id ? mapped : p)));
      
      // Update cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as MedicineDisplay[];
        localStorage.setItem(CACHE_KEY, JSON.stringify(
          parsed.map((p) => (p.id === id ? mapped : p))
        ));
      }
      
      // NO TOAST - let dashboard handle it
      return true;
    } catch (err) {
      console.error("Image upload failed:", err);
      throw err; // Re-throw for dashboard to handle
    } finally {
      setSaving(false);
    }
  }, [products]);

  return {
    products,
    savedProducts,
    loading,
    saving,
    error,
    isDirty,
    reload,
    undo,
    updateLocalProduct,
    createProduct,
    updateProduct,
    updateProductImage,
    removeProduct,
    toggleHidden,
    saveAll,
    setProducts,
  };
}
