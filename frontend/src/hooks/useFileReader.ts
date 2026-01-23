// src/hooks/useFileReader.ts
import { useCallback } from "react";

export function useFileReader() {
  const readAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  return { readAsBase64 };
}
