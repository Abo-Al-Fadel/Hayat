// src/hooks/useConfirmModal.ts
import { useState, useEffect, useCallback } from "react";

interface ConfirmState<T = any> {
  isOpen: boolean;
  target: T | null;
  targetName: string;
  loading: boolean;
}

export function useConfirmModal<T = any>() {
  const [state, setState] = useState<ConfirmState<T>>({
    isOpen: false,
    target: null,
    targetName: "",
    loading: false,
  });

  const open = useCallback((target: T, name: string = "") => {
    setState({
      isOpen: true,
      target,
      targetName: name,
      loading: false,
    });
  }, []);

  const close = useCallback(() => {
    setState({
      isOpen: false,
      target: null,
      targetName: "",
      loading: false,
    });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  // ESC key handler and body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isOpen) close();
    };

    document.addEventListener("keydown", onKey);
    
    if (state.isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state.isOpen, close]);

  return {
    isOpen: state.isOpen,
    target: state.target,
    targetName: state.targetName,
    loading: state.loading,
    open,
    close,
    setLoading,
  };
}
