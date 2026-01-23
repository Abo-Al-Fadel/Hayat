// src/Components/ui/Spinner.tsx
import React from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-3",
};

export function Spinner({ size = "sm", className = "" }: SpinnerProps) {
  return (
    <div
      className={`inline-block border-t-transparent border-white/60 rounded-full animate-spin ${sizeClasses[size]} ${className}`}
    />
  );
}
