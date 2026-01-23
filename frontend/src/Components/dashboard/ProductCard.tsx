// src/Components/dashboard/ProductCard.tsx
/**
 * ProductCard Component
 * 
 * Displays a medicine/product with editing capabilities.
 * 
 * Low Stock Logic:
 * - A medicine is considered "low stock" when stock < 30
 * - Low stock items are highlighted with an amber/warning badge
 * - This is the ONLY place low stock is displayed (removed from Admin header)
 */
import React from "react";
import { Eye, EyeOff, Minus, Plus, Trash2, Upload, AlertTriangle } from "lucide-react";
import type { MedicineDisplay } from "../../Services/MedicineService";
import type { Category } from "../../Services/CategoryService";

// Low stock threshold - medicines below this show warning
const LOW_STOCK_THRESHOLD = 30;

interface ProductCardProps {
  product: MedicineDisplay;
  darkMode?: boolean;
  categories?: Category[];
  onPriceChange: (id: number, value: string) => void;
  onStockChange: (id: number, value: string) => void;
  onStockIncrement: (id: number, delta: number) => void;
  onCategoryChange?: (id: number, categoryId: number | null) => void;
  onToggleHidden: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onImageChange: (id: number, file: File) => void;
}

export function ProductCard({
  product,
  darkMode = false,
  categories = [],
  onPriceChange,
  onStockChange,
  onStockIncrement,
  onCategoryChange,
  onToggleHidden,
  onDelete,
  onImageChange,
}: ProductCardProps) {

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImageChange(product.id, file);
    e.target.value = "";
  };

  // Check if product has low stock
  const isLowStock = product.stock < LOW_STOCK_THRESHOLD;

  const bgClass = product.hidden
    ? "opacity-60"
    : darkMode
    ? "bg-gray-900"
    : "bg-white";

  const imageBgClass = darkMode
    ? "bg-[radial-gradient(circle_at_center,#2d2d30,#1f1f22,#141416)]"
    : "bg-[radial-gradient(circle_at_center,#f2f3f4,#e9eaec,#d4d5d6)]";

  // Build full image URL if it's a relative path
  const imageUrl = product.image
    ? product.image.startsWith("http") || product.image.startsWith("data:")
      ? product.image
      : `${process.env.REACT_APP_API_BASE || "http://localhost:5057"}${product.image}`
    : "";

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl shadow-md ${bgClass}`}>
      {/* Image */}
      <div
        className={`relative flex items-center justify-center h-28 w-28 rounded-lg flex-shrink-0 overflow-hidden group ${imageBgClass}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="max-h-24 max-w-24 object-contain drop-shadow-xl transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="text-xs text-gray-400">No image</div>
        )}
        <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 text-white">
          <Upload className="h-6 w-6 mb-1" />
          <span className="text-xs">Change</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {/* Name & ID & Category */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-base truncate">{product.name}</h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">ID: {product.id}</div>
        {onCategoryChange && (
          <select
            value={product.categoryId ?? ""}
            onChange={(e) => onCategoryChange(product.id, e.target.value ? parseInt(e.target.value, 10) : null)}
            className="mt-1 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <option value="">Uncategorized</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Price */}
      <div className="w-48 flex flex-col items-center">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Price</label>
        <div className="flex items-center">
          <span className="mr-1">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={Number(product.price).toFixed(2)}
            onChange={(e) => onPriceChange(product.id, e.target.value)}
            className="w-28 text-center rounded-md px-2 py-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      {/* Stock */}
      <div className="w-40 flex flex-col items-center">
        <label className={`text-xs mb-1 flex items-center gap-1 ${
          isLowStock 
            ? "text-amber-600 dark:text-amber-400 font-medium" 
            : "text-gray-500 dark:text-gray-400"
        }`}>
          {isLowStock && <AlertTriangle className="h-3 w-3" />}
          Stock {isLowStock && "(Low!)"}
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onStockIncrement(product.id, -1)}
            className="p-1 rounded bg-gray-200 dark:bg-gray-700"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min="0"
            value={product.stock}
            onChange={(e) => onStockChange(product.id, e.target.value)}
            className={`w-20 text-center rounded-md px-2 py-1 border ${
              isLowStock
                ? "border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            }`}
          />
          <button
            onClick={() => onStockIncrement(product.id, 1)}
            className="p-1 rounded bg-gray-200 dark:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {/* Low Stock Badge */}
        {isLowStock && (
          <span className="mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            Restock needed
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center justify-end self-end mt-2 gap-2">
        <button
          onClick={() => onToggleHidden(product.id)}
          className={`p-2 rounded-md transition ${
            product.hidden
              ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
              : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
          title={product.hidden ? "Show product" : "Hide product"}
        >
          {product.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          onClick={() => onDelete(product.id, product.name)}
          className={`p-2 rounded-md hover:bg-red-100 ${
            darkMode ? "bg-transparent" : "bg-red-50"
          }`}
        >
          <Trash2 className={`h-4 w-4 ${darkMode ? "text-red-300" : "text-red-600"}`} />
        </button>
      </div>
    </div>
  );
}
