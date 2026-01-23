// src/Components/dashboard/NewProductForm.tsx
import React, { useState } from "react";
import { ImageUploader } from "../ui/ImageUploader";
import type { Category } from "../../Services/CategoryService";

interface NewProductFormProps {
  saving?: boolean;
  darkMode?: boolean;
  categories?: Category[];
  onAdd: (product: {
    name: string;
    price: number;
    stock: number;
    categoryId: number | null;
    imageFile: File | null;
  }) => void;
}

export function NewProductForm({ 
  saving = false, 
  darkMode = false, 
  categories = [],
  onAdd 
}: NewProductFormProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [stock, setStock] = useState<string>("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string }>({});

  const handleImageChange = (file: File | null, preview: string) => {
    setImageFile(file);
    setImagePreview(preview);
  };

  const validate = (): boolean => {
    const newErrors: { name?: string; price?: string; stock?: string } = {};
    
    if (!name.trim()) {
      newErrors.name = "Name is required";
    }
    
    const priceNum = parseFloat(price);
    if (!price || isNaN(priceNum) || priceNum < 0) {
      newErrors.price = "Valid price required";
    }
    
    const stockNum = parseInt(stock, 10);
    if (!stock || isNaN(stockNum) || stockNum < 0) {
      newErrors.stock = "Valid quantity required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;
    
    onAdd({
      name: name.trim(),
      price: parseFloat(price),
      stock: parseInt(stock, 10),
      categoryId,
      imageFile,
    });
    
    // Reset form
    setName("");
    setPrice("");
    setStock("");
    setCategoryId(null);
    setImageFile(null);
    setImagePreview("");
    setErrors({});
  };

  return (
    <div className="flex flex-wrap items-start gap-4 p-4 mb-6 rounded-xl shadow-md bg-green-50 dark:bg-gray-800">
      <ImageUploader
        image={imagePreview}
        onChange={(base64) => {
          // We need the actual file, not base64 - this is handled via onFileSelect
          setImagePreview(base64);
        }}
        onFileSelect={handleImageChange}
        onRemove={() => {
          setImageFile(null);
          setImagePreview("");
        }}
        variant="dashed"
        darkMode={darkMode}
      />

      <div className="flex flex-col justify-center flex-1 min-w-[200px]">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Medicine Name <span className="text-red-500">*</span>
        </label>
        <input
          placeholder="Medicine name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          className={`w-full h-8 px-3 rounded-md border ${
            errors.name 
              ? "border-red-500" 
              : "border-gray-200 dark:border-gray-700"
          } bg-white dark:bg-gray-800`}
        />
        {errors.name && <span className="text-xs text-red-500 mt-1">{errors.name}</span>}
      </div>

      <div className="flex flex-col items-center justify-center">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Price <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center h-8">
          <span className="mr-1">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
            }}
            className={`w-28 text-center rounded-md px-2 py-1 border ${
              errors.price
                ? "border-red-500"
                : "border-gray-200 dark:border-gray-700"
            } bg-white dark:bg-gray-800`}
          />
        </div>
        {errors.price && <span className="text-xs text-red-500 mt-1">{errors.price}</span>}
      </div>

      <div className="flex flex-col items-center justify-center">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Stock <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={stock}
          onChange={(e) => {
            setStock(e.target.value);
            if (errors.stock) setErrors((prev) => ({ ...prev, stock: undefined }));
          }}
          className={`w-24 h-8 text-center rounded-md px-2 py-1 border ${
            errors.stock
              ? "border-red-500"
              : "border-gray-200 dark:border-gray-700"
          } bg-white dark:bg-gray-800`}
        />
        {errors.stock && <span className="text-xs text-red-500 mt-1">{errors.stock}</span>}
      </div>

      <div className="flex flex-col items-center justify-center">
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</label>
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value ? parseInt(e.target.value, 10) : null)}
          className="h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">Uncategorized</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleAdd}
        disabled={saving}
        className="px-4 py-2 h-8 mt-5 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}
