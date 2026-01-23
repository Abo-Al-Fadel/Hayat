// src/Components/ui/ImageUploader.tsx
import React from "react";
import { Upload, X } from "lucide-react";
import { useFileReader } from "../../hooks/useFileReader";

interface ImageUploaderProps {
  image?: string;
  onChange: (base64: string) => void;
  onFileSelect?: (file: File | null, base64: string) => void; // Optional: get the actual file
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "dashed";
  darkMode?: boolean;
}

const sizeClasses = {
  sm: "h-20 w-20",
  md: "h-24 w-24",
  lg: "h-28 w-28",
};

export function ImageUploader({
  image,
  onChange,
  onFileSelect,
  onRemove,
  size = "md",
  variant = "default",
  darkMode = false,
}: ImageUploaderProps) {
  const { readAsBase64 } = useFileReader();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const base64 = await readAsBase64(file);
      onChange(base64);
      // Also provide the file if callback exists
      if (onFileSelect) {
        onFileSelect(file, base64);
      }
    } catch (err) {
      console.error("Failed to read file:", err);
    }
    
    // Reset input
    e.target.value = "";
  };

  const baseClasses = `relative rounded-lg flex-shrink-0 overflow-visible ${sizeClasses[size]}`;
  const borderClasses = variant === "dashed" 
    ? "border-2 border-dashed border-green-400" 
    : "";
  const bgClasses = darkMode 
    ? "bg-[radial-gradient(circle_at_center,#2d2d30,#1f1f22,#141416)]" 
    : "bg-[radial-gradient(circle_at_center,#f2f3f4,#e9eaec,#d4d5d6)]";

  if (image) {
    return (
      <div className={`${baseClasses} ${borderClasses} ${variant === "dashed" ? "bg-white dark:bg-gray-700" : bgClasses} group`}>
        <img
          src={image}
          alt="Preview"
          className="h-full w-full object-contain p-2"
        />

        {/* Hover overlay to change image */}
        <label className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
          <div className="flex flex-col items-center text-white">
            <Upload className="h-6 w-6 mb-1" />
            <span className="text-xs">Change</span>
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {/* Remove button */}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove image"
            title="Remove image"
            type="button"
            className="absolute -top-3 -right-3 z-30 flex items-center justify-center rounded-full border-2 border-dashed border-green-400 h-7 w-7 shadow-sm hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50"
          >
            <div className="flex items-center justify-center rounded-full bg-red-600 h-6 w-6">
              <X
                className="h-4 w-4 text-white"
                strokeWidth={2.5}
                style={{ strokeLinecap: "butt", strokeLinejoin: "miter" }}
                aria-hidden="true"
              />
            </div>
          </button>
        )}
      </div>
    );
  }

  // Empty state - upload prompt
  return (
    <div className={`${baseClasses} ${borderClasses} ${variant === "dashed" ? "bg-white dark:bg-gray-700" : bgClasses}`}>
      <label className="flex flex-col items-center justify-center cursor-pointer h-full w-full text-xs text-green-600">
        <Upload className="h-6 w-6 mb-1" />
        Upload
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
    </div>
  );
}
